"""
Kynren Asset Register — Device Agent

Collects basic system information (hostname, IP addresses, MAC address, OS,
CPU, RAM, disk, and — on Windows — manufacturer/model/serial number) and
reports it to the Asset Register API so the device shows up in the Devices
list and Network Topology Map.

Run manually:
    python kynren_agent.py

Or schedule it (see install_task.ps1) to run periodically / at logon.
"""

import argparse
import datetime
import json
import logging
import logging.handlers
import os
import platform
import socket
import sys
import time
from pathlib import Path

import psutil
import requests
from dotenv import load_dotenv
from getmac import get_mac_address

AGENT_VERSION = "1.0.0"
REQUEST_TIMEOUT_SECONDS = 10
MAX_RETRIES = 3
RETRY_BACKOFF_SECONDS = 5

SCRIPT_DIR = Path(__file__).resolve().parent
LOG_PATH = SCRIPT_DIR / "agent.log"


def setup_logging() -> logging.Logger:
    logger = logging.getLogger("kynren_agent")
    logger.setLevel(logging.INFO)

    file_handler = logging.handlers.RotatingFileHandler(LOG_PATH, maxBytes=1_000_000, backupCount=3)
    file_handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
    logger.addHandler(file_handler)

    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(console_handler)

    return logger


def get_hostname() -> str:
    return socket.gethostname()


def get_primary_ip() -> str | None:
    """The IP the OS would actually use to reach the internet — found by asking the OS's own
    routing table via a UDP socket, rather than guessing from interface names. No packet is
    sent; UDP connect() just resolves which local interface the OS would route through."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
    except OSError:
        return None


def get_ip_addresses() -> list[str]:
    # A machine often has several IPv4 addresses (VPN clients, Docker/Hyper-V virtual switches,
    # WSL, etc.) alongside the real physical NIC. psutil.net_if_addrs() has no notion of which
    # one is "real", so without this the first (often virtual) address in dict-iteration order
    # could get reported as the device's primary IP. Put the OS-routing-table answer first.
    addresses: list[str] = []
    primary = get_primary_ip()
    if primary:
        addresses.append(primary)
    for interface_addrs in psutil.net_if_addrs().values():
        for addr in interface_addrs:
            if addr.family == socket.AF_INET and not addr.address.startswith("127.") and addr.address not in addresses:
                addresses.append(addr.address)
    return addresses


def get_mac_address_str() -> str | None:
    mac = get_mac_address()
    return mac if mac and mac != "00:00:00:00:00:00" else None


def get_os_info() -> tuple[str, str]:
    return platform.system(), platform.release()


def get_cpu_info() -> str:
    processor = platform.processor() or platform.machine()
    cores = psutil.cpu_count(logical=True)
    return f"{processor} ({cores} logical cores)"


def get_ram_gb() -> float:
    return round(psutil.virtual_memory().total / (1024 ** 3), 1)


def get_disk_info() -> str:
    parts = []
    for partition in psutil.disk_partitions(all=False):
        try:
            usage = psutil.disk_usage(partition.mountpoint)
            total_gb = round(usage.total / (1024 ** 3), 1)
            free_gb = round(usage.free / (1024 ** 3), 1)
            parts.append(f"{partition.device} {total_gb}GB total, {free_gb}GB free")
        except (PermissionError, OSError):
            continue
    return "; ".join(parts) if parts else "unknown"


def get_windows_hardware_info() -> dict[str, str | None]:
    """Manufacturer / model / serial number, Windows only. Returns Nones elsewhere or on failure."""
    if platform.system() != "Windows":
        return {"manufacturer": None, "model": None, "serialNumber": None}

    try:
        import wmi  # type: ignore

        conn = wmi.WMI()
        system_info = conn.Win32_ComputerSystem()[0]
        bios_info = conn.Win32_BIOS()[0]
        return {
            "manufacturer": getattr(system_info, "Manufacturer", None),
            "model": getattr(system_info, "Model", None),
            "serialNumber": getattr(bios_info, "SerialNumber", None),
        }
    except Exception:
        return {"manufacturer": None, "model": None, "serialNumber": None}


def get_battery_info() -> dict[str, bool | int | None]:
    """Real battery state via psutil.sensors_battery() — returns batteryPresent=False on
    desktops/servers with no battery rather than fabricating a level. Not available on every
    platform/psutil build, so this is feature-detected like get_windows_hardware_info()."""
    try:
        battery = psutil.sensors_battery()
    except Exception:
        return {"batteryPresent": None, "batteryPercent": None, "batteryCharging": None}

    if battery is None:
        return {"batteryPresent": False, "batteryPercent": None, "batteryCharging": None}

    return {
        "batteryPresent": True,
        "batteryPercent": round(battery.percent),
        "batteryCharging": bool(battery.power_plugged),
    }


def get_logged_in_user() -> tuple[str | None, str | None]:
    """Currently logged-in user and their session start time (ISO 8601), via psutil."""
    try:
        sessions = psutil.users()
        if not sessions:
            return None, None
        # Most recently started session wins if multiple users are logged in.
        latest = max(sessions, key=lambda s: s.started)
        username = latest.name
        started_iso = datetime.datetime.fromtimestamp(latest.started, tz=datetime.timezone.utc).isoformat().replace("+00:00", "Z")
        return username, started_iso
    except Exception:
        return None, None


def get_installed_software() -> list[dict[str, str]]:
    """Enumerate installed applications from the Windows registry Uninstall keys."""
    if platform.system() != "Windows":
        return []

    import winreg

    hives = [
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"),
        (winreg.HKEY_CURRENT_USER, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
    ]

    seen: set[str] = set()
    software: list[dict[str, str]] = []

    for hive, subkey_path in hives:
        try:
            root = winreg.OpenKey(hive, subkey_path)
        except OSError:
            continue

        for i in range(winreg.QueryInfoKey(root)[0]):
            try:
                subkey_name = winreg.EnumKey(root, i)
                with winreg.OpenKey(root, subkey_name) as subkey:
                    try:
                        name = winreg.QueryValueEx(subkey, "DisplayName")[0]
                    except OSError:
                        continue
                    if not name or name in seen:
                        continue
                    try:
                        system_component = winreg.QueryValueEx(subkey, "SystemComponent")[0]
                        if system_component == 1:
                            continue
                    except OSError:
                        pass
                    try:
                        version = winreg.QueryValueEx(subkey, "DisplayVersion")[0]
                    except OSError:
                        version = None

                    seen.add(name)
                    entry = {"name": name}
                    if version:
                        entry["version"] = str(version)
                    software.append(entry)
            except OSError:
                continue

        winreg.CloseKey(root)

    return sorted(software, key=lambda s: s["name"].lower())


def build_payload() -> dict:
    os_name, os_version = get_os_info()
    hardware = get_windows_hardware_info()
    logged_in_user, last_login_at = get_logged_in_user()

    payload = {
        "hostname": get_hostname(),
        "macAddress": get_mac_address_str(),
        "ipAddresses": get_ip_addresses(),
        "os": os_name,
        "osVersion": os_version,
        "cpu": get_cpu_info(),
        "ramGb": get_ram_gb(),
        "diskInfo": get_disk_info(),
        "manufacturer": hardware["manufacturer"],
        "model": hardware["model"],
        "serialNumber": hardware["serialNumber"],
        "agentVersion": AGENT_VERSION,
        "loggedInUser": logged_in_user,
        "lastLoginAt": last_login_at,
        "installedSoftware": get_installed_software(),
    }

    # Omit rather than send null — the API's battery fields are optional, not nullable.
    for key, value in get_battery_info().items():
        if value is not None:
            payload[key] = value

    return payload


def send_payload(payload: dict, api_base_url: str, api_key: str, logger: logging.Logger) -> bool:
    url = f"{api_base_url.rstrip('/')}/api/agent/devices"
    headers = {"Content-Type": "application/json", "X-Agent-Key": api_key}

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            response = requests.post(url, headers=headers, data=json.dumps(payload), timeout=REQUEST_TIMEOUT_SECONDS)
            if response.status_code in (200, 201):
                logger.info(f"Reported successfully: {payload['hostname']} ({payload['macAddress']})")
                return True
            logger.warning(f"Attempt {attempt}: server responded {response.status_code} — {response.text[:200]}")
        except requests.RequestException as exc:
            logger.warning(f"Attempt {attempt}: request failed — {exc}")

        if attempt < MAX_RETRIES:
            time.sleep(RETRY_BACKOFF_SECONDS)

    return False


def load_config(args: argparse.Namespace) -> tuple[str, str]:
    load_dotenv(SCRIPT_DIR / ".env")

    api_base_url = args.api_base_url or os.environ.get("API_BASE_URL")
    api_key = args.api_key or os.environ.get("AGENT_API_KEY")

    if not api_base_url or not api_key:
        raise SystemExit(
            "Missing configuration. Set API_BASE_URL and AGENT_API_KEY in agent/.env "
            "(copy from .env.example) or pass --api-base-url / --api-key."
        )

    return api_base_url, api_key


def main() -> int:
    parser = argparse.ArgumentParser(description="Kynren Asset Register device agent")
    parser.add_argument("--api-base-url", help="Override API_BASE_URL from .env")
    parser.add_argument("--api-key", help="Override AGENT_API_KEY from .env")
    args = parser.parse_args()

    logger = setup_logging()

    try:
        api_base_url, api_key = load_config(args)
    except SystemExit as exc:
        logger.error(str(exc))
        return 1

    payload = build_payload()

    if not payload["macAddress"]:
        logger.error("Could not determine a MAC address for this machine; aborting.")
        return 1

    logger.info(f"Collected system info for {payload['hostname']}: {json.dumps(payload)}")

    success = send_payload(payload, api_base_url, api_key, logger)
    return 0 if success else 1


if __name__ == "__main__":
    sys.exit(main())
