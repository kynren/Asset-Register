<#
.SYNOPSIS
    Registers the Kynren Asset Register device agent as a Windows Scheduled Task.

.DESCRIPTION
    Run this script as Administrator on each client machine after installing
    Python and the agent's dependencies (see README.md). It creates a task
    that runs kynren_agent.py once at logon and then every 4 hours.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File install_task.ps1
#>

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$agentScript = Join-Path $scriptDir "kynren_agent.py"
$pythonExe = (Get-Command python -ErrorAction SilentlyContinue).Source
if (-not $pythonExe) {
    $pythonExe = (Get-Command py -ErrorAction SilentlyContinue).Source
}
if (-not $pythonExe) {
    throw "Python was not found on PATH. Install Python 3.10+ before running this script."
}

$taskName = "KynrenAssetAgent"
$action = New-ScheduledTaskAction -Execute $pythonExe -Argument "`"$agentScript`"" -WorkingDirectory $scriptDir

$triggerLogon = New-ScheduledTaskTrigger -AtLogOn
$triggerInterval = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Hours 4) -RepetitionDuration ([TimeSpan]::MaxValue)

$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger @($triggerLogon, $triggerInterval) -Principal $principal -Settings $settings -Force

Write-Host "Registered scheduled task '$taskName' to run at logon and every 4 hours." -ForegroundColor Green
Write-Host "Run 'schtasks /Run /TN $taskName' to trigger it immediately for testing."
