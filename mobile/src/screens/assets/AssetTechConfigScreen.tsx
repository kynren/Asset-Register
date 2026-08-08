import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRoute, RouteProp } from "@react-navigation/native";
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { ShimmerDetail } from "../../components/Shimmer";
import { PickerModal, PickerOption } from "../../components/PickerModal";
import { Asset } from "../../types/asset";
import { AssetsStackParamList } from "../../navigation/types";

const PROTOCOLS: PickerOption[] = ["RDP", "SSH", "VNC", "TeamViewer", "AnyDesk", "Other"].map((p) => ({ id: p, label: p }));
const AV_STATUSES: PickerOption[] = ["PROTECTED", "AT_RISK", "DISABLED", "UNKNOWN"].map((s) => ({ id: s, label: s.replace("_", " ") }));

function SectionCard({ title, children, colors, spacing, radius }: { title: string; children: React.ReactNode; colors: any; spacing: any; radius: any }) {
  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 10 }}>
      <Text style={{ color: colors.text, fontSize: 13, fontWeight: "700" }}>{title}</Text>
      {children}
    </View>
  );
}

function ToggleRow({ label, value, onChange, colors, radius }: { label: string; value: boolean; onChange: (v: boolean) => void; colors: any; radius: any }) {
  return (
    <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12 }} onPress={() => onChange(!value)}>
      <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600" }}>{label}</Text>
      <View style={{ width: 42, height: 24, borderRadius: 12, backgroundColor: value ? colors.primary : colors.border, padding: 2, justifyContent: "center" }}>
        <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: "#fff", marginLeft: value ? 18 : 0 }} />
      </View>
    </TouchableOpacity>
  );
}

// Combines client/src/pages/assets/detail/NetworkSettingsCard.tsx (edit form — mobile previously
// only showed this read-only), RemoteManagementTab.tsx, VirtualizationTab.tsx, and
// AntivirusTab.tsx — four independent PATCH /assets/:id sections, each with its own Save.
export function AssetTechConfigScreen() {
  const { colors, spacing, radius } = useTheme();
  const route = useRoute<RouteProp<AssetsStackParamList, "AssetTechConfig">>();
  const { assetId } = route.params;
  const queryClient = useQueryClient();

  const { data: asset, isLoading } = useQuery({ queryKey: ["mobile-asset", assetId], queryFn: async () => (await axiosClient.get(`/assets/${assetId}`)).data as Asset });

  const [staticIpAddress, setStaticIpAddress] = useState("");
  const [subnetMask, setSubnetMask] = useState("");
  const [defaultGateway, setDefaultGateway] = useState("");
  const [dnsServers, setDnsServers] = useState("");

  const [rmEnabled, setRmEnabled] = useState(false);
  const [rmProtocol, setRmProtocol] = useState("RDP");
  const [rmUrl, setRmUrl] = useState("");
  const [protocolPickerOpen, setProtocolPickerOpen] = useState(false);

  const [isVirtual, setIsVirtual] = useState(false);
  const [hypervisor, setHypervisor] = useState("");
  const [vmHost, setVmHost] = useState("");

  const [avProduct, setAvProduct] = useState("");
  const [avStatus, setAvStatus] = useState("UNKNOWN");
  const [avLastScan, setAvLastScan] = useState("");
  const [avStatusPickerOpen, setAvStatusPickerOpen] = useState(false);

  useEffect(() => {
    if (!asset) return;
    setStaticIpAddress(asset.staticIpAddress ?? "");
    setSubnetMask(asset.subnetMask ?? "");
    setDefaultGateway(asset.defaultGateway ?? "");
    setDnsServers(asset.dnsServers ?? "");
    setRmEnabled(asset.remoteManagementEnabled);
    setRmProtocol(asset.remoteManagementProtocol ?? "RDP");
    setRmUrl(asset.remoteManagementUrl ?? "");
    setIsVirtual(asset.isVirtual);
    setHypervisor(asset.hypervisor ?? "");
    setVmHost(asset.vmHost ?? "");
    setAvProduct(asset.antivirusProduct ?? "");
    setAvStatus(asset.antivirusStatus ?? "UNKNOWN");
    setAvLastScan(asset.antivirusLastScanAt ? asset.antivirusLastScanAt.slice(0, 10) : "");
  }, [asset?.id, asset?.updatedAt]);

  function invalidate() { queryClient.invalidateQueries({ queryKey: ["mobile-asset", assetId] }); }

  const saveNetworkMutation = useMutation({
    mutationFn: () => axiosClient.patch(`/assets/${assetId}`, { staticIpAddress: staticIpAddress || null, subnetMask: subnetMask || null, defaultGateway: defaultGateway || null, dnsServers: dnsServers || null }),
    onSuccess: invalidate,
  });
  const saveRmMutation = useMutation({
    mutationFn: () => axiosClient.patch(`/assets/${assetId}`, { remoteManagementEnabled: rmEnabled, remoteManagementProtocol: rmProtocol, remoteManagementUrl: rmUrl || null }),
    onSuccess: invalidate,
  });
  const saveVirtMutation = useMutation({
    mutationFn: () => axiosClient.patch(`/assets/${assetId}`, { isVirtual, hypervisor: hypervisor || null, vmHost: vmHost || null }),
    onSuccess: invalidate,
  });
  const saveAvMutation = useMutation({
    mutationFn: () => axiosClient.patch(`/assets/${assetId}`, { antivirusProduct: avProduct || null, antivirusStatus: avStatus, antivirusLastScanAt: avLastScan ? new Date(avLastScan).toISOString() : null }),
    onSuccess: invalidate,
  });

  const inputStyle = { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, backgroundColor: colors.bg };
  const saveBtn = { backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center" as const, paddingVertical: 11 };

  if (isLoading || !asset) return <ShimmerDetail />;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
      <SectionCard title="Network Configuration" colors={colors} spacing={spacing} radius={radius}>
        <TextInput style={inputStyle} placeholder="IP Address (e.g. 192.168.1.50)" placeholderTextColor={colors.textMuted} value={staticIpAddress} onChangeText={setStaticIpAddress} autoCapitalize="none" />
        <TextInput style={inputStyle} placeholder="Subnet Mask (e.g. 255.255.255.0)" placeholderTextColor={colors.textMuted} value={subnetMask} onChangeText={setSubnetMask} autoCapitalize="none" />
        <TextInput style={inputStyle} placeholder="Default Gateway (e.g. 192.168.1.1)" placeholderTextColor={colors.textMuted} value={defaultGateway} onChangeText={setDefaultGateway} autoCapitalize="none" />
        <TextInput style={inputStyle} placeholder="DNS Servers (e.g. 8.8.8.8, 8.8.4.4)" placeholderTextColor={colors.textMuted} value={dnsServers} onChangeText={setDnsServers} autoCapitalize="none" />
        <TouchableOpacity style={saveBtn} disabled={saveNetworkMutation.isPending} onPress={() => saveNetworkMutation.mutate()}>
          {saveNetworkMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12.5 }}>Save Network Config</Text>}
        </TouchableOpacity>
      </SectionCard>

      <SectionCard title="Remote Management" colors={colors} spacing={spacing} radius={radius}>
        <ToggleRow label="Remote Access Enabled" value={rmEnabled} onChange={setRmEnabled} colors={colors} radius={radius} />
        <TouchableOpacity style={inputStyle} onPress={() => setProtocolPickerOpen(true)}>
          <Text style={{ color: colors.text, fontSize: 14 }}>{rmProtocol}</Text>
        </TouchableOpacity>
        <TextInput style={inputStyle} placeholder="Connection Address / URL" placeholderTextColor={colors.textMuted} value={rmUrl} onChangeText={setRmUrl} autoCapitalize="none" />
        <TouchableOpacity style={saveBtn} disabled={saveRmMutation.isPending} onPress={() => saveRmMutation.mutate()}>
          {saveRmMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12.5 }}>Save Remote Management</Text>}
        </TouchableOpacity>
      </SectionCard>

      <SectionCard title="Virtualization" colors={colors} spacing={spacing} radius={radius}>
        <ToggleRow label="Virtual Machine" value={isVirtual} onChange={setIsVirtual} colors={colors} radius={radius} />
        {isVirtual && (
          <>
            <TextInput style={inputStyle} placeholder="Hypervisor (e.g. VMware ESXi, Hyper-V)" placeholderTextColor={colors.textMuted} value={hypervisor} onChangeText={setHypervisor} />
            <TextInput style={inputStyle} placeholder="Host Server" placeholderTextColor={colors.textMuted} value={vmHost} onChangeText={setVmHost} />
          </>
        )}
        <TouchableOpacity style={saveBtn} disabled={saveVirtMutation.isPending} onPress={() => saveVirtMutation.mutate()}>
          {saveVirtMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12.5 }}>Save Virtualization</Text>}
        </TouchableOpacity>
      </SectionCard>

      <SectionCard title="Antivirus & Endpoint Protection" colors={colors} spacing={spacing} radius={radius}>
        <TextInput style={inputStyle} placeholder="Antivirus Product (e.g. Microsoft Defender)" placeholderTextColor={colors.textMuted} value={avProduct} onChangeText={setAvProduct} />
        <TouchableOpacity style={inputStyle} onPress={() => setAvStatusPickerOpen(true)}>
          <Text style={{ color: colors.text, fontSize: 14 }}>{AV_STATUSES.find((s) => s.id === avStatus)?.label}</Text>
        </TouchableOpacity>
        <TextInput style={inputStyle} placeholder="Last Scan Date (YYYY-MM-DD)" placeholderTextColor={colors.textMuted} value={avLastScan} onChangeText={setAvLastScan} />
        <TouchableOpacity style={saveBtn} disabled={saveAvMutation.isPending} onPress={() => saveAvMutation.mutate()}>
          {saveAvMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12.5 }}>Save Antivirus</Text>}
        </TouchableOpacity>
      </SectionCard>

      <PickerModal visible={protocolPickerOpen} title="Protocol" options={PROTOCOLS} selectedId={rmProtocol} onSelect={(id) => setRmProtocol(id as string)} onClose={() => setProtocolPickerOpen(false)} />
      <PickerModal visible={avStatusPickerOpen} title="Antivirus Status" options={AV_STATUSES} selectedId={avStatus} onSelect={(id) => setAvStatus(id as string)} onClose={() => setAvStatusPickerOpen(false)} />
    </ScrollView>
  );
}
