import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal, Platform, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { useAuth } from "../../auth/AuthContext";
import { ShimmerList } from "../../components/Shimmer";
import { BottomSheet } from "../../components/BottomSheet";
import { SwipeableRow } from "../../components/SwipeableRow";
import { OpeningAnimation } from "../../components/OpeningAnimation";

type GateState = "OPEN" | "CLOSED" | "UNKNOWN";

interface Gate {
  id: number;
  name: string;
  relayNumber: number;
  state: GateState;
  lastCheckedAt: string | null;
}

interface Net2Server {
  id: number;
  name: string;
  ipAddress: string;
  port: number;
  clientId: string | null;
  username: string | null;
  hasPassword: boolean;
  notes: string | null;
  status: "ONLINE" | "OFFLINE" | "UNKNOWN";
  lastCheckedAt: string | null;
  createdAt: string;
  gates: Gate[];
}
interface DiscoveryCandidate {
  ipAddress: string;
  openPorts: number[];
}

const GATE_STATE_LABEL: Record<GateState, string> = { OPEN: "Open", CLOSED: "Closed", UNKNOWN: "Unknown" };

const STATUS_COLOR: Record<string, string> = { ONLINE: "#22c55e", OFFLINE: "#ef4444", UNKNOWN: "#94a3b8" };

function isValidIpv4(ip: string): boolean {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  return !!m && m.slice(1).every((o) => Number(o) >= 0 && Number(o) <= 255);
}

// Mobile port of client/src/pages/gates/GatesPage.tsx — registering/discovering Paxton Net2 gate
// controller servers. No on-site "flip a switch" action lives here (that's Access Control's
// remote door open), but the user asked for full desktop/admin-tool parity on mobile, so unlike
// the earlier mobile pass this is no longer left off Controls.
export function GatesScreen() {
  const { colors, spacing, radius } = useTheme();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Net2Server | null>(null);
  const [prefill, setPrefill] = useState<{ ipAddress: string; port: number } | null>(null);
  const [showDiscover, setShowDiscover] = useState(false);
  const [startIp, setStartIp] = useState("192.168.1.1");
  const [endIp, setEndIp] = useState("192.168.1.254");
  const [candidates, setCandidates] = useState<DiscoveryCandidate[] | null>(null);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);

  const [activeGate, setActiveGate] = useState<Gate | null>(null);
  const [renamingGate, setRenamingGate] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [playKey, setPlayKey] = useState(0);
  const [addGateServerId, setAddGateServerId] = useState<number | null>(null);
  const [newGateName, setNewGateName] = useState("");
  const [newGateRelay, setNewGateRelay] = useState("");

  const { data: servers, isLoading } = useQuery({
    queryKey: ["mobile-gates-servers"],
    queryFn: async () => (await axiosClient.get("/gates/servers")).data as Net2Server[],
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => axiosClient.delete(`/gates/servers/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mobile-gates-servers"] }),
  });
  const testMutation = useMutation({
    mutationFn: (id: number) => axiosClient.post(`/gates/servers/${id}/test-connection`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mobile-gates-servers"] }),
  });
  const discoverMutation = useMutation({
    mutationFn: () => axiosClient.post("/gates/discover", { startIp, endIp }),
    onSuccess: (res) => { setDiscoveryError(null); setCandidates(res.data.candidates); },
    onError: (err: any) => { setDiscoveryError(err.response?.data?.error ?? "Could not scan that range."); setCandidates(null); },
  });

  function confirmDelete(server: Net2Server) {
    Alert.alert("Remove server", `Remove "${server.name}"? This only removes the registration from Kynren — it does not change anything on the Net2 server itself.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => deleteMutation.mutate(server.id) },
    ]);
  }

  const gateControlMutation = useMutation({
    mutationFn: ({ id, action }: { id: number; action: "open" | "close" }) => axiosClient.post(`/gates/gates/${id}/control`, { action }),
    onMutate: () => setPlayKey((k) => k + 1),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["mobile-gates-servers"] });
      if (!res.data.ok) Alert.alert("Command failed", res.data.message ?? "The Net2 server rejected this command.");
    },
    onError: (err: any) => Alert.alert("Command failed", err?.response?.data?.error ?? "Could not reach the Net2 server."),
  });

  const renameGateMutation = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => axiosClient.patch(`/gates/gates/${id}`, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mobile-gates-servers"] });
      setRenamingGate(false);
      setActiveGate(null);
    },
  });

  const deleteGateMutation = useMutation({
    mutationFn: (id: number) => axiosClient.delete(`/gates/gates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mobile-gates-servers"] });
      setActiveGate(null);
    },
  });

  const createGateMutation = useMutation({
    mutationFn: () => axiosClient.post(`/gates/servers/${addGateServerId}/gates`, { name: newGateName.trim(), relayNumber: Number(newGateRelay) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mobile-gates-servers"] });
      setAddGateServerId(null);
      setNewGateName("");
      setNewGateRelay("");
    },
  });

  function confirmDeleteGate(gate: Gate) {
    Alert.alert("Delete Gate", `Delete "${gate.name}"? This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteGateMutation.mutate(gate.id) },
    ]);
  }

  const gateTone = (state: GateState) => (state === "UNKNOWN" ? colors.textMuted : state === "OPEN" ? colors.danger : colors.success);

  const canCreate = hasPermission("gates", "create");
  const canEdit = hasPermission("gates", "edit");
  const canDelete = hasPermission("gates", "delete");

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ padding: spacing.lg, paddingBottom: spacing.sm, gap: spacing.sm }}>
        <Text style={{ color: colors.textMuted, fontSize: 11.5 }}>
          Paxton Net2 gate controller servers on the local network. Registration only tracks how to reach a server —
          full door/credential control depends on that server's Net2 Local Web API license.
        </Text>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          {canCreate && (
            <TouchableOpacity style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderColor: colors.primary, borderRadius: radius.md, paddingVertical: 10 }} onPress={() => setShowDiscover(true)}>
              <Ionicons name="radio-outline" size={15} color={colors.primary} />
              <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 12.5 }}>Discover</Text>
            </TouchableOpacity>
          )}
          {canCreate && (
            <TouchableOpacity style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 10 }} onPress={() => { setPrefill(null); setEditing(null); setShowForm(true); }}>
              <Ionicons name="add" size={16} color="#fff" />
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12.5 }}>Add Server</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {isLoading ? (
        <ShimmerList />
      ) : (
        <FlatList
          data={servers ?? []}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, gap: spacing.sm, paddingBottom: 40 }}
          ListEmptyComponent={<Text style={{ color: colors.textMuted, textAlign: "center", marginTop: 24 }}>No Net2 servers registered yet.</Text>}
          renderItem={({ item }) => (
            <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: STATUS_COLOR[item.status] }} />
                    <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}>{item.name}</Text>
                  </View>
                  <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2, fontFamily: "monospace" }}>{item.ipAddress}:{item.port}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                    {item.lastCheckedAt ? `Checked ${new Date(item.lastCheckedAt).toLocaleString()}` : "Never checked"}
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: "row", gap: 8, marginTop: spacing.sm }}>
                {canEdit && (
                  <TouchableOpacity style={{ flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }} disabled={testMutation.isPending} onPress={() => testMutation.mutate(item.id)}>
                    {testMutation.isPending ? <ActivityIndicator size="small" color={colors.text} /> : <Text style={{ color: colors.text, fontSize: 12, fontWeight: "700" }}>Test Connection</Text>}
                  </TouchableOpacity>
                )}
                {canEdit && (
                  <TouchableOpacity style={{ width: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }} onPress={() => { setEditing(item); setShowForm(true); }}>
                    <Ionicons name="create-outline" size={16} color={colors.text} />
                  </TouchableOpacity>
                )}
                {canDelete && (
                  <TouchableOpacity style={{ width: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.md, borderWidth: 1, borderColor: colors.danger }} onPress={() => confirmDelete(item)}>
                    <Ionicons name="trash-outline" size={16} color={colors.danger} />
                  </TouchableOpacity>
                )}
              </View>

              <View style={{ marginTop: spacing.sm, gap: 6 }}>
                {item.gates.map((gate) => (
                  <SwipeableRow
                    key={gate.id}
                    disabled={!canEdit}
                    onSwipeRight={() => gateControlMutation.mutate({ id: gate.id, action: "open" })}
                    onSwipeLeft={() => gateControlMutation.mutate({ id: gate.id, action: "close" })}
                    rightLabel="Open"
                    leftLabel="Close"
                    rightIcon="lock-open-outline"
                    leftIcon="lock-closed-outline"
                  >
                    <TouchableOpacity
                      style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 10 }}
                      onPress={() => setActiveGate(gate)}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600" }}>{gate.name}</Text>
                        <Text style={{ color: colors.textMuted, fontSize: 10.5, marginTop: 1 }}>Relay {gate.relayNumber}</Text>
                      </View>
                      <View style={{ backgroundColor: gateTone(gate.state) + "22", borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 3 }}>
                        <Text style={{ color: gateTone(gate.state), fontSize: 10.5, fontWeight: "700" }}>{GATE_STATE_LABEL[gate.state]}</Text>
                      </View>
                    </TouchableOpacity>
                  </SwipeableRow>
                ))}
                {canCreate && (
                  <TouchableOpacity
                    style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderColor: colors.border, borderStyle: "dashed", borderRadius: radius.md, paddingVertical: 8 }}
                    onPress={() => setAddGateServerId(item.id)}
                  >
                    <Ionicons name="add" size={14} color={colors.textMuted} />
                    <Text style={{ color: colors.textMuted, fontSize: 11.5, fontWeight: "700" }}>Add Gate</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
        />
      )}

      <Modal visible={showDiscover} animationType="slide" transparent onRequestClose={() => setShowDiscover(false)}>
        <View style={{ flex: 1, backgroundColor: "#0008", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, maxHeight: "80%" }}>
            <Text style={{ color: colors.text, fontSize: 16, fontWeight: "700", marginBottom: 4 }}>Discover Servers</Text>
            <Text style={{ color: colors.textMuted, fontSize: 11.5, marginBottom: spacing.md }}>
              Probes each address in the range for Net2's default API ports (8443, 8080). Only finds servers reachable
              from wherever the Kynren server runs.
            </Text>
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
              <TextInput style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, color: colors.text, fontFamily: "monospace", fontSize: 12.5 }} autoCapitalize="none" value={startIp} onChangeText={setStartIp} />
              <Text style={{ color: colors.textMuted }}>to</Text>
              <TextInput style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, color: colors.text, fontFamily: "monospace", fontSize: 12.5 }} autoCapitalize="none" value={endIp} onChangeText={setEndIp} />
            </View>
            <TouchableOpacity
              style={{ backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 12, marginTop: spacing.md, opacity: isValidIpv4(startIp) && isValidIpv4(endIp) ? 1 : 0.6 }}
              disabled={!isValidIpv4(startIp) || !isValidIpv4(endIp) || discoverMutation.isPending}
              onPress={() => discoverMutation.mutate()}
            >
              {discoverMutation.isPending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Scan Range</Text>}
            </TouchableOpacity>

            {discoveryError && <Text style={{ color: colors.danger, fontSize: 12, marginTop: spacing.sm }}>{discoveryError}</Text>}

            {candidates && (
              <FlatList
                data={candidates}
                keyExtractor={(c) => c.ipAddress}
                style={{ marginTop: spacing.md, maxHeight: 260 }}
                ListEmptyComponent={<Text style={{ color: colors.textMuted, fontSize: 12.5, textAlign: "center" }}>No candidates found in that range.</Text>}
                renderItem={({ item }) => (
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                    <View>
                      <Text style={{ color: colors.text, fontSize: 13, fontWeight: "700", fontFamily: "monospace" }}>{item.ipAddress}</Text>
                      <Text style={{ color: colors.textMuted, fontSize: 11 }}>open ports: {item.openPorts.join(", ")}</Text>
                    </View>
                    <TouchableOpacity
                      style={{ borderWidth: 1, borderColor: colors.primary, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 6 }}
                      onPress={() => { setPrefill({ ipAddress: item.ipAddress, port: item.openPorts.includes(8443) ? 8443 : item.openPorts[0] }); setEditing(null); setShowDiscover(false); setShowForm(true); }}
                    >
                      <Text style={{ color: colors.primary, fontSize: 11.5, fontWeight: "700" }}>Add</Text>
                    </TouchableOpacity>
                  </View>
                )}
              />
            )}

            <TouchableOpacity style={{ alignItems: "center", paddingVertical: 12, marginTop: spacing.sm }} onPress={() => setShowDiscover(false)}>
              <Text style={{ color: colors.textMuted, fontWeight: "700", fontSize: 12.5 }}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showForm} animationType="slide" transparent onRequestClose={() => setShowForm(false)}>
        <Net2ServerForm
          server={editing}
          prefill={prefill}
          onCancel={() => { setShowForm(false); setEditing(null); setPrefill(null); }}
          onSaved={() => { setShowForm(false); setEditing(null); setPrefill(null); queryClient.invalidateQueries({ queryKey: ["mobile-gates-servers"] }); }}
        />
      </Modal>

      <BottomSheet
        visible={!!activeGate}
        onClose={() => { setActiveGate(null); setRenamingGate(false); }}
        title={activeGate?.name}
      >
        {activeGate && (
          <View style={{ gap: spacing.sm }}>
            <View style={{ alignItems: "center", marginBottom: spacing.sm }}>
              <OpeningAnimation kind="gate" playKey={playKey} active={activeGate.state === "OPEN"} size={52} />
            </View>

            {canEdit && (
              <>
                <TouchableOpacity
                  disabled={gateControlMutation.isPending}
                  onPress={() => gateControlMutation.mutate({ id: activeGate.id, action: "open" })}
                  style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md }}
                >
                  <Ionicons name="lock-open-outline" size={18} color={colors.primary} />
                  <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600" }}>Open</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  disabled={gateControlMutation.isPending}
                  onPress={() => gateControlMutation.mutate({ id: activeGate.id, action: "close" })}
                  style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md }}
                >
                  <Ionicons name="lock-closed-outline" size={18} color={colors.primary} />
                  <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600" }}>Close</Text>
                </TouchableOpacity>
              </>
            )}

            {renamingGate ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: spacing.sm }}>
                <TextInput
                  style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colors.text, backgroundColor: colors.bg }}
                  value={renameValue}
                  onChangeText={setRenameValue}
                  autoFocus
                />
                <TouchableOpacity
                  disabled={renameGateMutation.isPending || !renameValue.trim()}
                  onPress={() => renameGateMutation.mutate({ id: activeGate.id, name: renameValue.trim() })}
                  style={{ backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 10 }}
                >
                  {renameGateMutation.isPending ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12.5 }}>Save</Text>}
                </TouchableOpacity>
              </View>
            ) : (
              canEdit && (
                <TouchableOpacity
                  style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: spacing.sm, marginTop: spacing.xs }}
                  onPress={() => { setRenameValue(activeGate.name); setRenamingGate(true); }}
                >
                  <Ionicons name="pencil-outline" size={17} color={colors.text} />
                  <Text style={{ color: colors.text, fontSize: 13.5, fontWeight: "600" }}>Rename Gate</Text>
                </TouchableOpacity>
              )
            )}

            {canDelete && (
              <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: spacing.sm }} onPress={() => confirmDeleteGate(activeGate)}>
                <Ionicons name="trash-outline" size={17} color={colors.danger} />
                <Text style={{ color: colors.danger, fontSize: 13.5, fontWeight: "600" }}>Delete Gate</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </BottomSheet>

      <BottomSheet visible={addGateServerId != null} onClose={() => setAddGateServerId(null)} title="Add Gate">
        <View style={{ gap: spacing.md }}>
          <View>
            <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "700", marginBottom: 8, textTransform: "uppercase" }}>Gate Name</Text>
            <TextInput
              style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, backgroundColor: colors.bg }}
              placeholder="e.g. Main Barrier"
              placeholderTextColor={colors.textMuted}
              value={newGateName}
              onChangeText={setNewGateName}
            />
          </View>
          <View>
            <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "700", marginBottom: 8, textTransform: "uppercase" }}>Relay Number</Text>
            <TextInput
              style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, backgroundColor: colors.bg }}
              placeholder="e.g. 1"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
              value={newGateRelay}
              onChangeText={setNewGateRelay}
            />
          </View>
          <TouchableOpacity
            disabled={!newGateName.trim() || !newGateRelay.trim() || createGateMutation.isPending}
            onPress={() => createGateMutation.mutate()}
            style={{ backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 13, opacity: !newGateName.trim() || !newGateRelay.trim() ? 0.5 : 1 }}
          >
            {createGateMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700" }}>Create Gate</Text>}
          </TouchableOpacity>
        </View>
      </BottomSheet>
    </View>
  );
}

function Net2ServerForm({
  server,
  prefill,
  onCancel,
  onSaved,
}: {
  server: Net2Server | null;
  prefill: { ipAddress: string; port: number } | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { colors, spacing, radius } = useTheme();
  const [name, setName] = useState(server?.name ?? "");
  const [ipAddress, setIpAddress] = useState(server?.ipAddress ?? prefill?.ipAddress ?? "");
  const [port, setPort] = useState(String(server?.port ?? prefill?.port ?? 8443));
  const [clientId, setClientId] = useState(server?.clientId ?? "");
  const [username, setUsername] = useState(server?.username ?? "");
  const [password, setPassword] = useState("");
  const [notes, setNotes] = useState(server?.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (): Promise<{ data: any }> => {
      const payload: any = { name: name.trim(), ipAddress: ipAddress.trim(), port: Number(port), clientId: clientId.trim() || null, username: username.trim() || null, notes: notes.trim() || null };
      if (password) payload.password = password;
      return server ? axiosClient.patch(`/gates/servers/${server.id}`, payload) : axiosClient.post("/gates/servers", payload);
    },
    onSuccess: onSaved,
    onError: (err: any) => setError(err?.response?.data?.error ?? "Could not save this server."),
  });

  const portNum = Number(port);
  const canSubmit = name.trim().length > 0 && isValidIpv4(ipAddress.trim()) && portNum >= 1 && portNum <= 65535;
  const inputStyle = { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13.5, color: colors.text, backgroundColor: colors.bg };
  const labelStyle = { color: colors.textMuted, fontSize: 11, fontWeight: "700" as const, textTransform: "uppercase" as const, marginBottom: 6, marginTop: spacing.sm };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: "#0008", justifyContent: "flex-end" }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, maxHeight: "88%" }}>
        <Text style={{ color: colors.text, fontSize: 16, fontWeight: "700" }}>{server ? `Edit "${server.name}"` : "Register Net2 Server"}</Text>

        {error && <Text style={{ color: colors.danger, fontSize: 12, marginTop: spacing.sm }}>{error}</Text>}

        <Text style={[labelStyle, { marginTop: spacing.md }]}>Name</Text>
        <TextInput style={inputStyle} placeholder="e.g. Main Building Net2 Server" placeholderTextColor={colors.textMuted} value={name} onChangeText={setName} />

        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 2 }}>
            <Text style={labelStyle}>IP Address</Text>
            <TextInput style={[inputStyle, { fontFamily: "monospace" }]} autoCapitalize="none" placeholder="192.168.1.50" placeholderTextColor={colors.textMuted} value={ipAddress} onChangeText={setIpAddress} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={labelStyle}>Port</Text>
            <TextInput style={inputStyle} keyboardType="number-pad" value={port} onChangeText={setPort} />
          </View>
        </View>

        <Text style={labelStyle}>Client ID</Text>
        <TextInput style={inputStyle} placeholder="Net2 API client ID, if known" placeholderTextColor={colors.textMuted} value={clientId} onChangeText={setClientId} />

        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={labelStyle}>Username</Text>
            <TextInput style={inputStyle} autoCapitalize="none" value={username} onChangeText={setUsername} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={labelStyle}>Password {server?.hasPassword && !password ? "(saved)" : ""}</Text>
            <TextInput style={inputStyle} secureTextEntry autoCapitalize="none" value={password} onChangeText={setPassword} />
          </View>
        </View>

        <Text style={labelStyle}>Notes</Text>
        <TextInput style={[inputStyle, { minHeight: 60, textAlignVertical: "top" }]} multiline value={notes} onChangeText={setNotes} />

        <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: spacing.md }}>
          Credentials are stored encrypted and only used to connect to this Net2 server.
        </Text>

        <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg }}>
          <TouchableOpacity style={{ flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }} onPress={onCancel}>
            <Text style={{ color: colors.text, fontWeight: "700", fontSize: 13 }}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={{ flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: radius.md, backgroundColor: colors.primary, opacity: canSubmit ? 1 : 0.6 }} disabled={!canSubmit || mutation.isPending} onPress={() => mutation.mutate()}>
            {mutation.isPending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>{server ? "Save Changes" : "Register"}</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
