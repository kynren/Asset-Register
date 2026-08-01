<#
.SYNOPSIS
    Registers the Kynren Network Relay Agent as a real Windows Service.

.DESCRIPTION
    Run this script as Administrator on the on-prem relay machine after installing Python and
    the agent's dependencies, including pywin32 (see requirements-network-relay.txt and
    README.md). Unlike install_task.ps1 (Scheduled Task, used by the other agent), this gives the
    relay real Windows Service semantics: it starts before any user logs on, and Windows can
    automatically restart it if it crashes.

    If you'd rather keep it as a simple console job under Task Scheduler instead, that already
    works fine too — just run kynren_network_relay.py directly and skip this script entirely.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File install_relay_service.ps1
#>

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$serviceScript = Join-Path $scriptDir "kynren_network_relay_service.py"
$pythonExe = (Get-Command python -ErrorAction SilentlyContinue).Source
if (-not $pythonExe) {
    $pythonExe = (Get-Command py -ErrorAction SilentlyContinue).Source
}
if (-not $pythonExe) {
    throw "Python was not found on PATH. Install Python 3.10+ and pip install -r requirements-network-relay.txt before running this script."
}

if (-not (Test-Path (Join-Path $scriptDir ".env"))) {
    throw "agent\.env not found. Copy .env.example to .env and set API_BASE_URL/AGENT_API_KEY first — the service reads the same .env as the console script."
}

& $pythonExe $serviceScript --startup auto install
& $pythonExe $serviceScript start

Write-Host "Installed and started the 'KynrenNetworkRelayAgent' Windows Service (startup: automatic)." -ForegroundColor Green
Write-Host "Check status with: Get-Service KynrenNetworkRelayAgent"
Write-Host "Logs still go to network_relay.log in this directory, same as running it directly."
Write-Host "To configure auto-restart on crash: sc.exe failure KynrenNetworkRelayAgent reset= 86400 actions= restart/60000/restart/60000/restart/60000"
