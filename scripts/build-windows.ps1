<#
.SYNOPSIS
Build an unsigned Windows installer from the current checkout, without publishing.
.DESCRIPTION
Synchronizes dependencies from the lockfile and delegates compilation and payload
validation to build-desktop-artifact.ts. Each run has its own release directory
and transcript. Requires the tools in docs/operations/development.md.
.PARAMETER Arch
Installer architecture, x64 by default. ARM64 requires the matching build tools.
.PARAMETER Help
Show usage without installing dependencies or building.
.EXAMPLE
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/build-windows.ps1
#>
[CmdletBinding()]
param(
    [ValidateSet('x64', 'arm64')]
    [string]$Arch = 'x64',
    [switch]$Help
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-BuildCommand {
    <#
    .SYNOPSIS
    Run a native tool, capture both streams in the transcript, and fail on nonzero exit.
    .PARAMETER Command
    Executable available on PATH.
    .PARAMETER Arguments
    Arguments passed directly to the executable, without shell string evaluation.
    #>
    param([string]$Command, [string[]]$Arguments)

    # Windows PowerShell represents redirected stderr as ErrorRecord objects.
    # A tool may write progress there; its exit code determines success.
    $ErrorActionPreference = 'Continue'
    & $Command @Arguments 2>&1 | Out-Host
    if ($LASTEXITCODE -ne 0) {
        throw "$Command failed (exit $LASTEXITCODE). See the tool output above."
    }
}

if ($Help) {
    Write-Host 'Usage: build-windows.cmd [-Arch x64|arm64]'
    Write-Host 'Builds current sources into release/windows-<arch>-<timestamp>/.'
    Write-Host 'Requires Node (package.json engines), Vite+, Rust, Python 3 and MSVC.'
    Write-Host 'See docs/operations/development.md#windows-installer-prerequisites.'
    Write-Host 'Output: unsigned NSIS installer, without an embedded WSL runtime.'
    exit 0
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$transcriptStarted = $false
$exitCode = 1
$savedEnvironment = @{}

try {
    if ($env:OS -ne 'Windows_NT') {
        throw 'Run this script on Windows.'
    }
    foreach ($command in @('node', 'vp', 'git', 'cargo', 'rustup')) {
        if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
            throw "Missing command: $command. See docs/operations/development.md."
        }
    }

    Push-Location -LiteralPath $repoRoot
    try {
        $runName = 'windows-{0}-{1}' -f $Arch, (Get-Date -Format 'yyyyMMdd-HHmmss-fff')
        $outputDir = Join-Path $repoRoot "release/$runName"
        New-Item -ItemType Directory -Path $outputDir -ErrorAction Stop | Out-Null
        Start-Transcript -Path (Join-Path $outputDir 'build.log') | Out-Null
        $transcriptStarted = $true

        # Ambient release settings must not turn a local rebuild into a stale,
        # signed, or mock build. Restore the caller's values even after failure.
        foreach ($name in @(
            'T3CODE_DESKTOP_SKIP_BUILD',
            'T3CODE_DESKTOP_REUSE_RESOURCE_MONITOR',
            'T3CODE_DESKTOP_SIGNED',
            'T3CODE_DESKTOP_MOCK_UPDATES',
            'T3CODE_DESKTOP_WSL_RUNTIME'
        )) {
            $savedEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
            $value = if ($name -eq 'T3CODE_DESKTOP_WSL_RUNTIME') { $null } else { 'false' }
            [Environment]::SetEnvironmentVariable($name, $value, 'Process')
        }

        Write-Host '[1/2] Synchronizing dependencies from pnpm-lock.yaml...'
        Invoke-BuildCommand -Command 'vp' -Arguments @('install', '--frozen-lockfile')

        Write-Host '[2/2] Compiling and packaging the current sources...'
        Invoke-BuildCommand -Command 'node' -Arguments @(
            'scripts/build-desktop-artifact.ts', '--platform', 'win', '--target', 'nsis',
            '--arch', $Arch, '--output-dir', $outputDir, '--verbose'
        )

        $installers = @(Get-ChildItem -LiteralPath $outputDir -Filter '*.exe' -File)
        if ($installers.Count -eq 0) {
            throw "Packaging returned success but produced no installer in $outputDir."
        }
        Write-Host "Build succeeded. Installer(s):"
        $installers | ForEach-Object { Write-Host $_.FullName }
        $exitCode = 0
    }
    finally {
        Pop-Location
    }
}
catch {
    Write-Host "Build failed: $($_.Exception.Message)" -ForegroundColor Red
    if ($transcriptStarted) {
        Write-Host "Build log: $(Join-Path $outputDir 'build.log')"
    }
}
finally {
    foreach ($name in $savedEnvironment.Keys) {
        [Environment]::SetEnvironmentVariable($name, $savedEnvironment[$name], 'Process')
    }
    if ($transcriptStarted) {
        Stop-Transcript | Out-Null
    }
}

exit $exitCode
