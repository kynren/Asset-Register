"""
Kynren Asset Register — Network Relay Agent

A cloud-hosted deployment of this app has no network route into a private office
LAN — the IP Range Scanner, ICMP Pinger, and continuous Monitoring tab can't reach
local devices no matter what code runs on the server, because there's no network
path there at all. This script runs on one machine that IS inside the LAN, polls
the server for queued scan jobs (enabled via Admin & Setup -> System Settings ->
"Network Relay Agent"), does the actual ping/ARP/hostname/port work locally, and
reports results back over the internet.

This mirrors kynren_agent.py's config/logging conventions (same .env file, same
AGENT_API_KEY), but unlike that one-shot script, this is a long-running loop —
start it once (e.g. via Task Scheduler "At startup", or just leave a console
window open) and leave it running.

Run manually:
    python kynren_network_relay.py
"""

import argparse
import ipaddress
import json
import logging
import logging.handlers
import os
import platform
import random
import re
import socket
import struct
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import requests
from dotenv import load_dotenv

AGENT_VERSION = "1.0.0"
SCRIPT_DIR = Path(__file__).resolve().parent
LOG_PATH = SCRIPT_DIR / "network_relay.log"

IS_WINDOWS = platform.system() == "Windows"

POLL_INTERVAL_SECONDS = 3          # how often to ask "any scans queued?" while idle
HOST_CONCURRENCY = 24              # mirrors server SCAN_CONCURRENCY
PROGRESS_REPORT_EVERY = 15         # PATCH progress every N hosts scanned
PING_TIMEOUT_MS = 800
ARP_TIMEOUT_SECONDS = 2
DNS_TIMEOUT_SECONDS = 0.8
NETBIOS_TIMEOUT_SECONDS = 0.6
PORT_TIMEOUT_SECONDS = 0.4
SNMP_TIMEOUT_SECONDS = 2.5
COMMON_PORTS = [21, 22, 23, 25, 80, 443, 554, 3389, 8080, 8443]

_dns_executor = ThreadPoolExecutor(max_workers=16)


def setup_logging() -> logging.Logger:
    logger = logging.getLogger("kynren_network_relay")
    logger.setLevel(logging.INFO)

    file_handler = logging.handlers.RotatingFileHandler(LOG_PATH, maxBytes=2_000_000, backupCount=3)
    file_handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
    logger.addHandler(file_handler)

    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(console_handler)

    return logger


# ───────────────────────── IP range expansion ─────────────────────────

def expand_range(start_ip: str, end_ip: str) -> list[str]:
    start = int(ipaddress.IPv4Address(start_ip))
    end = int(ipaddress.IPv4Address(end_ip))
    return [str(ipaddress.IPv4Address(v)) for v in range(start, end + 1)]


# ───────────────────────── Ping / ARP / port scan (mirrors server/src/lib/ping.ts) ─────────────────────────

def ping_host(ip: str, timeout_ms: int = PING_TIMEOUT_MS) -> tuple[bool, int | None]:
    args = ["ping", "-n", "1", "-w", str(timeout_ms), ip] if IS_WINDOWS else ["ping", "-c", "1", "-W", str(max(1, timeout_ms // 1000)), ip]
    try:
        result = subprocess.run(args, capture_output=True, text=True, timeout=(timeout_ms / 1000) + 1)
        stdout = result.stdout
        match = re.search(r"time[=<]([\d.]+)\s*ms", stdout, re.IGNORECASE)
        if match:
            return True, round(float(match.group(1)))
        if IS_WINDOWS and re.search(r"Reply from", stdout, re.IGNORECASE):
            return True, 0
        return False, None
    except Exception:
        return False, None


def get_arp_mac(ip: str) -> str | None:
    args = ["arp", "-a", ip] if IS_WINDOWS else ["arp", "-n", ip]
    try:
        result = subprocess.run(args, capture_output=True, text=True, timeout=ARP_TIMEOUT_SECONDS)
        match = re.search(r"([0-9a-f]{2}[:-]){5}[0-9a-f]{2}", result.stdout, re.IGNORECASE)
        return match.group(0).replace("-", ":").lower() if match else None
    except Exception:
        return None


def reverse_dns(ip: str, timeout: float = DNS_TIMEOUT_SECONDS) -> str | None:
    future = _dns_executor.submit(socket.gethostbyaddr, ip)
    try:
        hostname, _aliases, _addrs = future.result(timeout=timeout)
        return hostname
    except Exception:
        return None


def _encode_netbios_name(name16: bytes) -> bytes:
    encoded = bytearray(32)
    for i in range(16):
        encoded[i * 2] = 0x41 + ((name16[i] >> 4) & 0x0F)
        encoded[i * 2 + 1] = 0x41 + (name16[i] & 0x0F)
    return bytes(encoded)


def _build_nbstat_query(transaction_id: int) -> bytes:
    header = struct.pack(">HHHHHH", transaction_id, 0x0000, 0x0001, 0x0000, 0x0000, 0x0000)
    name16 = bytearray(16)
    name16[0] = 0x2A  # '*'
    encoded_name = _encode_netbios_name(bytes(name16))
    question = bytes([0x20]) + encoded_name + bytes([0x00]) + struct.pack(">HH", 0x0021, 0x0001)
    return header + question


def _parse_nbstat_response(response: bytes) -> str | None:
    rdata_offset = 12 + 34 + 2 + 2 + 4 + 2  # header + RR name + type + class + ttl + rdlength
    if len(response) <= rdata_offset:
        return None

    num_names = response[rdata_offset]
    entries_start = rdata_offset + 1
    fallback: str | None = None

    for i in range(num_names):
        entry_start = entries_start + i * 18
        if entry_start + 18 > len(response):
            break
        raw_name = response[entry_start:entry_start + 15].decode("ascii", errors="replace").replace("\x00", " ").strip()
        suffix = response[entry_start + 15]
        flags = struct.unpack(">H", response[entry_start + 16:entry_start + 18])[0]
        is_group = (flags & 0x8000) != 0
        if not raw_name:
            continue
        if fallback is None:
            fallback = raw_name
        if suffix == 0x00 and not is_group:
            return raw_name
    return fallback


def get_netbios_name(ip: str, timeout: float = NETBIOS_TIMEOUT_SECONDS) -> str | None:
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.settimeout(timeout)
    try:
        query = _build_nbstat_query(random.randint(0, 0xFFFF))
        sock.sendto(query, (ip, 137))
        data, _addr = sock.recvfrom(2048)
        return _parse_nbstat_response(data)
    except Exception:
        return None
    finally:
        sock.close()


def resolve_hostname(ip: str) -> str | None:
    """Reverse DNS, then active NetBIOS query. Unlike the server's direct-mode resolveHostname(),
    this can't cross-check the Kynren agent's own Device table (the relay has no DB access) — a
    minor, documented scope reduction versus direct mode."""
    via_dns = reverse_dns(ip)
    if via_dns:
        return via_dns
    return get_netbios_name(ip)


def check_port(ip: str, port: int, timeout: float = PORT_TIMEOUT_SECONDS) -> bool:
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(timeout)
    try:
        return sock.connect_ex((ip, port)) == 0
    except Exception:
        return False
    finally:
        sock.close()


def scan_common_ports(ip: str, ports: list[int] = COMMON_PORTS) -> list[int]:
    open_ports: list[int] = []
    with ThreadPoolExecutor(max_workers=len(ports)) as executor:
        futures = {executor.submit(check_port, ip, p): p for p in ports}
        for future in as_completed(futures):
            if future.result():
                open_ports.append(futures[future])
    return sorted(open_ports)


def scan_host(ip: str) -> dict:
    alive, response_time_ms = ping_host(ip)
    hostname = mac = None
    open_ports: list[int] = []
    if alive:
        hostname = resolve_hostname(ip)
        mac = get_arp_mac(ip)
        open_ports = scan_common_ports(ip)
    return {
        "ipAddress": ip,
        "alive": alive,
        "hostname": hostname,
        "macAddress": mac,
        "openPorts": open_ports,
        "responseTimeMs": response_time_ms,
    }


# ───────────────────────── Minimal hand-rolled SNMPv2c GET (sysDescr + sysUpTime only) ─────────────────────────
# No ifTable walk here (that needs GetBulk + termination-condition handling) — scoped down to a
# single GET request/response for the two most useful scalars. A device with SNMP fully enabled
# still reports "reachable, here's its uptime"; the fuller interface-table view Domotz shows stays
# a documented future enhancement rather than a half-working guess.

def _ber_length(n: int) -> bytes:
    if n < 0x80:
        return bytes([n])
    chunk = []
    while n > 0:
        chunk.insert(0, n & 0xFF)
        n >>= 8
    return bytes([0x80 | len(chunk)]) + bytes(chunk)


def _ber_tlv(tag: int, value: bytes) -> bytes:
    return bytes([tag]) + _ber_length(len(value)) + value


def _ber_integer(n: int) -> bytes:
    if n == 0:
        return _ber_tlv(0x02, b"\x00")
    b = []
    v = n
    while v > 0:
        b.insert(0, v & 0xFF)
        v >>= 8
    if b[0] & 0x80:
        b.insert(0, 0x00)
    return _ber_tlv(0x02, bytes(b))


def _ber_octet_string(s: bytes) -> bytes:
    return _ber_tlv(0x04, s)


def _ber_null() -> bytes:
    return _ber_tlv(0x05, b"")


def _ber_oid(oid_str: str) -> bytes:
    parts = [int(p) for p in oid_str.split(".")]
    encoded = bytearray([parts[0] * 40 + parts[1]])
    for p in parts[2:]:
        if p == 0:
            encoded.append(0)
            continue
        chunk = []
        v = p
        while v > 0:
            chunk.insert(0, v & 0x7F)
            v >>= 7
        for i in range(len(chunk) - 1):
            chunk[i] |= 0x80
        encoded.extend(chunk)
    return _ber_tlv(0x06, bytes(encoded))


def _ber_sequence(*parts: bytes) -> bytes:
    return _ber_tlv(0x30, b"".join(parts))


def _build_snmp_get(community: str, oids: list[str], request_id: int) -> bytes:
    varbinds = _ber_sequence(*[_ber_sequence(_ber_oid(oid), _ber_null()) for oid in oids])
    pdu_body = _ber_integer(request_id) + _ber_integer(0) + _ber_integer(0) + varbinds
    pdu = _ber_tlv(0xA0, pdu_body)  # GetRequest-PDU
    return _ber_sequence(_ber_integer(1), _ber_octet_string(community.encode()), pdu)  # version 1 = SNMPv2c


def _ber_read_tlv(data: bytes, offset: int) -> tuple[int, bytes, int]:
    tag = data[offset]
    length_byte = data[offset + 1]
    if length_byte & 0x80:
        num_len_bytes = length_byte & 0x7F
        length = int.from_bytes(data[offset + 2:offset + 2 + num_len_bytes], "big")
        value_start = offset + 2 + num_len_bytes
    else:
        length = length_byte
        value_start = offset + 2
    value = data[value_start:value_start + length]
    return tag, value, value_start + length


def _parse_snmp_get_response(data: bytes) -> tuple[int, list[tuple[int, bytes]]]:
    _tag, seq_value, _ = _ber_read_tlv(data, 0)
    offset = 0
    _tag, _val, offset = _ber_read_tlv(seq_value, offset)  # version
    _tag, _val, offset = _ber_read_tlv(seq_value, offset)  # community
    _pdu_tag, pdu_value, _offset = _ber_read_tlv(seq_value, offset)  # GetResponse-PDU

    p_off = 0
    _tag, _val, p_off = _ber_read_tlv(pdu_value, p_off)  # request-id
    _tag, error_status_bytes, p_off = _ber_read_tlv(pdu_value, p_off)  # error-status
    error_status = int.from_bytes(error_status_bytes, "big", signed=True)
    _tag, _val, p_off = _ber_read_tlv(pdu_value, p_off)  # error-index
    _tag, varbind_list_value, p_off = _ber_read_tlv(pdu_value, p_off)  # varbind SEQUENCE

    results: list[tuple[int, bytes]] = []
    vb_off = 0
    while vb_off < len(varbind_list_value):
        _tag, vb_value, vb_off = _ber_read_tlv(varbind_list_value, vb_off)
        inner_off = 0
        _oid_tag, _oid_val, inner_off = _ber_read_tlv(vb_value, inner_off)
        val_tag, val_val, inner_off = _ber_read_tlv(vb_value, inner_off)
        results.append((val_tag, val_val))
    return error_status, results


def snmp_get_sys_info(ip: str, community: str, port: int, timeout: float = SNMP_TIMEOUT_SECONDS) -> tuple[str | None, int | None, str | None]:
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.settimeout(timeout)
    try:
        request_id = random.randint(1, 0x7FFFFFFF)
        packet = _build_snmp_get(community, ["1.3.6.1.2.1.1.1.0", "1.3.6.1.2.1.1.3.0"], request_id)
        sock.sendto(packet, (ip, port))
        data, _addr = sock.recvfrom(4096)
        error_status, results = _parse_snmp_get_response(data)
        if error_status != 0 or len(results) < 2:
            return None, None, "Device returned an SNMP error response"
        sys_descr_tag, sys_descr_val = results[0]
        _sys_uptime_tag, sys_uptime_val = results[1]
        sys_descr = sys_descr_val.decode("utf-8", errors="replace") if sys_descr_tag == 0x04 else None
        sys_uptime = int.from_bytes(sys_uptime_val, "big") if sys_uptime_val else None
        return sys_descr, sys_uptime, None
    except socket.timeout:
        return None, None, "SNMP request timed out"
    except Exception as exc:
        return None, None, f"SNMP error: {exc}"
    finally:
        sock.close()


# ───────────────────────── Job queue protocol ─────────────────────────

def fetch_next_job(api_base_url: str, api_key: str, logger: logging.Logger) -> dict | None:
    url = f"{api_base_url.rstrip('/')}/api/network-relay/next-job"
    try:
        response = requests.get(url, headers={"X-Agent-Key": api_key}, timeout=10)
        if response.status_code == 204:
            return None
        if response.status_code != 200:
            logger.warning(f"next-job responded {response.status_code} — {response.text[:200]}")
            return None
        return response.json()
    except requests.RequestException as exc:
        logger.warning(f"next-job request failed: {exc}")
        return None


def report_progress(api_base_url: str, api_key: str, job_id: int, scanned: int, alive: int, logger: logging.Logger) -> None:
    url = f"{api_base_url.rstrip('/')}/api/network-relay/jobs/{job_id}/progress"
    try:
        requests.patch(url, headers={"X-Agent-Key": api_key, "Content-Type": "application/json"},
                        data=json.dumps({"scannedHosts": scanned, "aliveHosts": alive}), timeout=5)
    except requests.RequestException as exc:
        logger.warning(f"progress report failed: {exc}")


def submit_results(api_base_url: str, api_key: str, job_id: int, results: list[dict], snmp_results: list[dict], logger: logging.Logger) -> bool:
    url = f"{api_base_url.rstrip('/')}/api/network-relay/jobs/{job_id}/complete"
    try:
        response = requests.post(
            url,
            headers={"X-Agent-Key": api_key, "Content-Type": "application/json"},
            data=json.dumps({"results": results, "snmpResults": snmp_results}),
            timeout=30,
        )
        if response.status_code == 200:
            return True
        logger.warning(f"complete responded {response.status_code} — {response.text[:200]}")
        return False
    except requests.RequestException as exc:
        logger.warning(f"complete request failed: {exc}")
        return False


def run_job(job: dict, api_base_url: str, api_key: str, logger: logging.Logger) -> None:
    job_id = job["id"]
    addresses = expand_range(job["startIp"], job["endIp"])
    logger.info(f"Job {job_id}: scanning {job['startIp']}-{job['endIp']} ({len(addresses)} hosts)")

    results: list[dict] = []
    scanned = 0
    alive = 0

    with ThreadPoolExecutor(max_workers=HOST_CONCURRENCY) as executor:
        futures = {executor.submit(scan_host, ip): ip for ip in addresses}
        for future in as_completed(futures):
            result = future.result()
            results.append(result)
            scanned += 1
            if result["alive"]:
                alive += 1
            if scanned % PROGRESS_REPORT_EVERY == 0:
                report_progress(api_base_url, api_key, job_id, scanned, alive, logger)

    snmp_results: list[dict] = []
    for target in job.get("snmpTargets", []):
        sys_descr, sys_uptime, error = snmp_get_sys_info(target["ip"], target["community"], target["port"])
        snmp_results.append({
            "deviceId": target["deviceId"],
            "sysDescr": sys_descr,
            "upTimeTicks": sys_uptime,
            "interfaces": [],
            "error": error,
        })

    if submit_results(api_base_url, api_key, job_id, results, snmp_results, logger):
        logger.info(f"Job {job_id}: done — {alive}/{scanned} alive, {len(snmp_results)} SNMP target(s) polled")
    else:
        logger.error(f"Job {job_id}: failed to submit results")


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
    parser = argparse.ArgumentParser(description="Kynren Asset Register network relay agent")
    parser.add_argument("--api-base-url", help="Override API_BASE_URL from .env")
    parser.add_argument("--api-key", help="Override AGENT_API_KEY from .env")
    args = parser.parse_args()

    logger = setup_logging()

    try:
        api_base_url, api_key = load_config(args)
    except SystemExit as exc:
        logger.error(str(exc))
        return 1

    logger.info(f"Kynren Network Relay Agent v{AGENT_VERSION} — polling {api_base_url} every {POLL_INTERVAL_SECONDS}s")

    while True:
        try:
            job = fetch_next_job(api_base_url, api_key, logger)
            if job is None:
                time.sleep(POLL_INTERVAL_SECONDS)
                continue
            run_job(job, api_base_url, api_key, logger)
        except KeyboardInterrupt:
            logger.info("Stopped.")
            return 0
        except Exception:
            logger.exception("Unexpected error in relay loop")
            time.sleep(POLL_INTERVAL_SECONDS)


if __name__ == "__main__":
    sys.exit(main())
