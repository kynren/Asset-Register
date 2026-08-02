"""
Kynren Network Relay Agent — single-file Windows entry point.

This is the module PyInstaller freezes into KynrenRelayAgent.exe (see relay_agent.spec). It wraps
kynren_network_relay_service.py's Windows Service with the one thing a raw pywin32 service script
doesn't give you: a "just works" double-click experience, the way Tailscale's or Domotz's agent
installers behave — no separate Python install, no manually running `install` then `start` from an
Administrator console.

Double-click with no arguments (or run elevated with no arguments):
  - First run (no .env next to the .exe yet): prompts for the two required values (server URL +
    agent key, both shown under Admin & Setup -> System Settings -> Agent API Keys in the app),
    writes .env next to the .exe, then installs and starts the Windows Service automatically.
  - Already configured: reports the service's current status (and installs/starts it if it isn't
    running yet, e.g. after a reinstall).

Anything else on the command line is passed straight through to pywin32's own command handling —
`KynrenRelayAgent.exe install|start|stop|restart|remove|debug` all work exactly like running
`python kynren_network_relay_service.py <command>` would.

Windows itself also launches this exact .exe with no arguments when the Service Control Manager
starts the installed service — see main()'s SCM-dispatch-first logic for how that's told apart
from a human double-clicking it.
"""

import sys
from pathlib import Path

APP_DIR = Path(sys.executable).resolve().parent if getattr(sys, "frozen", False) else Path(__file__).resolve().parent
sys.path.insert(0, str(APP_DIR))

import kynren_network_relay as relay  # noqa: E402
from kynren_network_relay_service import KynrenNetworkRelayService  # noqa: E402

ENV_PATH = APP_DIR / ".env"
ERROR_FAILED_SERVICE_CONTROLLER_CONNECT = 1063


def _prompt_config() -> None:
    print("=" * 64)
    print(" Kynren Network Relay Agent - first-time setup")
    print("=" * 64)
    print()
    print("Find both values in the Kynren app under Admin & Setup (or App Settings)")
    print("-> System Settings -> Agent API Keys.")
    print()

    default_url = "https://"
    api_base_url = input(f"Kynren server URL [{default_url}]: ").strip() or default_url
    while not api_base_url.lower().startswith(("http://", "https://")):
        api_base_url = input("Please enter a full URL, e.g. https://assets.example.com: ").strip()

    api_key = ""
    while not api_key:
        api_key = input("Agent API key: ").strip()

    ENV_PATH.write_text(
        f"API_BASE_URL={api_base_url}\nAGENT_API_KEY={api_key}\n",
        encoding="utf-8",
    )
    print(f"\nSaved configuration to {ENV_PATH}")


def _install_and_start_service() -> None:
    import win32service
    import win32serviceutil

    print("\nInstalling the Kynren Network Relay Agent as a Windows Service...")
    try:
        # exeName points the Service Control Manager at THIS frozen .exe instead of the default
        # pythonservice.exe (which doesn't exist in a onefile build) — see main()'s SCM-dispatch
        # branch for what runs when Windows launches us this way.
        win32serviceutil.InstallService(
            pythonClassString=f"{KynrenNetworkRelayService.__module__}.{KynrenNetworkRelayService.__name__}",
            serviceName=KynrenNetworkRelayService._svc_name_,
            displayName=KynrenNetworkRelayService._svc_display_name_,
            description=KynrenNetworkRelayService._svc_description_,
            startType=win32service.SERVICE_AUTO_START,
            exeName=sys.executable,
            exeArgs="",
        )
        print("Service installed (starts automatically at boot).")
    except Exception as exc:  # noqa: BLE001 — surfaced to the console either way
        message = str(exc)
        if "already exists" not in message.lower():
            print(f"Could not install the service: {exc}")
            print("If this window wasn't opened as Administrator, right-click the .exe and")
            print("choose 'Run as administrator', then try again.")
            input("\nPress Enter to exit...")
            sys.exit(1)
        print("Service already installed - continuing.")

    try:
        win32serviceutil.StartService(KynrenNetworkRelayService._svc_name_)
        print("Service started.")
    except Exception as exc:  # noqa: BLE001
        if "already running" not in str(exc).lower() and "already been started" not in str(exc).lower():
            print(f"Could not start the service: {exc}")
            input("\nPress Enter to exit...")
            sys.exit(1)
        print("Service was already running.")

    print("\nDone. The agent now runs in the background and starts automatically with Windows.")
    print(f"Logs: {relay.LOG_PATH}")
    print(f"Config: {ENV_PATH} (delete this file and re-run the .exe to reconfigure)")
    print("Manage it any time from an elevated PowerShell with:")
    print("  Get-Service KynrenNetworkRelayAgent | Start-Service / Stop-Service / Restart-Service")


def _report_existing_status() -> None:
    import win32service
    import win32serviceutil

    print(f"Already configured (using {ENV_PATH}).")
    try:
        status = win32serviceutil.QueryServiceStatus(KynrenNetworkRelayService._svc_name_)[1]
        running = status == win32service.SERVICE_RUNNING
        print(f"Service status: {'running' if running else 'installed, not running'}")
        if not running:
            _install_and_start_service()
    except Exception:
        print("Service is not installed yet - installing it now.")
        _install_and_start_service()


def _interactive_setup() -> None:
    if not ENV_PATH.exists():
        _prompt_config()
        _install_and_start_service()
    else:
        _report_existing_status()

    input("\nPress Enter to close this window...")


def main() -> int:
    if len(sys.argv) > 1:
        import win32serviceutil

        win32serviceutil.HandleCommandLine(KynrenNetworkRelayService)
        return 0

    # No command-line arguments — could be (a) the Windows Service Control Manager starting us as
    # the installed service, or (b) a human double-clicking the .exe. Try hosting as a service
    # first: pywintypes raises ERROR_FAILED_SERVICE_CONTROLLER_CONNECT specifically when we're
    # NOT actually being invoked by the SCM, which is how pywin32's own HandleCommandLine tells
    # the two cases apart internally. Mirrored here explicitly so a genuine SCM-driven startup is
    # never mistaken for the interactive first-run flow — that flow calls input(), which would
    # hang forever under SCM (no console attached), leaving the service stuck in "starting".
    import pywintypes
    import servicemanager

    try:
        servicemanager.Initialize()
        servicemanager.PrepareToHostSingle(KynrenNetworkRelayService)
        servicemanager.StartServiceCtrlDispatcher()
        return 0
    except pywintypes.error as exc:
        if exc.winerror != ERROR_FAILED_SERVICE_CONTROLLER_CONNECT:
            raise

    _interactive_setup()
    return 0


if __name__ == "__main__":
    sys.exit(main())
