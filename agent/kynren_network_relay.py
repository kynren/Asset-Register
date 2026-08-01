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


def dump_arp_table() -> list[dict]:
    """Full local ARP cache dump — every {ip, mac} pair this OS already knows about, independent
    of any active scan job. Used at startup (and periodically) to opportunistically fill in MAC
    addresses on already-tracked devices that don't have one recorded yet, via
    POST /api/network-relay/discovery — cheaper and more complete than only ever learning a MAC
    when its IP happens to fall inside an active scan job's range."""
    args = ["arp", "-a"] if IS_WINDOWS else ["arp", "-n"]
    try:
        result = subprocess.run(args, capture_output=True, text=True, timeout=5)
    except Exception:
        return []

    entries: list[dict] = []
    seen_ips: set[str] = set()
    ip_pattern = r"(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})"
    mac_pattern = r"([0-9a-f]{2}[:-]){5}[0-9a-f]{2}"
    for line in result.stdout.splitlines():
        ip_match = re.search(ip_pattern, line)
        mac_match = re.search(mac_pattern, line, re.IGNORECASE)
        if not ip_match or not mac_match:
            continue
        ip = ip_match.group(1)
        mac = mac_match.group(0).replace("-", ":").lower()
        if mac == "ff:ff:ff:ff:ff:ff" or ip in seen_ips:
            continue
        seen_ips.add(ip)
        entries.append({"ip": ip, "mac": mac})
    return entries


def discover_local_subnets() -> list[dict]:
    """Reads this machine's own network interface configuration (every adapter, not just the
    "primary" one used elsewhere in this file) to find every subnet it's directly connected to —
    real, on-the-ground candidates for Admin & Setup's Network Monitor ranges, instead of an admin
    guessing/typing them blind. Interface config is used rather than parsing the routing table
    directly since it's a more stable text format across Windows locales/versions and expresses
    the same "on-link" subnets a route-table read would. Purely informational — see
    RelayDiscoveredSubnet's schema comment: nothing here ever auto-triggers a scan on its own."""
    subnets: dict[str, str] = {}  # cidr -> adapter/interface label
    try:
        if IS_WINDOWS:
            result = subprocess.run(["ipconfig", "/all"], capture_output=True, text=True, timeout=5)
            current_adapter: str | None = None
            current_ip: str | None = None
            for line in result.stdout.splitlines():
                adapter_match = re.match(r"^(\S.*adapter\s.*):\s*$", line)
                if adapter_match:
                    current_adapter = adapter_match.group(1).strip()
                    current_ip = None
                    continue
                ip_match = re.search(r"IPv4 Address[.\s]*:\s*([\d.]+)", line)
                if ip_match:
                    current_ip = ip_match.group(1)
                    continue
                mask_match = re.search(r"Subnet Mask[.\s]*:\s*([\d.]+)", line)
                if mask_match and current_ip:
                    try:
                        network = ipaddress.IPv4Network(f"{current_ip}/{mask_match.group(1)}", strict=False)
                    except ValueError:
                        current_ip = None
                        continue
                    if not network.is_loopback and not network.is_link_local:
                        subnets[str(network)] = current_adapter or ""
                    current_ip = None
        else:
            result = subprocess.run(["ip", "-4", "-o", "addr", "show"], capture_output=True, text=True, timeout=5)
            for line in result.stdout.splitlines():
                match = re.search(r"inet ([\d.]+)/(\d+).*?\s(\S+)$", line)
                if not match:
                    continue
                try:
                    network = ipaddress.IPv4Network(f"{match.group(1)}/{match.group(2)}", strict=False)
                except ValueError:
                    continue
                if not network.is_loopback and not network.is_link_local:
                    subnets[str(network)] = match.group(3)
    except Exception:
        return []
    return [{"cidr": cidr, "label": label} for cidr, label in subnets.items()]


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


SNMP_TAG_GETBULK = 0xA5
SNMP_TAG_END_OF_MIB_VIEW = 0x82


def _build_snmp_getbulk(community: str, oid: str, request_id: int, max_repetitions: int = 10) -> bytes:
    """GetBulkRequest-PDU for walking a table — non-repeaters is always 0 here (the single OID is
    treated as repeating), max-repetitions caps how many rows come back in one round trip."""
    varbinds = _ber_sequence(_ber_sequence(_ber_oid(oid), _ber_null()))
    pdu_body = _ber_integer(request_id) + _ber_integer(0) + _ber_integer(max_repetitions) + varbinds
    pdu = _ber_tlv(SNMP_TAG_GETBULK, pdu_body)
    return _ber_sequence(_ber_integer(1), _ber_octet_string(community.encode()), pdu)


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


def _ber_decode_oid(value: bytes) -> str:
    """Inverse of _ber_oid's encoding: first byte is 40*X + Y, remaining bytes are 7-bit groups
    with the continuation bit (0x80) set on every byte except the last of each group."""
    if not value:
        return ""
    first = value[0]
    parts = [first // 40, first % 40]
    n = 0
    for b in value[1:]:
        n = (n << 7) | (b & 0x7F)
        if not (b & 0x80):
            parts.append(n)
            n = 0
    return ".".join(str(p) for p in parts)


def _parse_snmp_response(data: bytes) -> tuple[int, list[tuple[str, int, bytes]]]:
    """Parses any SNMPv2c GetResponse-PDU (the reply to GET, GETNEXT, or GETBULK — they all share
    the same response PDU shape) into (error_status, [(oid_str, value_tag, value_bytes), ...]).
    GETBULK's "ran off the end of the MIB" signal is endOfMibView (tag 0x82) on a varbind; callers
    check for that themselves since GET and WALK have different notions of "done"."""
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

    results: list[tuple[str, int, bytes]] = []
    vb_off = 0
    while vb_off < len(varbind_list_value):
        _tag, vb_value, vb_off = _ber_read_tlv(varbind_list_value, vb_off)
        inner_off = 0
        _oid_tag, oid_val, inner_off = _ber_read_tlv(vb_value, inner_off)
        val_tag, val_val, inner_off = _ber_read_tlv(vb_value, inner_off)
        results.append((_ber_decode_oid(oid_val), val_tag, val_val))
    return error_status, results


def snmp_get_sys_info(ip: str, community: str, port: int, timeout: float = SNMP_TIMEOUT_SECONDS) -> tuple[str | None, int | None, str | None]:
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.settimeout(timeout)
    try:
        request_id = random.randint(1, 0x7FFFFFFF)
        packet = _build_snmp_get(community, ["1.3.6.1.2.1.1.1.0", "1.3.6.1.2.1.1.3.0"], request_id)
        sock.sendto(packet, (ip, port))
        data, _addr = sock.recvfrom(4096)
        error_status, results = _parse_snmp_response(data)
        if error_status != 0 or len(results) < 2:
            return None, None, "Device returned an SNMP error response"
        _sys_descr_oid, sys_descr_tag, sys_descr_val = results[0]
        _sys_uptime_oid, _sys_uptime_tag, sys_uptime_val = results[1]
        sys_descr = sys_descr_val.decode("utf-8", errors="replace") if sys_descr_tag == 0x04 else None
        sys_uptime = int.from_bytes(sys_uptime_val, "big") if sys_uptime_val else None
        return sys_descr, sys_uptime, None
    except socket.timeout:
        return None, None, "SNMP request timed out"
    except Exception as exc:
        return None, None, f"SNMP error: {exc}"
    finally:
        sock.close()


def snmp_walk(ip: str, community: str, port: int, base_oid: str, max_repetitions: int = 10,
              timeout: float = SNMP_TIMEOUT_SECONDS, max_rows: int = 200) -> tuple[list[tuple[str, int, bytes]], str | None]:
    """Walks every OID under base_oid via repeated GetBulk requests, stopping when a returned OID
    no longer starts with base_oid, endOfMibView is signaled, or max_rows is hit (a hard ceiling so
    one unexpectedly huge table can't hang a poll cycle). Returns (rows, error) where rows is
    [(oid_str, value_tag, value_bytes), ...] in table order. error is None whenever at least
    partial data came back — a walk that gets 40 rows then times out still reports those 40 rows
    as a success, same fail-soft convention as the rest of this file. An empty rows list with
    error=None just means the table is genuinely empty/unsupported on this device, which is the
    normal case for most of the best-effort MIBs below (VLAN, PoE, CDP)."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.settimeout(timeout)
    rows: list[tuple[str, int, bytes]] = []
    next_oid = base_oid
    try:
        while len(rows) < max_rows:
            request_id = random.randint(1, 0x7FFFFFFF)
            packet = _build_snmp_getbulk(community, next_oid, request_id, max_repetitions)
            sock.sendto(packet, (ip, port))
            data, _addr = sock.recvfrom(8192)
            error_status, varbinds = _parse_snmp_response(data)
            if error_status != 0 or not varbinds:
                break
            reached_end = False
            for oid_str, val_tag, val_val in varbinds:
                if val_tag == SNMP_TAG_END_OF_MIB_VIEW or not oid_str.startswith(base_oid + "."):
                    reached_end = True
                    break
                rows.append((oid_str, val_tag, val_val))
                next_oid = oid_str
            if reached_end:
                break
        return rows[:max_rows], None
    except socket.timeout:
        return rows, None if rows else "SNMP walk timed out"
    except Exception as exc:
        return rows, None if rows else f"SNMP walk error: {exc}"
    finally:
        sock.close()


def _walk_column(ip: str, community: str, port: int, column_oid: str) -> dict[str, tuple[int, bytes]]:
    """Walks one SNMP table column (e.g. ifDescr = 1.3.6.1.2.1.2.2.1.2) and returns
    {index_suffix: (value_tag, value_bytes)}, where index_suffix is everything after the column
    OID — kept as a string since some tables index by something other than a bare integer (e.g.
    dot1dTpFdbTable is indexed by the 6 decimal octets of a MAC address)."""
    rows, _error = snmp_walk(ip, community, port, column_oid)
    out: dict[str, tuple[int, bytes]] = {}
    prefix = column_oid + "."
    for oid_str, val_tag, val_val in rows:
        if oid_str.startswith(prefix):
            out[oid_str[len(prefix):]] = (val_tag, val_val)
    return out


# ───────────────────────── SNMP topology poll (ifTable/Bridge-MIB/LLDP-MIB, best-effort CDP/VLAN/PoE) ─────────────────────────
# Standard MIB-II + Bridge-MIB + LLDP-MIB OIDs are widely implemented; Cisco CDP and the two VLAN
# OIDs are vendor/best-effort — an empty result for those on a given switch just means "not
# supported here", not a failure (see snmp_walk's fail-soft contract above).

OID_SYS_NAME = "1.3.6.1.2.1.1.5.0"
OID_IF_DESCR = "1.3.6.1.2.1.2.2.1.2"
OID_IF_ADMIN_STATUS = "1.3.6.1.2.1.2.2.1.7"
OID_IF_OPER_STATUS = "1.3.6.1.2.1.2.2.1.8"
OID_IF_SPEED = "1.3.6.1.2.1.2.2.1.5"
OID_IF_IN_OCTETS = "1.3.6.1.2.1.2.2.1.10"
OID_IF_OUT_OCTETS = "1.3.6.1.2.1.2.2.1.16"
OID_DOT1D_TP_FDB_PORT = "1.3.6.1.2.1.17.4.3.1.2"        # dot1dTpFdbPort — indexed by MAC (6 octets)
OID_DOT1D_BASE_PORT_IFINDEX = "1.3.6.1.2.1.17.1.4.1.2"  # dot1dBasePortIfIndex — bridge port -> ifIndex
OID_LLDP_REM_CHASSIS_ID_SUBTYPE = "1.0.8802.1.1.2.1.4.1.1.4"
OID_LLDP_REM_CHASSIS_ID = "1.0.8802.1.1.2.1.4.1.1.5"
OID_LLDP_REM_PORT_ID = "1.0.8802.1.1.2.1.4.1.1.7"
OID_LLDP_REM_SYS_NAME = "1.0.8802.1.1.2.1.4.1.1.9"
OID_CDP_CACHE_DEVICE_ID = "1.3.6.1.4.1.9.9.23.1.2.1.1.6"
OID_CDP_CACHE_DEVICE_PORT = "1.3.6.1.4.1.9.9.23.1.2.1.1.7"
OID_DOT1Q_VLAN_STATIC_NAME = "1.3.6.1.2.1.17.7.1.4.3.1.1"  # standard Q-BRIDGE-MIB
OID_POE_PORT_DETECTION_STATUS = "1.3.6.1.2.1.105.1.1.1.6"  # pethPsePortDetectionStatus

_IF_STATUS_LABEL = {1: "up", 2: "down", 3: "testing"}
_POE_STATUS_LABEL = {1: "disabled", 2: "searching", 3: "delivering", 4: "fault", 5: "test", 6: "fault"}


def _decode_display_string(val_tag: int, val_val: bytes) -> str | None:
    if val_tag != 0x04:
        return None
    return val_val.decode("utf-8", errors="replace")


def _decode_int(val_tag: int, val_val: bytes) -> int | None:
    if val_tag != 0x02 or not val_val:
        return None
    return int.from_bytes(val_val, "big", signed=True)


def _decode_mac_from_index(index_suffix: str) -> str | None:
    """dot1dTpFdbTable is indexed by the 6 decimal octets of a MAC address, e.g.
    '0.22.58.171.204.239' -> 'aa:bb:cc:dd:ee:ff'-style string."""
    parts = index_suffix.split(".")
    if len(parts) != 6:
        return None
    try:
        octets = [int(p) for p in parts]
    except ValueError:
        return None
    if any(o < 0 or o > 255 for o in octets):
        return None
    return ":".join(f"{o:02x}" for o in octets)


def snmp_get_topology(ip: str, community: str, port: int) -> dict:
    """Best-effort SNMP topology poll: sysName, per-interface stats (ifTable), the bridge
    forwarding/MAC table (dot1dTpFdbTable, resolved to real ifIndex ports via
    dot1dBasePortIfIndex), LLDP neighbors, best-effort Cisco CDP neighbors, VLANs, and PoE port
    status. Every sub-query is independently fail-soft (each is its own snmp_walk call) — a switch
    that only implements some of these MIBs still returns useful partial data for the rest rather
    than an all-or-nothing failure. Returns a dict matching this file's outgoing JSON shape for
    the /jobs/:id/complete snmpResults[].topology field (see run_job())."""
    sys_name = None
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.settimeout(SNMP_TIMEOUT_SECONDS)
    try:
        request_id = random.randint(1, 0x7FFFFFFF)
        packet = _build_snmp_get(community, [OID_SYS_NAME], request_id)
        sock.sendto(packet, (ip, port))
        data, _addr = sock.recvfrom(4096)
        error_status, varbinds = _parse_snmp_response(data)
        if error_status == 0 and varbinds:
            sys_name = _decode_display_string(varbinds[0][1], varbinds[0][2])
    except Exception:
        pass
    finally:
        sock.close()

    # Interfaces — one column walk each, joined by ifIndex.
    descr_col = _walk_column(ip, community, port, OID_IF_DESCR)
    admin_col = _walk_column(ip, community, port, OID_IF_ADMIN_STATUS)
    oper_col = _walk_column(ip, community, port, OID_IF_OPER_STATUS)
    speed_col = _walk_column(ip, community, port, OID_IF_SPEED)
    in_col = _walk_column(ip, community, port, OID_IF_IN_OCTETS)
    out_col = _walk_column(ip, community, port, OID_IF_OUT_OCTETS)
    interfaces = []
    for idx, (val_tag, val_val) in descr_col.items():
        name = _decode_display_string(val_tag, val_val) or f"if{idx}"
        admin_raw = admin_col.get(idx)
        oper_raw = oper_col.get(idx)
        speed_raw = speed_col.get(idx)
        in_raw = in_col.get(idx)
        out_raw = out_col.get(idx)
        admin_int = _decode_int(*admin_raw) if admin_raw else None
        oper_int = _decode_int(*oper_raw) if oper_raw else None
        speed_int = _decode_int(*speed_raw) if speed_raw else None
        interfaces.append({
            "index": int(idx) if idx.isdigit() else idx,
            "name": name,
            "adminStatus": _IF_STATUS_LABEL.get(admin_int, "unknown"),
            "operStatus": _IF_STATUS_LABEL.get(oper_int, "unknown"),
            "speedMbps": (speed_int // 1_000_000) if speed_int else None,
            "inOctets": _decode_int(*in_raw) if in_raw else None,
            "outOctets": _decode_int(*out_raw) if out_raw else None,
        })

    # Bridge MAC table — resolve the raw bridge-port number to a real ifIndex (matching the
    # `index` field above) via dot1dBasePortIfIndex, so callers can join mac_table entries
    # straight onto `interfaces` without needing to understand Bridge-MIB's separate port numbering.
    fdb_col = _walk_column(ip, community, port, OID_DOT1D_TP_FDB_PORT)
    base_port_ifindex_col = _walk_column(ip, community, port, OID_DOT1D_BASE_PORT_IFINDEX)
    mac_table = []
    for index_suffix, (val_tag, val_val) in fdb_col.items():
        mac = _decode_mac_from_index(index_suffix)
        bridge_port_int = _decode_int(val_tag, val_val)
        if not mac or bridge_port_int is None:
            continue
        ifindex_raw = base_port_ifindex_col.get(str(bridge_port_int))
        if_index = _decode_int(*ifindex_raw) if ifindex_raw else None
        mac_table.append({"mac": mac, "port": str(if_index if if_index is not None else bridge_port_int)})

    # LLDP neighbors — lldpRemTable is indexed by (timeMark, localPortNum, index); only the
    # localPortNum piece (the 2nd of the 3 index components) is needed to know which of our own
    # ports each neighbor is on.
    def _local_port_from_lldp_index(index_suffix: str) -> str | None:
        parts = index_suffix.split(".")
        return parts[1] if len(parts) >= 2 else None

    chassis_subtype_col = _walk_column(ip, community, port, OID_LLDP_REM_CHASSIS_ID_SUBTYPE)
    chassis_id_col = _walk_column(ip, community, port, OID_LLDP_REM_CHASSIS_ID)
    port_id_col = _walk_column(ip, community, port, OID_LLDP_REM_PORT_ID)
    rem_sys_name_col = _walk_column(ip, community, port, OID_LLDP_REM_SYS_NAME)
    neighbors = []
    for index_suffix, (chassis_val_tag, chassis_val) in chassis_id_col.items():
        local_port = _local_port_from_lldp_index(index_suffix)
        subtype_raw = chassis_subtype_col.get(index_suffix)
        chassis_subtype = _decode_int(*subtype_raw) if subtype_raw else None
        # subtype 4 = MAC address (the common case) — render as a MAC string when it looks like
        # one; otherwise fall back to a UTF-8 decode (subtype 5, "network address", etc.) so
        # nothing is silently dropped.
        if chassis_subtype == 4 and len(chassis_val) == 6:
            chassis_id = ":".join(f"{b:02x}" for b in chassis_val)
        else:
            chassis_id = _decode_display_string(chassis_val_tag, chassis_val) or chassis_val.hex()
        port_raw = port_id_col.get(index_suffix)
        remote_port_id = _decode_display_string(*port_raw) if port_raw else None
        name_raw = rem_sys_name_col.get(index_suffix)
        remote_sys_name = _decode_display_string(*name_raw) if name_raw else None
        neighbors.append({
            "localPort": local_port,
            "remoteChassisId": chassis_id,
            "remotePortId": remote_port_id,
            "remoteSysName": remote_sys_name,
            "protocol": "LLDP",
        })

    # Cisco CDP — best-effort only; most non-Cisco gear won't implement this MIB at all, so an
    # empty result here is the normal case, not an error.
    cdp_device_id_col = _walk_column(ip, community, port, OID_CDP_CACHE_DEVICE_ID)
    cdp_device_port_col = _walk_column(ip, community, port, OID_CDP_CACHE_DEVICE_PORT)
    for index_suffix, (val_tag, val_val) in cdp_device_id_col.items():
        # cdpCacheTable is indexed by (ifIndex, cacheDeviceIndex) — the ifIndex piece is the local port.
        local_port = index_suffix.split(".")[0]
        remote_sys_name = _decode_display_string(val_tag, val_val)
        port_raw = cdp_device_port_col.get(index_suffix)
        remote_port_id = _decode_display_string(*port_raw) if port_raw else None
        neighbors.append({
            "localPort": local_port,
            "remoteChassisId": None,
            "remotePortId": remote_port_id,
            "remoteSysName": remote_sys_name,
            "protocol": "CDP",
        })

    # VLANs — standard Q-BRIDGE-MIB only; not every switch exposes this (an empty list just means
    # "not read", not "no VLANs configured").
    vlan_name_col = _walk_column(ip, community, port, OID_DOT1Q_VLAN_STATIC_NAME)
    vlans = [
        {"vlanId": int(idx) if idx.isdigit() else idx, "name": _decode_display_string(val_tag, val_val)}
        for idx, (val_tag, val_val) in vlan_name_col.items()
    ]

    # PoE — pethPsePortDetectionStatus per port, collapsed to a small label set for the UI.
    poe_col = _walk_column(ip, community, port, OID_POE_PORT_DETECTION_STATUS)
    poe_status = [
        {"port": idx, "status": _POE_STATUS_LABEL.get(_decode_int(val_tag, val_val), "unknown")}
        for idx, (val_tag, val_val) in poe_col.items()
    ]

    return {
        "sysName": sys_name,
        "interfaces": interfaces,
        "macTable": mac_table,
        "lldpNeighbors": neighbors,
        "vlans": vlans,
        "poeStatus": poe_status,
    }


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


def report_discovery(api_base_url: str, api_key: str, subnets: list[dict], logger: logging.Logger) -> None:
    """Reports this relay's locally-discovered subnets (see discover_local_subnets()) to the
    server so admins can pick real, present ranges in Network Monitor settings instead of typing
    them blind. Purely informational and best-effort — a failure here never blocks the main
    scan-job loop, since this is a convenience, not core relay functionality."""
    if not subnets:
        return
    url = f"{api_base_url.rstrip('/')}/api/network-relay/discovery"
    try:
        response = requests.post(
            url,
            headers={"X-Agent-Key": api_key, "Content-Type": "application/json"},
            data=json.dumps({"subnets": subnets}),
            timeout=10,
        )
        if response.status_code == 200:
            logger.info(f"Reported {len(subnets)} discovered subnet(s) to server")
        else:
            logger.warning(f"discovery report responded {response.status_code} — {response.text[:200]}")
    except requests.RequestException as exc:
        logger.warning(f"discovery report failed: {exc}")


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
        sys_descr, sys_uptime, sys_info_error = snmp_get_sys_info(target["ip"], target["community"], target["port"])
        # Topology (interfaces/MAC table/LLDP/VLAN/PoE) is a much heavier poll than the two-scalar
        # sysDescr/sysUpTime GET above — only worth attempting when the basic GET actually proved
        # the device is reachable and speaks SNMP with this community string.
        topology = (
            snmp_get_topology(target["ip"], target["community"], target["port"])
            if sys_info_error is None
            else {"sysName": None, "interfaces": [], "macTable": [], "lldpNeighbors": [], "vlans": [], "poeStatus": []}
        )
        snmp_results.append({
            "deviceId": target["deviceId"],
            "sysDescr": sys_descr,
            "upTimeTicks": sys_uptime,
            "error": sys_info_error,
            **topology,
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


def run_loop(api_base_url: str, api_key: str, logger: logging.Logger, stop_event=None) -> None:
    """The actual poll/scan loop, factored out of main() so the Windows service wrapper
    (kynren_network_relay_service.py) can run it in a background thread and request a clean stop
    between cycles via `stop_event` (a threading.Event) instead of relying on KeyboardInterrupt,
    which a Windows service never receives. `stop_event=None` (the console/Task-Scheduler case)
    behaves exactly as before — only Ctrl+C or an unhandled exception ends the loop."""
    try:
        subnets = discover_local_subnets()
        if subnets:
            logger.info(f"Discovered {len(subnets)} local subnet(s): {', '.join(s['cidr'] for s in subnets)}")
            report_discovery(api_base_url, api_key, subnets, logger)
    except Exception:
        logger.exception("Local subnet discovery failed (non-fatal, continuing)")

    while stop_event is None or not stop_event.is_set():
        try:
            job = fetch_next_job(api_base_url, api_key, logger)
            if job is None:
                (stop_event.wait if stop_event else time.sleep)(POLL_INTERVAL_SECONDS)
                continue
            run_job(job, api_base_url, api_key, logger)
        except KeyboardInterrupt:
            logger.info("Stopped.")
            return
        except Exception:
            logger.exception("Unexpected error in relay loop")
            (stop_event.wait if stop_event else time.sleep)(POLL_INTERVAL_SECONDS)


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
    run_loop(api_base_url, api_key, logger)
    return 0


if __name__ == "__main__":
    sys.exit(main())
