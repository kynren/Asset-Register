import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ActivityIndicator, FlatList, Modal, ScrollView, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { useAuth } from "../../auth/AuthContext";
import { PickerModal, PickerOption } from "../../components/PickerModal";
import { KeyboardAvoidingScreen } from "../../components/KeyboardAvoidingScreen";
import { ShimmerList } from "../../components/Shimmer";

interface AdoptedSwitch {
  id: number; assetTag: string; name: string; status: string; manufacturer: string | null; model: string | null;
  serialNumber: string | null; staticIpAddress: string | null; notes: string | null; nextServiceDate: string | null;
  gridPowered: boolean; remoteManagementEnabled: boolean; portCount: number;
}
interface DiscoveredCandidate { id: number; ipAddress: string; hostname: string | null; macAddress: string | null; vendor: string | null; openPorts: number[]; alreadyAdopted: boolean }
interface SwitchingData { adopted: AdoptedSwitch[]; discovered: DiscoveredCandidate[]; scannedAt: string | null }
interface AssetCategory { id: number; name: string; isSwitchingDevice: boolean }

const STATUS_OPTIONS: PickerOption[] = [
  { id: "IN_USE", label: "In Use" },
  { id: "IN_STORAGE", label: "In Storage" },
  { id: "IN_REPAIR", label: "In Repair" },
  { id: "RETIRED", label: "Retired" },
  { id: "LOST", label: "Lost" },
];

function emptyForm() {
  return { assetTag: "", name: "", status: "IN_USE", manufacturer: "", model: "", serialNumber: "", notes: "", nextServiceDate: "", gridPowered: false, remoteManagementEnabled: false };
}

// Mirrors client/src/pages/network/SwitchingTab.tsx + SwitchPortsPanel.tsx. Adopt/Add/Edit share
// one inline form here (a scoped subset of AssetFormModal's fields relevant to a switching
// device) rather than the full multi-tab asset editor.
export function SwitchingScreen() {
  const { colors, spacing, radius } = useTheme();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [formMode, setFormMode] = useState<"adopt" | "add" | "edit" | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [statusPickerOpen, setStatusPickerOpen] = useState(false);
  const [adoptingTarget, setAdoptingTarget] = useState<DiscoveredCandidate | null>(null);
  const [editingTarget, setEditingTarget] = useState<AdoptedSwitch | null>(null);
  const [portsFor, setPortsFor] = useState<AdoptedSwitch | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ["mobile-network-switching"], queryFn: async () => (await axiosClient.get("/network/switching")).data as SwitchingData });
  const { data: categories } = useQuery({ queryKey: ["mobile-asset-categories-switching"], queryFn: async () => (await axiosClient.get("/asset-categories")).data as AssetCategory[] });
  const switchingCategoryId = categories?.find((c) => c.isSwitchingDevice)?.id ?? null;

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ["mobile-network-switching"] });
    queryClient.invalidateQueries({ queryKey: ["mobile-assets"] });
  }

  function closeForm() { setFormMode(null); setForm(emptyForm()); setAdoptingTarget(null); setEditingTarget(null); }

  function startAdopt(c: DiscoveredCandidate) {
    setAdoptingTarget(c);
    setForm({ ...emptyForm(), assetTag: c.macAddress ? c.macAddress.replace(/:/g, "").toUpperCase() : c.ipAddress.replace(/\./g, "-"), name: c.hostname || c.ipAddress, manufacturer: c.vendor ?? "", notes: "Discovered via IP Range Scanner network infrastructure heuristic." });
    setFormMode("adopt");
  }
  function startAdd() { setForm(emptyForm()); setFormMode("add"); }
  function startEdit(s: AdoptedSwitch) {
    setEditingTarget(s);
    setForm({ assetTag: s.assetTag, name: s.name, status: s.status, manufacturer: s.manufacturer ?? "", model: s.model ?? "", serialNumber: s.serialNumber ?? "", notes: s.notes ?? "", nextServiceDate: s.nextServiceDate ? s.nextServiceDate.slice(0, 10) : "", gridPowered: s.gridPowered, remoteManagementEnabled: s.remoteManagementEnabled });
    setFormMode("edit");
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const base: Record<string, unknown> = { ...form, nextServiceDate: form.nextServiceDate ? new Date(form.nextServiceDate).toISOString() : null };
      if (formMode === "edit") return axiosClient.patch(`/assets/${editingTarget!.id}`, base);
      base.categoryId = switchingCategoryId;
      if (formMode === "adopt") base.staticIpAddress = adoptingTarget!.ipAddress;
      return axiosClient.post("/assets", base);
    },
    onSuccess: () => { invalidateAll(); closeForm(); },
  });

  const inputStyle = { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, backgroundColor: colors.surface };

  if (isLoading) return <ShimmerList />;

  return (
    <KeyboardAvoidingScreen>
      <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg }}>
        <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: spacing.md }}>
          Switches and routers on the network — adopt discovered gear into Asset Inventory, then map its physical ports.
        </Text>

        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm }}>
          <Text style={{ color: colors.text, fontSize: 13.5, fontWeight: "700" }}>Adopted Switching Devices</Text>
          {hasPermission("network", "create") && (
            <TouchableOpacity onPress={startAdd}>
              <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "700" }}>+ Add</Text>
            </TouchableOpacity>
          )}
        </View>
        {(data?.adopted ?? []).length === 0 ? (
          <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: spacing.md }}>No switching devices adopted yet.</Text>
        ) : (
          <FlatList
            data={data?.adopted}
            keyExtractor={(s) => String(s.id)}
            scrollEnabled={false}
            renderItem={({ item: s }) => (
              <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: 6 }}>
                <Text style={{ color: colors.text, fontSize: 13.5, fontWeight: "700" }}>{s.name}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 11.5, marginTop: 2 }}>{s.assetTag} · {[s.manufacturer, s.model].filter(Boolean).join(" ") || "No mfr/model"}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>{s.staticIpAddress ?? "No IP"} · {s.portCount} port{s.portCount === 1 ? "" : "s"} mapped</Text>
                {hasPermission("network", "edit") && (
                  <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                    <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} onPress={() => startEdit(s)}>
                      <Text style={{ color: colors.text, fontSize: 11, fontWeight: "700" }}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} onPress={() => setPortsFor(s)}>
                      <Text style={{ color: colors.text, fontSize: 11, fontWeight: "700" }}>Manage Ports</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}
          />
        )}

        <View style={{ marginTop: spacing.md, marginBottom: spacing.sm }}>
          <Text style={{ color: colors.text, fontSize: 13.5, fontWeight: "700" }}>Discovered on Network</Text>
          {data?.scannedAt && <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>From scan completed {dayjs(data.scannedAt).format("DD MMM, HH:mm")}</Text>}
        </View>
        {(data?.discovered ?? []).length === 0 ? (
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>No candidate switching devices found in the most recent scan.</Text>
        ) : (
          <FlatList
            data={data?.discovered}
            keyExtractor={(c) => String(c.id)}
            scrollEnabled={false}
            renderItem={({ item: c }) => (
              <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: 6 }}>
                <Text style={{ color: colors.text, fontSize: 13, fontWeight: "700", fontFamily: "monospace" }}>{c.ipAddress}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 11.5, marginTop: 2 }}>{c.hostname ?? "No hostname"} · {c.macAddress ?? "No MAC"}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>{c.vendor ?? "Unknown vendor"}{c.openPorts.length ? ` · Ports: ${c.openPorts.join(", ")}` : ""}</Text>
                {c.alreadyAdopted ? (
                  <View style={{ backgroundColor: colors.border, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, alignSelf: "flex-start", marginTop: 8 }}>
                    <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: "700" }}>Already Adopted</Text>
                  </View>
                ) : hasPermission("network", "edit") ? (
                  <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.primary, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6, alignSelf: "flex-start", marginTop: 8 }} onPress={() => startAdopt(c)}>
                    <Text style={{ color: colors.primary, fontSize: 11, fontWeight: "700" }}>Adopt into Inventory</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            )}
          />
        )}

        {formMode && (
          <View style={{ position: "absolute", inset: 0, backgroundColor: "#0008", justifyContent: "flex-end" }}>
            <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, maxHeight: "85%" }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm }}>
                <Text style={{ color: colors.text, fontSize: 15, fontWeight: "700" }}>{formMode === "add" ? "Add Switching Device" : formMode === "adopt" ? "Adopt Device" : `Edit "${editingTarget?.name}"`}</Text>
                <TouchableOpacity onPress={closeForm}><Ionicons name="close" size={22} color={colors.textMuted} /></TouchableOpacity>
              </View>
              <ScrollView contentContainerStyle={{ gap: 8 }}>
                <TextInput style={inputStyle} placeholder="Asset Tag" placeholderTextColor={colors.textMuted} value={form.assetTag} onChangeText={(v) => setForm((f) => ({ ...f, assetTag: v }))} />
                <TextInput style={inputStyle} placeholder="Name" placeholderTextColor={colors.textMuted} value={form.name} onChangeText={(v) => setForm((f) => ({ ...f, name: v }))} />
                {formMode === "edit" && (
                  <TouchableOpacity style={[inputStyle, { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }]} onPress={() => setStatusPickerOpen(true)}>
                    <Text style={{ color: colors.text, fontSize: 13.5 }}>{STATUS_OPTIONS.find((o) => o.id === form.status)?.label}</Text>
                    <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                )}
                <TextInput style={inputStyle} placeholder="Manufacturer" placeholderTextColor={colors.textMuted} value={form.manufacturer} onChangeText={(v) => setForm((f) => ({ ...f, manufacturer: v }))} />
                <TextInput style={inputStyle} placeholder="Model" placeholderTextColor={colors.textMuted} value={form.model} onChangeText={(v) => setForm((f) => ({ ...f, model: v }))} />
                <TextInput style={inputStyle} placeholder="Serial Number" placeholderTextColor={colors.textMuted} value={form.serialNumber} onChangeText={(v) => setForm((f) => ({ ...f, serialNumber: v }))} />
                <TextInput style={inputStyle} placeholder="Next Service Date (YYYY-MM-DD)" placeholderTextColor={colors.textMuted} value={form.nextServiceDate} onChangeText={(v) => setForm((f) => ({ ...f, nextServiceDate: v }))} />
                <TextInput style={[inputStyle, { minHeight: 70, textAlignVertical: "top" }]} placeholder="Notes" placeholderTextColor={colors.textMuted} value={form.notes} onChangeText={(v) => setForm((f) => ({ ...f, notes: v }))} multiline />
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <Text style={{ color: colors.text, fontSize: 12.5 }}>Grid Powered</Text>
                  <Switch value={form.gridPowered} onValueChange={(v) => setForm((f) => ({ ...f, gridPowered: v }))} trackColor={{ true: colors.primary, false: colors.border }} />
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <Text style={{ color: colors.text, fontSize: 12.5 }}>Remote Management Enabled</Text>
                  <Switch value={form.remoteManagementEnabled} onValueChange={(v) => setForm((f) => ({ ...f, remoteManagementEnabled: v }))} trackColor={{ true: colors.primary, false: colors.border }} />
                </View>
              </ScrollView>
              <TouchableOpacity style={{ backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 12, marginTop: spacing.md, opacity: form.assetTag.trim() && form.name.trim() ? 1 : 0.5 }} disabled={!form.assetTag.trim() || !form.name.trim() || saveMutation.isPending} onPress={() => saveMutation.mutate()}>
                {saveMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>{formMode === "edit" ? "Save" : formMode === "adopt" ? "Adopt into Inventory" : "Create"}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        )}
        <PickerModal visible={statusPickerOpen} title="Status" options={STATUS_OPTIONS} selectedId={form.status} onSelect={(id) => setForm((f) => ({ ...f, status: String(id) }))} onClose={() => setStatusPickerOpen(false)} />
      </ScrollView>

      {portsFor && <SwitchPortsModal asset={portsFor} onClose={() => setPortsFor(null)} />}
    </KeyboardAvoidingScreen>
  );
}

interface Port { id: number; portNumber: number; label: string | null; status: "UP" | "DOWN" | "DISABLED"; vlan: string | null; connectedAssetId: number | null; connectedAsset: { id: number; assetTag: string; name: string } | null; notes: string | null }
interface AssetOption { id: number; assetTag: string; name: string }

const PORT_STATUS_OPTIONS: PickerOption[] = [
  { id: "UP", label: "Up / Connected" },
  { id: "DOWN", label: "Down / Unused" },
  { id: "DISABLED", label: "Administratively Disabled" },
];

function SwitchPortsModal({ asset, onClose }: { asset: AdoptedSwitch; onClose: () => void }) {
  const { colors, spacing, radius } = useTheme();
  const queryClient = useQueryClient();
  const queryKey = ["mobile-switch-ports", asset.id];
  const [initCount, setInitCount] = useState(24);
  const [editingPort, setEditingPort] = useState<Port | null>(null);
  const [portForm, setPortForm] = useState({ label: "", status: "UP" as Port["status"], vlan: "", connectedAssetId: null as number | null, notes: "" });
  const [statusPickerOpen, setStatusPickerOpen] = useState(false);
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);

  const { data: ports, isLoading } = useQuery({ queryKey, queryFn: async () => (await axiosClient.get(`/assets/${asset.id}/ports`)).data as Port[] });
  const { data: assetOptions } = useQuery({ queryKey: ["mobile-assets-for-port-mapping"], queryFn: async () => (await axiosClient.get("/assets", { params: { pageSize: 300 } })).data.items as AssetOption[] });

  const initMutation = useMutation({ mutationFn: (count: number) => axiosClient.post(`/assets/${asset.id}/ports/init`, { count }), onSuccess: () => queryClient.invalidateQueries({ queryKey }) });
  const updatePortMutation = useMutation({
    mutationFn: () => axiosClient.patch(`/assets/${asset.id}/ports/${editingPort!.id}`, { label: portForm.label || null, status: portForm.status, vlan: portForm.vlan || null, connectedAssetId: portForm.connectedAssetId, notes: portForm.notes || null }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey }); setEditingPort(null); },
  });

  function openPort(p: Port) {
    setEditingPort(p);
    setPortForm({ label: p.label ?? "", status: p.status, vlan: p.vlan ?? "", connectedAssetId: p.connectedAssetId, notes: p.notes ?? "" });
  }

  const statusColor: Record<Port["status"], string> = { UP: colors.success, DOWN: colors.border, DISABLED: colors.danger };
  const otherAssets = (assetOptions ?? []).filter((a) => a.id !== asset.id);
  const assetPickerOptions: PickerOption[] = otherAssets.map((a) => ({ id: a.id, label: `${a.assetTag} — ${a.name}` }));
  const inputStyle = { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 10, fontSize: 13.5, color: colors.text, backgroundColor: colors.bg };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <View>
            <Text style={{ color: colors.text, fontSize: 15, fontWeight: "700" }}>Port Map — {asset.name}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 11.5 }}>{asset.assetTag}</Text>
          </View>
          <TouchableOpacity onPress={onClose}><Ionicons name="close" size={24} color={colors.textMuted} /></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
          {isLoading ? (
            <ShimmerList />
          ) : !ports || ports.length === 0 ? (
            <View style={{ alignItems: "center", gap: spacing.sm }}>
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>No ports mapped for this switch yet.</Text>
              <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                <TextInput style={[inputStyle, { width: 90, textAlign: "center" }]} keyboardType="number-pad" value={String(initCount)} onChangeText={(v) => setInitCount(Number(v) || 0)} />
                <TouchableOpacity style={{ backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 10 }} disabled={initMutation.isPending} onPress={() => initMutation.mutate(initCount)}>
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12.5 }}>Initialize {initCount} Ports</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: spacing.md }}>
                {(["UP", "DOWN", "DISABLED"] as Port["status"][]).map((s) => (
                  <View key={s} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                    <View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: statusColor[s] }} />
                    <Text style={{ color: colors.textMuted, fontSize: 10.5 }}>{s === "UP" ? "Up / Connected" : s === "DOWN" ? "Down / Unused" : "Disabled"}</Text>
                  </View>
                ))}
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: spacing.md }}>
                {ports.map((p) => (
                  <TouchableOpacity key={p.id} onPress={() => openPort(p)} style={{ width: 68, borderWidth: 1, borderColor: colors.border, borderTopWidth: 3, borderTopColor: statusColor[p.status], borderRadius: radius.sm, padding: 6, alignItems: "center", backgroundColor: colors.surface }}>
                    <Text style={{ color: colors.text, fontSize: 13, fontWeight: "700" }}>{p.portNumber}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 8.5 }} numberOfLines={1}>{p.label || p.connectedAsset?.assetTag || "—"}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                <TextInput style={[inputStyle, { width: 90, textAlign: "center" }]} keyboardType="number-pad" value={String(initCount)} onChangeText={(v) => setInitCount(Number(v) || 0)} />
                <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 10 }} disabled={initMutation.isPending} onPress={() => initMutation.mutate(initCount)}>
                  <Text style={{ color: colors.text, fontWeight: "700", fontSize: 12 }}>Add Ports Up To {initCount}</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </ScrollView>

        {editingPort && (
          <View style={{ position: "absolute", inset: 0, backgroundColor: "#0008", justifyContent: "flex-end" }}>
            <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg }}>
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: "700", marginBottom: spacing.sm }}>Port {editingPort.portNumber}</Text>
              <View style={{ gap: 8 }}>
                <TextInput style={inputStyle} placeholder="Label (e.g. Uplink to Core)" placeholderTextColor={colors.textMuted} value={portForm.label} onChangeText={(v) => setPortForm((f) => ({ ...f, label: v }))} />
                <TouchableOpacity style={[inputStyle, { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }]} onPress={() => setStatusPickerOpen(true)}>
                  <Text style={{ color: colors.text, fontSize: 13 }}>{PORT_STATUS_OPTIONS.find((o) => o.id === portForm.status)?.label}</Text>
                  <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
                </TouchableOpacity>
                <TextInput style={inputStyle} placeholder="VLAN (e.g. 10, 20-Guest)" placeholderTextColor={colors.textMuted} value={portForm.vlan} onChangeText={(v) => setPortForm((f) => ({ ...f, vlan: v }))} />
                <TouchableOpacity style={[inputStyle, { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }]} onPress={() => setAssetPickerOpen(true)}>
                  <Text style={{ color: portForm.connectedAssetId ? colors.text : colors.textMuted, fontSize: 13 }}>{otherAssets.find((a) => a.id === portForm.connectedAssetId)?.name ?? "-- None --"}</Text>
                  <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
                </TouchableOpacity>
                <TextInput style={[inputStyle, { minHeight: 60, textAlignVertical: "top" }]} placeholder="Notes" placeholderTextColor={colors.textMuted} value={portForm.notes} onChangeText={(v) => setPortForm((f) => ({ ...f, notes: v }))} multiline />
              </View>
              <View style={{ flexDirection: "row", gap: 8, marginTop: spacing.md }}>
                <TouchableOpacity style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, alignItems: "center", paddingVertical: 10 }} onPress={() => setEditingPort(null)}>
                  <Text style={{ color: colors.text, fontWeight: "700", fontSize: 12.5 }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={{ flex: 1, backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 10 }} disabled={updatePortMutation.isPending} onPress={() => updatePortMutation.mutate()}>
                  {updatePortMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12.5 }}>Save Port</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
        <PickerModal visible={statusPickerOpen} title="Port Status" options={PORT_STATUS_OPTIONS} selectedId={portForm.status} onSelect={(id) => setPortForm((f) => ({ ...f, status: id as Port["status"] }))} onClose={() => setStatusPickerOpen(false)} />
        <PickerModal visible={assetPickerOpen} title="Connected Asset" options={assetPickerOptions} searchable allowClear selectedId={portForm.connectedAssetId} onSelect={(id) => setPortForm((f) => ({ ...f, connectedAssetId: id as number | null }))} onClose={() => setAssetPickerOpen(false)} />
      </View>
    </Modal>
  );
}
