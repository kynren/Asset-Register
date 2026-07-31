import * as snmp from "net-snmp";

// Standard MIB-II OIDs — deliberately scoped to what every SNMP-capable device (switches,
// routers, NAS, printers) implements out of the box. No vendor-specific MIBs (CPU/memory/temp
// OIDs differ per manufacturer) — this is Domotz-style "basic interface health", not deep polling.
const OID_SYS_DESCR = "1.3.6.1.2.1.1.1.0";
const OID_SYS_UPTIME = "1.3.6.1.2.1.1.3.0";
const OID_IF_TABLE = "1.3.6.1.2.1.2.2";

// ifTable column numbers (session.table() keys rows by ifIndex, columns by these numbers).
const COL_IF_DESCR = 2;
const COL_IF_SPEED = 5;
const COL_IF_ADMIN_STATUS = 7;
const COL_IF_OPER_STATUS = 8;
const COL_IF_IN_OCTETS = 10;
const COL_IF_OUT_OCTETS = 16;

const IF_STATUS_LABEL: Record<number, string> = { 1: "up", 2: "down", 3: "testing" };

export interface SnmpInterface {
  index: number;
  name: string;
  adminStatus: string;
  operStatus: string;
  speedMbps: number | null;
  inOctets: number | null;
  outOctets: number | null;
}

export interface SnmpPollResult {
  sysDescr: string | null;
  upTimeTicks: number | null;
  interfaces: SnmpInterface[];
}

const POLL_TIMEOUT_MS = 4000;

/**
 * Polls a device for basic MIB-II health over SNMPv2c. Fails soft: any timeout, refused
 * connection, or malformed response resolves to `{ error }` rather than throwing, so a single
 * unreachable/misconfigured device never aborts a monitoring cycle covering many devices.
 */
export function pollDevice(ip: string, community: string, port = 161): Promise<{ data: SnmpPollResult; error: null } | { data: null; error: string }> {
  return new Promise((resolve) => {
    const session = snmp.createSession(ip, community, {
      port,
      version: snmp.Version2c,
      timeout: POLL_TIMEOUT_MS,
      retries: 0,
    });

    let settled = false;
    const finish = (result: { data: SnmpPollResult; error: null } | { data: null; error: string }) => {
      if (settled) return;
      settled = true;
      session.close();
      resolve(result);
    };

    const safety = setTimeout(() => finish({ data: null, error: "SNMP poll timed out" }), POLL_TIMEOUT_MS + 1000);

    session.get([OID_SYS_DESCR, OID_SYS_UPTIME], (err, varbinds) => {
      if (err || !varbinds) {
        clearTimeout(safety);
        finish({ data: null, error: err?.message ?? "SNMP get failed" });
        return;
      }

      const sysDescr = varbinds[0] && !snmp.isVarbindError(varbinds[0]) ? String(varbinds[0].value) : null;
      const upTimeTicks = varbinds[1] && !snmp.isVarbindError(varbinds[1]) ? Number(varbinds[1].value) : null;

      session.table(OID_IF_TABLE, 20, (tableErr, table) => {
        clearTimeout(safety);
        if (tableErr) {
          // Interfaces are a bonus — a device that answers sysDescr/sysUpTime but refuses the
          // ifTable walk (some minimal agents do) still counts as a successful poll.
          finish({ data: { sysDescr, upTimeTicks, interfaces: [] }, error: null });
          return;
        }

        const interfaces: SnmpInterface[] = Object.keys(table ?? {})
          .map(Number)
          .sort((a, b) => a - b)
          .map((index) => {
            const row = table![index];
            return {
              index,
              name: row[COL_IF_DESCR] != null ? String(row[COL_IF_DESCR]) : `if${index}`,
              adminStatus: IF_STATUS_LABEL[Number(row[COL_IF_ADMIN_STATUS])] ?? "unknown",
              operStatus: IF_STATUS_LABEL[Number(row[COL_IF_OPER_STATUS])] ?? "unknown",
              speedMbps: row[COL_IF_SPEED] != null ? Math.round(Number(row[COL_IF_SPEED]) / 1_000_000) : null,
              inOctets: row[COL_IF_IN_OCTETS] != null ? Number(row[COL_IF_IN_OCTETS]) : null,
              outOctets: row[COL_IF_OUT_OCTETS] != null ? Number(row[COL_IF_OUT_OCTETS]) : null,
            };
          });

        finish({ data: { sysDescr, upTimeTicks, interfaces }, error: null });
      });
    });
  });
}
