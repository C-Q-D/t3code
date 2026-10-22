<#
.SYNOPSIS
Brings the desktop dev app's main window to the foreground so Chromium paints it again.

.DESCRIPTION
Called by scripts/lib/desktop-cdp.ts when Page.bringToFront leaves the page hidden. That happens
when the window is minimized or covered: Chromium's occlusion tracking then reports the page as
hidden, stops painting (screenshots hang) and throttles requestAnimationFrame. Windows only lets a
process take the foreground right after input, hence the synthetic Alt press. The window is
matched by process id and exact title together because the same Electron process also owns the
DevTools window. Runs on Windows PowerShell 5.1, which every Windows host has.

.PARAMETER ProcessId
Id of the Electron browser process (CDP SystemInfo.getProcessInfo, type "browser").

.PARAMETER Title
Exact title of the window to raise.
#>
param(
    [Parameter(Mandatory)][int] $ProcessId,
    [Parameter(Mandatory)][string] $Title
)

$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class DesktopWindowFront
{
    private delegate bool EnumWindowsProc(IntPtr window, IntPtr parameter);

    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr parameter);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowText(IntPtr window, StringBuilder text, int maxCount);

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);

    [DllImport("user32.dll")]
    private static extern bool IsIconic(IntPtr window);

    [DllImport("user32.dll")]
    private static extern bool ShowWindow(IntPtr window, int command);

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr window);

    [DllImport("user32.dll")]
    private static extern void keybd_event(byte virtualKey, byte scanCode, uint flags, UIntPtr extraInfo);

    private const int ShowRestore = 9;
    private const byte AltKey = 0x12;
    private const uint KeyUp = 0x0002;

    // Returns IntPtr.Zero when no top-level window of that process has exactly that title.
    public static IntPtr Find(uint processId, string title)
    {
        IntPtr found = IntPtr.Zero;
        EnumWindows((window, parameter) =>
        {
            uint owner;
            GetWindowThreadProcessId(window, out owner);
            if (owner != processId) return true;
            var text = new StringBuilder(512);
            GetWindowText(window, text, text.Capacity);
            if (text.ToString() != title) return true;
            found = window;
            return false;
        }, IntPtr.Zero);
        return found;
    }

    // Restores only a minimized window so a maximized one stays maximized.
    public static bool Raise(IntPtr window)
    {
        if (IsIconic(window)) ShowWindow(window, ShowRestore);
        keybd_event(AltKey, 0, 0, UIntPtr.Zero);
        keybd_event(AltKey, 0, KeyUp, UIntPtr.Zero);
        return SetForegroundWindow(window);
    }
}
'@

$window = [DesktopWindowFront]::Find([uint32]$ProcessId, $Title)
if ($window -eq [IntPtr]::Zero) {
    [Console]::Error.WriteLine("No window titled '$Title' belongs to process $ProcessId.")
    exit 1
}
if (-not [DesktopWindowFront]::Raise($window)) {
    [Console]::Error.WriteLine("Windows refused to bring the '$Title' window to the foreground.")
    exit 1
}
