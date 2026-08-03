"""
Kynren Asset Register — Network Relay Agent, packaged as a real Windows Service.

kynren_network_relay.py already runs fine as a plain console script (via Task Scheduler "At
startup", per install_task.ps1's convention for the other agent) — this wrapper exists for the
cases that actually need real Windows Service semantics: starting before any user logs on, and
Windows automatically restarting it if it crashes (configurable via `sc.exe failure`, not
something Task Scheduler offers). It runs the exact same run_loop() from kynren_network_relay.py
in a background thread; SvcStop() sets a threading.Event that loop checks between poll cycles for
a clean shutdown instead of being killed mid-request.

Install (run as Administrator, from this directory, with the venv/interpreter that has both
requests/python-dotenv AND pywin32 installed):
    python kynren_network_relay_service.py install
    python kynren_network_relay_service.py start

Other commands: stop, remove, restart — see `python kynren_network_relay_service.py` with no
arguments for the full pywin32-generated command list. Or use install_relay_service.ps1, which
wraps install+start into one step matching install_task.ps1's pattern for the other agent.
"""

import sys
import threading
from pathlib import Path

import servicemanager
import win32event
import win32service
import win32serviceutil

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

import kynren_network_relay as relay  # noqa: E402


class KynrenNetworkRelayService(win32serviceutil.ServiceFramework):
    _svc_name_ = "KynrenNetworkRelayAgent"
    _svc_display_name_ = "Kynren Network Relay Agent"
    _svc_description_ = (
        "Polls the Kynren Asset Register server for queued network scan jobs and runs them "
        "against this machine's local LAN — see agent/README.md for the on-prem relay agent."
    )

    def __init__(self, args):
        win32serviceutil.ServiceFramework.__init__(self, args)
        self.hWaitStop = win32event.CreateEvent(None, 0, 0, None)
        self.stop_flag = threading.Event()
        self.worker: threading.Thread | None = None

    def SvcStop(self):
        self.ReportServiceStatus(win32service.SERVICE_STOP_PENDING)
        self.stop_flag.set()
        win32event.SetEvent(self.hWaitStop)
        if self.worker:
            self.worker.join(timeout=10)

    def SvcDoRun(self):
        servicemanager.LogMsg(servicemanager.EVENTLOG_INFORMATION_TYPE, servicemanager.PYS_SERVICE_STARTED, (self._svc_name_, ""))
        logger, log_buffer = relay.setup_logging()

        class _Args:
            api_base_url = None
            api_key = None

        try:
            api_base_url, api_key = relay.load_config(_Args())
        except SystemExit as exc:
            logger.error(str(exc))
            servicemanager.LogErrorMsg(f"Kynren Network Relay Agent: {exc}")
            return

        logger.info(f"Kynren Network Relay Agent v{relay.AGENT_VERSION} (Windows Service) — polling {api_base_url} every {relay.POLL_INTERVAL_SECONDS}s")
        self.worker = threading.Thread(
            target=relay.run_loop,
            args=(api_base_url, api_key, logger, self.stop_flag),
            kwargs={"log_buffer": log_buffer},
            daemon=True,
        )
        self.worker.start()

        win32event.WaitForSingleObject(self.hWaitStop, win32event.INFINITE)
        logger.info("Service stop requested — waiting for current cycle to finish.")


if __name__ == "__main__":
    win32serviceutil.HandleCommandLine(KynrenNetworkRelayService)
