"""
Kynren Network Relay Agent — single-file Windows entry point.

This is the module PyInstaller freezes into KynrenRelayAgent.exe (see relay_agent.spec). It runs
the exact same code as kynren_network_relay.py — the plain script already proven to connect
fine — directly as a console process. No Windows Service, no Service Control Manager involved:
that extra layer (see kynren_network_relay_service.py, still here for anyone who wants a real
Windows Service via `pip install pywin32` and running it with Python directly) turned out to fail
silently on real deployments — a Service installs and "starts" successfully from the SCM's point
of view while still never reaching setup_logging()'s first line, and runs as LocalSystem, a
different security/network context than the interactive user session that's already confirmed to
work. Running the exe the same way as the script sidesteps both problems.

Double-click with no arguments:
  - First run (no .env next to the .exe yet): prompts for the two required values (server URL +
    agent key, both shown under Admin & Setup -> System Settings -> Agent API Keys in the app)
    and writes .env next to the .exe.
  - Every run: loads that .env and runs forever, exactly like `python kynren_network_relay.py`
    does — same setup_logging(), same run_loop(), same network_relay.log location next to the
    .exe. Close the console window (or Ctrl+C) to stop it.

For "starts automatically without a console window open" persistence, register it as a Windows
Scheduled Task instead — see install_relay_task.ps1 (same convention as the device agent's
install_task.ps1). Running "at log on" keeps it in the same user context that's already proven to
work, rather than the service's LocalSystem context.

`--diagnose-vlans` and any other arguments are forwarded straight to kynren_network_relay.py's
own argument parser.
"""

import sys
from pathlib import Path

APP_DIR = Path(sys.executable).resolve().parent if getattr(sys, "frozen", False) else Path(__file__).resolve().parent
sys.path.insert(0, str(APP_DIR))

import kynren_network_relay as relay  # noqa: E402

ENV_PATH = APP_DIR / ".env"


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
    print(f"Logs will be written to {relay.LOG_PATH}")
    print()


def main() -> int:
    # relay.main()'s own argparse only recognizes "--diagnose-vlans" (with dashes); accept the
    # bare form too since that's what README.md documents as the exe's shorthand.
    if len(sys.argv) > 1 and sys.argv[1] == "diagnose-vlans":
        sys.argv[1] = "--diagnose-vlans"

    # Only the first-run prompt is exe-specific — everything else (including --diagnose-vlans and
    # normal polling) is handled by relay.main() itself, unchanged from the plain script.
    if not ENV_PATH.exists() and len(sys.argv) == 1:
        _prompt_config()

    return relay.main()


if __name__ == "__main__":
    sys.exit(main())
