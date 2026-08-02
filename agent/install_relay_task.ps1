<#
.SYNOPSIS
    Registers KynrenRelayAgent.exe as a Windows Scheduled Task so it starts automatically
    without needing a console window left open.

.DESCRIPTION
    Run this as Administrator, from the same folder as KynrenRelayAgent.exe. Configure the agent
    by running the .exe by hand once first (it prompts for the server URL and agent API key and
    writes .env next to itself) before registering the task.

    A Scheduled Task is used deliberately instead of a Windows Service: it runs the exe "at log
    on" in the same interactive user context that's already proven to connect fine, rather than a
    Service's LocalSystem context, which has a different (and sometimes more restricted) network
    identity — that mismatch is what made the old Windows Service packaging fail silently on some
    networks.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File install_relay_task.ps1
#>

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$exePath = Join-Path $scriptDir "KynrenRelayAgent.exe"
if (-not (Test-Path $exePath)) {
    throw "KynrenRelayAgent.exe not found in $scriptDir. Run this script from the same folder as the .exe."
}
if (-not (Test-Path (Join-Path $scriptDir ".env"))) {
    throw ".env not found in $scriptDir. Run KynrenRelayAgent.exe by hand once first to configure the server URL and agent API key, then re-run this script."
}

$taskName = "KynrenNetworkRelayAgent"
$action = New-ScheduledTaskAction -Execute $exePath -WorkingDirectory $scriptDir
$triggerLogon = New-ScheduledTaskTrigger -AtLogOn

# Interactive (not ServiceAccount) so it runs as the logged-on user, not LocalSystem. No
# execution time limit — this is a permanently running loop, not a task that's meant to finish.
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
    -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $triggerLogon -Principal $principal -Settings $settings -Force

Write-Host "Registered scheduled task '$taskName' to run KynrenRelayAgent.exe at logon." -ForegroundColor Green
Write-Host "Run 'schtasks /Run /TN $taskName' to start it immediately for testing."
Write-Host "Check network_relay.log in $scriptDir afterward to confirm it's polling."
