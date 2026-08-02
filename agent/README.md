# Kynren Asset Register — Agents

Two standalone Python scripts live in this folder, sharing the same `.env`
(`API_BASE_URL` + `AGENT_API_KEY`) but doing very different jobs:

- **`kynren_agent.py`** — the *device agent*. Runs on each individual client
  machine and reports about itself (hostname, MAC, hardware, battery, etc).
- **`kynren_network_relay.py`** — the *network relay agent*. Runs on one
  machine inside your office LAN and scans *other* devices on the network on
  the server's behalf. See its own section below — most deployments won't
  need it.

## Device Agent (`kynren_agent.py`)

A small Python script that reports a machine's hostname, IP address(es), MAC
address, OS, CPU, RAM, disk info, and (on Windows) manufacturer/model/serial
number to the Asset Register API. Reported devices show up under
**Network Topology Map → Devices** and can be linked to an asset record.

Browsers cannot read a MAC address or hardware serial number for security
reasons, which is why this runs as a standalone script on each machine
rather than in the web app itself.

### Setup

1. Install Python 3.10+ on the client machine.
2. Install dependencies:
   ```
   pip install -r requirements.txt
   ```
3. Copy `.env.example` to `.env` and fill in:
   - `API_BASE_URL` — the Asset Register server's URL (e.g. `http://your-server:4000`)
   - `AGENT_API_KEY` — generate one under **Admin & Setup → System Settings → Agent API Keys**
     in the web app, then paste it here.
4. Run it once to test:
   ```
   python kynren_agent.py
   ```
   Check the app's Network Topology Map → Devices tab — the machine should appear.

### Scheduling

To run automatically, register it as a Windows Scheduled Task (run at logon
and every 4 hours) with the included helper:

```
powershell -ExecutionPolicy Bypass -File install_task.ps1
```

Run as Administrator. Adjust the interval in `install_task.ps1` if needed, or
manage the task afterwards via Task Scheduler (`taskschd.msc`) under the name
`KynrenAssetAgent`.

### Logs

Each run appends to `agent.log` in this folder (rotated at ~1MB, 3 backups
kept) — check it if a device isn't showing up as expected.

### Notes

- Manufacturer/model/serial number collection uses Windows Management
  Instrumentation (`wmi` / `pywin32`) and only works on Windows. On other
  platforms those fields are simply left blank.
- The agent identifies a device by its MAC address — re-running it just
  updates the existing device record's "last seen" time and details rather
  than creating duplicates.

## Network Relay Agent (`kynren_network_relay.py`)

If this app is hosted on a cloud VPS (e.g. the Hostinger deployment in
`DEPLOY.md`), it has **no network route into your office's private LAN**.
The IP Range Scanner, ICMP Pinger, and continuous Monitoring tab all need to
ping/ARP/SNMP-poll devices on that LAN directly — no code running on a
remote VPS can do that, regardless of how it's written, because there's no
network path there at all.

This script solves that: run it on one machine that's actually inside the
LAN (an old PC, a NUC, even a Raspberry Pi — anything that stays on), and it
polls the server for scan jobs, does the real network work locally, and
reports results back over the internet. **Skip this whole section** if the
app is self-hosted on a machine already inside your LAN — direct scanning
just works there.

### Windows: KynrenRelayAgent.exe (recommended)

For a Windows relay machine, `KynrenRelayAgent.exe` is a single, self-contained
executable — no Python install, no `pip install`, nothing else to set up
first. It's the same relay agent above, just packaged the way Tailscale's or
Domotz's own agent installers work.

1. Build it once (from a machine with Python 3.10+ and this folder's deps —
   see "Building the .exe" below), or grab a pre-built copy if your team
   already publishes one.
2. Copy `KynrenRelayAgent.exe` to the Windows machine that's on the target
   LAN and stays powered on.
3. Right-click it and choose **Run as administrator**. First run:
   - Prompts for the server URL and an agent key (generate one under
     **Admin & Setup → System Settings → Agent API Keys**, or **App Settings
     → System Settings → Agent API Keys** for a System Admin) and saves them
     to a `.env` file next to the `.exe`.
   - Installs and starts itself as a real Windows Service
     (`KynrenNetworkRelayAgent`, set to start automatically at boot) — no
     separate `install`/`start` step.
4. In the web app, check **"Route network scans through an on-prem relay
   agent"** under System Settings → Network Relay Agent, then run a scan from
   **Network Topology Map → IP Range Scanner** to confirm it picks the job up.

Once installed, manage it like any other Windows Service:
```
Get-Service KynrenNetworkRelayAgent
Restart-Service KynrenNetworkRelayAgent
```
Running the `.exe` again later (with `.env` already present) just reports
whether the service is installed/running and reinstalls it if not — safe to
re-run any time. `KynrenRelayAgent.exe install|start|stop|restart|remove|debug`
also works directly, same as running `kynren_network_relay_service.py
<command>` from Python would.

To reconfigure (new server URL or key), stop the service, delete the `.env`
next to the `.exe`, and run it again.

#### Building the .exe

From this `agent` folder, in a Python 3.10+ environment with the relay's
dependencies installed:
```
pip install -r requirements-network-relay.txt pyinstaller
pyinstaller relay_agent.spec --noconfirm
```
The output is `dist/KynrenRelayAgent.exe` — copy just that one file to the
target machine. `relay_agent.spec` bundles `kynren_relay_agent_main.py`
(which wraps `kynren_network_relay_service.py`'s Windows Service around
`kynren_network_relay.py`'s scan logic) plus every pywin32 module the service
wrapper needs — nothing else has to be installed on the target machine.

### Manual setup (any OS, or for development)

1. Install Python 3.10+ on a machine that's on the same LAN as the devices
   you want to monitor, and stays powered on.
2. Install dependencies (lighter than the device agent's — no `psutil`/`wmi`):
   ```
   pip install -r requirements-network-relay.txt
   ```
3. Copy `.env.example` to `.env` and fill in `API_BASE_URL` / `AGENT_API_KEY`
   exactly as for the device agent above (the same key works for both).
4. In the web app, go to **Admin & Setup → System Settings → Network Relay
   Agent** and check "Route network scans through an on-prem relay agent".
5. Start the relay — unlike the device agent, this one is a long-running
   loop, not a one-shot script:
   ```
   python kynren_network_relay.py
   ```
   Leave it running (a console window, `pythonw` in the background, a Task
   Scheduler task with no time limit, or wrap it as a Windows service with a
   tool like NSSM — any of these work equally well).
6. Run a scan from **Network Topology Map → IP Range Scanner** — it'll show
   "Queued..." until the relay picks it up, then run and complete normally.

### Scope

- Ping, ARP MAC lookup, reverse DNS, active NetBIOS name query, and common
  TCP port scanning all mirror the server's own direct-mode logic exactly.
- SNMP polling (for devices with it enabled in the Monitoring tab) fetches
  `sysDescr` and `sysUpTime` only — no interface-table walk. A device still
  shows as reachable with real uptime; the fuller per-interface view is a
  possible future enhancement, not something silently faked here.
- Hostname resolution doesn't cross-check the Kynren device agent's own
  reported hostnames (the relay has no database access) — only DNS and
  NetBIOS, versus the three-way fallback direct-mode scanning uses.

### Logs

Each run appends to `network_relay.log` in this folder (rotated at ~2MB, 3
backups kept).
