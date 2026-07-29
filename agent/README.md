# Kynren Asset Register — Device Agent

A small Python script that reports a machine's hostname, IP address(es), MAC
address, OS, CPU, RAM, disk info, and (on Windows) manufacturer/model/serial
number to the Asset Register API. Reported devices show up under
**Network Topology Map → Devices** and can be linked to an asset record.

Browsers cannot read a MAC address or hardware serial number for security
reasons, which is why this runs as a standalone script on each machine
rather than in the web app itself.

## Setup

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

## Scheduling

To run automatically, register it as a Windows Scheduled Task (run at logon
and every 4 hours) with the included helper:

```
powershell -ExecutionPolicy Bypass -File install_task.ps1
```

Run as Administrator. Adjust the interval in `install_task.ps1` if needed, or
manage the task afterwards via Task Scheduler (`taskschd.msc`) under the name
`KynrenAssetAgent`.

## Logs

Each run appends to `agent.log` in this folder (rotated at ~1MB, 3 backups
kept) — check it if a device isn't showing up as expected.

## Notes

- Manufacturer/model/serial number collection uses Windows Management
  Instrumentation (`wmi` / `pywin32`) and only works on Windows. On other
  platforms those fields are simply left blank.
- The agent identifies a device by its MAC address — re-running it just
  updates the existing device record's "last seen" time and details rather
  than creating duplicates.
