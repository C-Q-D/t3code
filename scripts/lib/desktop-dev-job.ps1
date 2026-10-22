<#
.SYNOPSIS
Process-ownership primitives for scripts/desktop-cdp.ts: put a process into a kill-on-close job,
read a process's identity, and end a process only if it is still the one that was recorded.

.DESCRIPTION
-Adopt creates a job object that ends every process in it once its last handle closes, puts
-ProcessId into it, and moves the only handle into -ProcessId itself. The job therefore lives
exactly as long as that process, and every process it starts afterwards is born inside the job,
including children that libuv's own job lets break away. scripts/lib/desktop-dev-keeper.ts adopts
itself this way before it starts dev-runner, so ending the keeper ends the whole tree; nothing
walks parent process ids, which Windows reuses. If moving the handle fails after the process was
put into the job, closing this script's handle ends that process too, so it never runs
unsupervised.

-Identify prints the creation time of -ProcessId as a FILETIME (100 ns ticks since 1601 UTC). The
id and creation time together name one process for good, while the id alone is reused.

-Stop ends -ProcessId only if its creation time still equals -CreatedAt, checked and terminated
through one process handle, so a process id reused by anything else is never touched. It waits
until the process has exited.

Exit codes: 0 done; 3 no running process with that id (for -Stop also: the id now belongs to a
process created at another time); 1 anything else, with the reason on stderr.
Runs on Windows PowerShell 5.1, which every Windows host has. PowerShell must have a console:
started without one (DETACHED_PROCESS) it exits 0 without running the script.

.PARAMETER Adopt
Put -ProcessId into a new kill-on-close job that it alone holds.

.PARAMETER Identify
Print the creation time of -ProcessId.

.PARAMETER Stop
Terminate -ProcessId if it is still the process created at -CreatedAt.

.PARAMETER ProcessId
Process to act on.

.PARAMETER CreatedAt
Creation time that -Identify printed for the process when it was recorded.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory, ParameterSetName = 'Adopt')][switch] $Adopt,
    [Parameter(Mandatory, ParameterSetName = 'Identify')][switch] $Identify,
    [Parameter(Mandatory, ParameterSetName = 'Stop')][switch] $Stop,
    [Parameter(Mandatory)][int] $ProcessId,
    [Parameter(Mandatory, ParameterSetName = 'Stop')][long] $CreatedAt
)

$ErrorActionPreference = 'Stop'

# How long -Stop waits for the terminated process to exit; termination is immediate in practice.
$StopWaitMillis = 10000
$NotRunningExitCode = 3

$NativeSource = @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;

public static class DesktopDevJob
{
    [StructLayout(LayoutKind.Sequential)]
    private struct BasicLimitInformation
    {
        public long PerProcessUserTimeLimit;
        public long PerJobUserTimeLimit;
        public uint LimitFlags;
        public UIntPtr MinimumWorkingSetSize;
        public UIntPtr MaximumWorkingSetSize;
        public uint ActiveProcessLimit;
        public UIntPtr Affinity;
        public uint PriorityClass;
        public uint SchedulingClass;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct IoCounters
    {
        public ulong ReadOperationCount;
        public ulong WriteOperationCount;
        public ulong OtherOperationCount;
        public ulong ReadTransferCount;
        public ulong WriteTransferCount;
        public ulong OtherTransferCount;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct ExtendedLimitInformation
    {
        public BasicLimitInformation BasicLimitInformation;
        public IoCounters IoInfo;
        public UIntPtr ProcessMemoryLimit;
        public UIntPtr JobMemoryLimit;
        public UIntPtr PeakProcessMemoryUsed;
        public UIntPtr PeakJobMemoryUsed;
    }

    private const int JobObjectExtendedLimitInformationClass = 9;
    private const uint JobObjectLimitKillOnJobClose = 0x00002000;
    private const uint ProcessTerminate = 0x0001;
    private const uint ProcessDupHandle = 0x0040;
    private const uint ProcessSetQuota = 0x0100;
    private const uint ProcessQueryLimitedInformation = 0x1000;
    private const uint Synchronize = 0x00100000;
    private const uint DuplicateSameAccess = 0x00000002;
    private const uint WaitObject0 = 0;
    private const int ErrorInvalidParameter = 87;

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern IntPtr CreateJobObject(IntPtr jobAttributes, string name);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool SetInformationJobObject(IntPtr job, int infoClass, ref ExtendedLimitInformation info, uint infoLength);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool DuplicateHandle(IntPtr sourceProcess, IntPtr sourceHandle, IntPtr targetProcess, out IntPtr targetHandle, uint desiredAccess, bool inheritHandle, uint options);

    [DllImport("kernel32.dll")]
    private static extern IntPtr GetCurrentProcess();

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr OpenProcess(uint access, bool inheritHandle, int processId);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GetProcessTimes(IntPtr process, out long creationTime, out long exitTime, out long kernelTime, out long userTime);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool TerminateProcess(IntPtr process, uint exitCode);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool CloseHandle(IntPtr handle);

    // Puts processId into a new kill-on-close job and leaves the only handle to that job inside
    // processId. The duplicated handle is not inheritable, so no child can keep the job alive.
    public static void Adopt(int processId)
    {
        IntPtr process = OpenProcess(ProcessSetQuota | ProcessTerminate | ProcessDupHandle, false, processId);
        if (process == IntPtr.Zero) throw new Win32Exception();
        IntPtr job = IntPtr.Zero;
        try
        {
            job = CreateJobObject(IntPtr.Zero, null);
            if (job == IntPtr.Zero) throw new Win32Exception();
            var limits = new ExtendedLimitInformation();
            limits.BasicLimitInformation.LimitFlags = JobObjectLimitKillOnJobClose;
            if (!SetInformationJobObject(job, JobObjectExtendedLimitInformationClass, ref limits, (uint)Marshal.SizeOf(typeof(ExtendedLimitInformation))))
            {
                throw new Win32Exception();
            }
            if (!AssignProcessToJobObject(job, process)) throw new Win32Exception();
            IntPtr handleInProcess;
            if (!DuplicateHandle(GetCurrentProcess(), job, process, out handleInProcess, 0, false, DuplicateSameAccess))
            {
                throw new Win32Exception();
            }
        }
        finally
        {
            if (job != IntPtr.Zero) CloseHandle(job);
            CloseHandle(process);
        }
    }

    // Creation time of processId as a FILETIME, or -1 when no running process has that id. An
    // exited process whose handle someone still holds keeps its id, so it counts as not running.
    public static long CreationTimeOf(int processId)
    {
        IntPtr process = Open(processId, ProcessQueryLimitedInformation | Synchronize);
        if (process == IntPtr.Zero) return -1;
        try
        {
            if (WaitForSingleObject(process, 0) == WaitObject0) return -1;
            return CreationTime(process);
        }
        finally
        {
            CloseHandle(process);
        }
    }

    // Terminates processId when it is still the process created at createdAt and waits up to
    // waitMillis for it to exit. Returns false when that process is already gone (no such id,
    // the id belongs to a process created at another time, or it has exited). Throws when it
    // cannot be ended or does not exit in time.
    public static bool StopIfSame(int processId, long createdAt, uint waitMillis)
    {
        IntPtr process = Open(processId, ProcessTerminate | ProcessQueryLimitedInformation | Synchronize);
        if (process == IntPtr.Zero) return false;
        try
        {
            if (CreationTime(process) != createdAt) return false;
            if (WaitForSingleObject(process, 0) == WaitObject0) return false;
            if (!TerminateProcess(process, 1))
            {
                int error = Marshal.GetLastWin32Error();
                // It may have exited on its own between the two calls.
                if (WaitForSingleObject(process, 0) == WaitObject0) return false;
                throw new Win32Exception(error);
            }
            if (WaitForSingleObject(process, waitMillis) != WaitObject0)
            {
                throw new TimeoutException("Process " + processId + " was terminated but had not exited after " + waitMillis + " ms.");
            }
            return true;
        }
        finally
        {
            CloseHandle(process);
        }
    }

    // IntPtr.Zero when no process has that id; throws on any other failure, such as access denied.
    private static IntPtr Open(int processId, uint access)
    {
        IntPtr process = OpenProcess(access, false, processId);
        if (process == IntPtr.Zero && Marshal.GetLastWin32Error() != ErrorInvalidParameter)
        {
            throw new Win32Exception();
        }
        return process;
    }

    private static long CreationTime(IntPtr process)
    {
        long creation, exit, kernel, user;
        if (!GetProcessTimes(process, out creation, out exit, out kernel, out user)) throw new Win32Exception();
        return creation;
    }
}
'@

try {
    Add-Type -TypeDefinition $NativeSource
    switch ($PSCmdlet.ParameterSetName) {
        'Adopt' {
            [DesktopDevJob]::Adopt($ProcessId)
            exit 0
        }
        'Identify' {
            $creationTime = [DesktopDevJob]::CreationTimeOf($ProcessId)
            if ($creationTime -lt 0) { exit $NotRunningExitCode }
            [Console]::Out.WriteLine($creationTime)
            exit 0
        }
        'Stop' {
            if ([DesktopDevJob]::StopIfSame($ProcessId, $CreatedAt, $StopWaitMillis)) { exit 0 }
            exit $NotRunningExitCode
        }
    }
}
catch {
    [Console]::Error.WriteLine("desktop-dev-job: $($_.Exception.Message)")
    exit 1
}
