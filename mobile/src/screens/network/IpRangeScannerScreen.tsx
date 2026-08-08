import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ActivityIndicator, Alert, FlatList, ScrollView, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { useAuth } from "../../auth/AuthContext";
import { PickerModal, PickerOption } from "../../components/PickerModal";
import { KeyboardAvoidingScreen } from "../../components/KeyboardAvoidingScreen";

interface ScanResult {
  id: number;
  ipAddress: string;
  alive: boolean;
  hostname: string | null;
  macAddress: string | null;
  vendor: string | null;
  deviceType: string | null;
  os: string | null;
  loggedInUser: string | null;
  responseTimeMs: number | null;
  openPorts: number[];
}
interface Scan {
  id: number;
  startIp: string;
  endIp: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
  viaRelay: boolean;
  totalHosts: number;
  aliveHosts: number;
  scannedHosts: number;
  startedAt: string;
  completedAt: string | null;
  results?: ScanResult[];
  startedBy?: { firstName: string; lastName: string };
}
interface AssetCategory { id: number; name: string; isComputerAsset: boolean; isSwitchingDevice: boolean }

const CIDR_PRESETS = [16, 20, 22, 23, 24, 25, 26, 27, 28, 29, 30];

function isValidIpv4(ip: string): boolean {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  return !!m && m.slice(1).every((o) => Number(o) >= 0 && Number(o) <= 255);
}
function ipToLong(ip: string): number {
  return ip.split(".").reduce((acc, o) => acc * 256 + Number(o), 0);
}
function longToIp(v: number): string {
  return [24, 16, 8, 0].map((shift) => (v >>> shift) & 255).join(".");
}
function applyNetmaskToRange(startIp: string, prefix: number): { start: string; end: string } | null {
  if (!isValidIpv4(startIp)) return null;
  const ipLong = ipToLong(startIp);
  const hostBits = 32 - prefix;
  const mask = hostBits === 0 ? 0xffffffff : (0xffffffff << hostBits) >>> 0;
  const network = (ipLong & mask) >>> 0;
  const broadcast = (network | (~mask >>> 0)) >>> 0;
  return { start: longToIp(network), end: longToIp(broadcast) };
}
function statusColor(r: ScanResult, colors: any): string {
  if (!r.alive) return colors.danger;
  if (r.hostname || r.openPorts.length > 0) return colors.primary;
  return colors.success;
}
function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const mins = Math.floor(seconds / 60);
  return `${mins}m ${(seconds % 60).toFixed(0)}s`;
}
const CATEGORY_NAME_KEYWORDS: Record<string, string[]> = {
  "Raspberry Pi": ["raspberry", "single-board", "sbc"],
  "IoT Device": ["iot", "smart"],
  Lighting: ["light"],
  "Sound System": ["sound", "audio", "speaker"],
  "IP Camera / NVR": ["camera", "nvr"],
  Printer: ["printer"],
  "Virtual Machine": ["virtual"],
};
function guessCategoryId(deviceType: string | null, categories: AssetCategory[] | undefined): number | null {
  if (!categories || !deviceType) return null;
  if (deviceType === "Computer") return categories.find((c) => c.isComputerAsset)?.id ?? null;
  if (deviceType === "Network Switching / Routing") return categories.find((c) => c.isSwitchingDevice)?.id ?? null;
  const keywords = CATEGORY_NAME_KEYWORDS[deviceType];
  if (!keywords) return null;
  return categories.find((c) => keywords.some((k) => c.name.toLowerCase().includes(k)))?.id ?? null;
}

// Mirrors client/src/pages/network/IpRangeScannerTab.tsx. The "Adopt into Inventory" step uses a
// small inline form here (assetTag/name/manufacturer/category/notes) rather than reusing the full
// multi-section AssetFormModal — same scoping call as elsewhere this session, since that modal's
// remaining fields have no bearing on a freshly-discovered host and porting them would mean
// threading route params through the whole Asset create flow for little benefit.
export function IpRangeScannerScreen() {
  const { colors, spacing, radius } = useTheme();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();

  const [startIp, setStartIp] = useState("192.168.1.1");
  const [endIp, setEndIp] = useState("192.168.1.254");
  const [netmaskOpen, setNetmaskOpen] = useState(false);
  const [activeScanId, setActiveScanId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aliveOnly, setAliveOnly] = useState(true);
  const [adopting, setAdopting] = useState<ScanResult | null>(null);
  const [adoptForm, setAdoptForm] = useState({ assetTag: "", name: "", manufacturer: "", categoryId: null as number | null, notes: "" });
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const statsShownFor = useRef<number | null>(null);

  const { data: history } = useQuery({ queryKey: ["mobile-network-scans"], queryFn: async () => (await axiosClient.get("/network/scan")).data as Scan[] });
  const { data: categories } = useQuery({ queryKey: ["mobile-asset-categories-scan"], queryFn: async () => (await axiosClient.get("/asset-categories")).data as AssetCategory[] });

  const { data: activeScan } = useQuery({
    queryKey: ["mobile-network-scan", activeScanId],
    queryFn: async () => (await axiosClient.get(`/network/scan/${activeScanId}`)).data as Scan,
    enabled: activeScanId !== null,
    refetchInterval: (query) => (query.state.data?.status === "RUNNING" || query.state.data?.status === "PENDING" ? 1000 : false),
  });

  useEffect(() => {
    if (activeScan?.status === "COMPLETED" && statsShownFor.current !== activeScan.id) {
      statsShownFor.current = activeScan.id;
      queryClient.invalidateQueries({ queryKey: ["mobile-network-scans"] });
      const seconds = activeScan.completedAt ? (new Date(activeScan.completedAt).getTime() - new Date(activeScan.startedAt).getTime()) / 1000 : 0;
      Alert.alert("Scanning completed", `${activeScan.startIp} – ${activeScan.endIp}\n${activeScan.totalHosts} hosts scanned, ${activeScan.aliveHosts} alive\nTotal time: ${formatDuration(seconds)}`);
    }
  }, [activeScan, queryClient]);

  const startMutation = useMutation({
    mutationFn: () => axiosClient.post("/network/scan", { startIp, endIp }),
    onSuccess: (res) => { setError(null); setActiveScanId(res.data.id); queryClient.invalidateQueries({ queryKey: ["mobile-network-scans"] }); },
    onError: (err: any) => setError(err.response?.data?.error ?? "Could not start scan."),
  });
  const promoteMutation = useMutation({ mutationFn: (resultId: number) => axiosClient.post(`/network/scan-results/${resultId}/promote`), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mobile-network-graph"] }) });
  const adoptMutation = useMutation({
    mutationFn: () => axiosClient.post("/assets", { ...adoptForm, staticIpAddress: adopting!.ipAddress }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["mobile-assets"] }); setAdopting(null); },
  });

  const scan = activeScan ?? history?.find((s) => s.id === activeScanId);
  const results = (activeScan?.results ?? []).filter((r) => !aliveOnly || r.alive);
  const progressPct = scan && scan.totalHosts > 0 ? Math.round((scan.scannedHosts / scan.totalHosts) * 100) : 0;
  const busy = scan?.status === "RUNNING" || scan?.status === "PENDING";

  function handleStartIpChange(value: string) {
    setStartIp(value);
    const range = applyNetmaskToRange(value, 24);
    if (range) setEndIp(range.end);
  }

  function pickNetmask(prefix: number) {
    const range = applyNetmaskToRange(startIp, prefix);
    if (!range) { setError("Enter a valid start IP before picking a netmask."); return; }
    setError(null);
    setStartIp(range.start);
    setEndIp(range.end);
  }

  function openAdopt(r: ScanResult) {
    setAdopting(r);
    setAdoptForm({
      assetTag: r.macAddress ? r.macAddress.replace(/:/g, "").toUpperCase() : r.ipAddress.replace(/\./g, "-"),
      name: r.hostname || r.ipAddress,
      manufacturer: r.vendor ?? "",
      categoryId: guessCategoryId(r.deviceType, categories),
      notes: ["Discovered via IP Range Scanner.", r.deviceType ? `Detected type: ${r.deviceType}.` : null, r.macAddress ? `MAC: ${r.macAddress}.` : null].filter(Boolean).join(" "),
    });
  }

  const inputStyle = { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, backgroundColor: colors.surface };
  const netmaskOptions: PickerOption[] = CIDR_PRESETS.map((p) => ({ id: p, label: `/${p} (${p >= 31 ? "2" : (2 ** (32 - p) - 2).toLocaleString()} hosts)` }));
  const categoryOptions: PickerOption[] = (categories ?? []).map((c) => ({ id: c.id, label: c.name }));

  return (
    <KeyboardAvoidingScreen>
      <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg }}>
        <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 10, marginBottom: spacing.md }}>
          <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}>IP Range Scanner</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TextInput style={[inputStyle, { flex: 1 }]} value={startIp} onChangeText={handleStartIpChange} editable={!busy} autoCapitalize="none" placeholder="Start IP" placeholderTextColor={colors.textMuted} />
            <TextInput style={[inputStyle, { flex: 1 }]} value={endIp} onChangeText={setEndIp} editable={!busy} autoCapitalize="none" placeholder="End IP" placeholderTextColor={colors.textMuted} />
          </View>
          <TouchableOpacity style={[inputStyle, { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }]} disabled={busy} onPress={() => setNetmaskOpen(true)}>
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>Fill from netmask...</Text>
            <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
          </TouchableOpacity>

          {error && <Text style={{ color: colors.danger, fontSize: 12 }}>{error}</Text>}
          {scan?.status === "PENDING" && (
            <Text style={{ color: colors.primary, fontSize: 11.5 }}>Waiting for the network relay agent to pick up this scan.</Text>
          )}

          {hasPermission("network", "create") ? (
            <TouchableOpacity style={{ backgroundColor: colors.success, borderRadius: radius.md, alignItems: "center", paddingVertical: 12, opacity: busy ? 0.6 : 1 }} disabled={startMutation.isPending || busy} onPress={() => startMutation.mutate()}>
              {startMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>{scan?.status === "RUNNING" ? "Scanning…" : scan?.status === "PENDING" ? "Queued…" : "Start Scan"}</Text>}
            </TouchableOpacity>
          ) : (
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>You don't have permission to start scans.</Text>
          )}

          {scan && (
            <Text style={{ color: colors.textMuted, fontSize: 11.5 }}>
              {scan.startIp} – {scan.endIp} · {scan.scannedHosts}/{scan.totalHosts} scanned · {scan.aliveHosts} alive{scan.viaRelay ? " · via Relay" : ""}
            </Text>
          )}
          {scan?.status === "RUNNING" && (
            <View style={{ height: 6, borderRadius: radius.pill, backgroundColor: colors.border, overflow: "hidden" }}>
              <View style={{ width: `${progressPct}%`, height: "100%", backgroundColor: colors.primary }} />
            </View>
          )}

          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ color: colors.text, fontSize: 12.5 }}>Display: Alive only</Text>
            <Switch value={aliveOnly} onValueChange={setAliveOnly} trackColor={{ true: colors.primary, false: colors.border }} />
          </View>
        </View>

        {scan ? (
          <FlatList
            data={results}
            keyExtractor={(r) => String(r.id)}
            scrollEnabled={false}
            ListEmptyComponent={<Text style={{ color: colors.textMuted, textAlign: "center", paddingVertical: 16 }}>{scan.status === "RUNNING" ? "Scanning…" : "No hosts found."}</Text>}
            renderItem={({ item: r }) => (
              <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: 6 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: statusColor(r, colors) }} />
                  <Text style={{ color: colors.text, fontSize: 13.5, fontWeight: "700", fontFamily: "monospace" }}>{r.ipAddress}</Text>
                  {r.responseTimeMs != null && <Text style={{ color: colors.textMuted, fontSize: 11 }}>{r.responseTimeMs}ms</Text>}
                </View>
                <Text style={{ color: colors.textMuted, fontSize: 11.5, marginTop: 4 }}>
                  {r.hostname ?? "No hostname"}{r.macAddress ? ` · ${r.macAddress}` : ""}
                </Text>
                {(r.vendor || r.deviceType || r.os) && (
                  <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>{[r.vendor, r.deviceType, r.os].filter(Boolean).join(" · ")}</Text>
                )}
                {r.loggedInUser && <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>Logged in: {r.loggedInUser}</Text>}
                {r.openPorts.length > 0 && <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>Ports: {r.openPorts.join(", ")}</Text>}
                {r.alive && (
                  <View style={{ flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                    {hasPermission("network", "edit") && (
                      <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} disabled={promoteMutation.isPending} onPress={() => promoteMutation.mutate(r.id)}>
                        <Text style={{ color: colors.text, fontSize: 11, fontWeight: "700" }}>Add to Topology</Text>
                      </TouchableOpacity>
                    )}
                    {hasPermission("assets", "create") && (
                      <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.primary, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} onPress={() => openAdopt(r)}>
                        <Text style={{ color: colors.primary, fontSize: 11, fontWeight: "700" }}>Adopt into Inventory</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            )}
          />
        ) : (
          <Text style={{ color: colors.textMuted, textAlign: "center", paddingVertical: 16 }}>Enter a range above and tap Start Scan.</Text>
        )}

        {history && history.length > 0 && (
          <>
            <Text style={{ color: colors.text, fontSize: 13.5, fontWeight: "700", marginTop: spacing.md, marginBottom: spacing.sm }}>Recent Scans</Text>
            <FlatList
              data={history}
              keyExtractor={(s) => String(s.id)}
              scrollEnabled={false}
              renderItem={({ item: s }) => (
                <TouchableOpacity style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: 6 }} onPress={() => setActiveScanId(s.id)}>
                  <Text style={{ color: colors.text, fontSize: 12.5, fontWeight: "700", fontFamily: "monospace" }}>{s.startIp} – {s.endIp}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>{s.status} · {s.aliveHosts}/{s.totalHosts} alive · {dayjs(s.startedAt).format("DD MMM, HH:mm")}</Text>
                </TouchableOpacity>
              )}
            />
          </>
        )}

        <PickerModal visible={netmaskOpen} title="Netmask" options={netmaskOptions} onSelect={(id) => pickNetmask(Number(id))} onClose={() => setNetmaskOpen(false)} />

        {adopting && (
          <View style={{ position: "absolute", inset: 0, backgroundColor: "#0008", justifyContent: "flex-end" }}>
            <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, maxHeight: "85%" }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm }}>
                <Text style={{ color: colors.text, fontSize: 15, fontWeight: "700" }} numberOfLines={1}>Adopt "{adopting.hostname || adopting.ipAddress}"</Text>
                <TouchableOpacity onPress={() => setAdopting(null)}><Ionicons name="close" size={22} color={colors.textMuted} /></TouchableOpacity>
              </View>
              <ScrollView style={{ gap: 8 }} contentContainerStyle={{ gap: 8 }}>
                <TextInput style={inputStyle} placeholder="Asset Tag" placeholderTextColor={colors.textMuted} value={adoptForm.assetTag} onChangeText={(v) => setAdoptForm((f) => ({ ...f, assetTag: v }))} />
                <TextInput style={inputStyle} placeholder="Name" placeholderTextColor={colors.textMuted} value={adoptForm.name} onChangeText={(v) => setAdoptForm((f) => ({ ...f, name: v }))} />
                <TextInput style={inputStyle} placeholder="Manufacturer" placeholderTextColor={colors.textMuted} value={adoptForm.manufacturer} onChangeText={(v) => setAdoptForm((f) => ({ ...f, manufacturer: v }))} />
                <TouchableOpacity style={[inputStyle, { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }]} onPress={() => setCategoryPickerOpen(true)}>
                  <Text style={{ color: adoptForm.categoryId ? colors.text : colors.textMuted, fontSize: 13.5 }}>{categories?.find((c) => c.id === adoptForm.categoryId)?.name ?? "Select category…"}</Text>
                  <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
                </TouchableOpacity>
                <TextInput style={[inputStyle, { minHeight: 70, textAlignVertical: "top" }]} placeholder="Notes" placeholderTextColor={colors.textMuted} value={adoptForm.notes} onChangeText={(v) => setAdoptForm((f) => ({ ...f, notes: v }))} multiline />
              </ScrollView>
              <TouchableOpacity style={{ backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 12, marginTop: spacing.md, opacity: adoptForm.assetTag.trim() && adoptForm.name.trim() ? 1 : 0.5 }} disabled={!adoptForm.assetTag.trim() || !adoptForm.name.trim() || adoptMutation.isPending} onPress={() => adoptMutation.mutate()}>
                {adoptMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Adopt into Inventory</Text>}
              </TouchableOpacity>
            </View>
          </View>
        )}
        <PickerModal visible={categoryPickerOpen} title="Category" options={categoryOptions} allowClear selectedId={adoptForm.categoryId} onSelect={(id) => setAdoptForm((f) => ({ ...f, categoryId: id as number | null }))} onClose={() => setCategoryPickerOpen(false)} />
      </ScrollView>
    </KeyboardAvoidingScreen>
  );
}
