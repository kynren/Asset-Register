import { useLayoutEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ActivityIndicator, Alert, Image, Modal, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useVideoPlayer, VideoView } from "expo-video";
import QRCode from "react-native-qrcode-svg";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { API_ORIGIN } from "../../config/env";
import { useAuth } from "../../auth/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { StatusBadge } from "../../components/StatusBadge";
import { TicketPriorityPill, TicketStatusPill } from "../../components/TicketPills";
import { ShimmerDetail } from "../../components/Shimmer";
import { Asset, AssetCheckout, AssetPhoto, AssetTicketRef } from "../../types/asset";
import { AssetsStackParamList } from "../../navigation/types";
import { buildMediaFormData, isVideo, pickAssetMedia } from "../../lib/mediaPicker";

const ITIL_TYPE_LABEL: Record<AssetTicketRef["itilType"], string> = {
  INCIDENT: "Incident",
  REQUEST: "Request",
  PROBLEM: "Problem",
  CHANGE: "Change",
};

function Section({ title, colors, spacing, children }: { title: string; colors: any; spacing: any; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: spacing.lg }}>
      <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 8 }}>{title}</Text>
      {children}
    </View>
  );
}

function RowList({ rows, colors }: { rows: [string, string][]; colors: any }) {
  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 16 }}>
      {rows.map(([label, value], i) => (
        <View key={label} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: i < rows.length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>{label}</Text>
          <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600", flexShrink: 1, textAlign: "right", marginLeft: 12 }}>{value}</Text>
        </View>
      ))}
    </View>
  );
}

export function AssetDetailScreen() {
  const { colors, spacing, radius } = useTheme();
  const { hasPermission } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<AssetsStackParamList>>();
  const route = useRoute<RouteProp<AssetsStackParamList, "AssetDetail">>();
  const { id } = route.params;
  const queryClient = useQueryClient();
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);

  const { data: asset, isLoading } = useQuery({
    queryKey: ["mobile-asset", id],
    queryFn: async () => (await axiosClient.get(`/assets/${id}`)).data as Asset,
  });

  const { data: photos } = useQuery({
    queryKey: ["mobile-asset-photos", id],
    queryFn: async () => (await axiosClient.get(`/asset-resources/${id}/photos`)).data as AssetPhoto[],
  });

  const { data: checkouts } = useQuery({
    queryKey: ["mobile-asset-checkouts", id],
    queryFn: async () => (await axiosClient.get(`/assets/${id}/checkouts`)).data as AssetCheckout[],
  });
  const activeCheckout = checkouts?.find((c) => !c.checkedInAt) ?? null;

  const uploadPhotoMutation = useMutation({
    mutationFn: (fd: FormData) => axiosClient.post(`/asset-resources/${id}/photos`, fd, { headers: { "Content-Type": "multipart/form-data" } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mobile-asset-photos", id] }),
  });
  const deletePhotoMutation = useMutation({
    mutationFn: (photoId: number) => axiosClient.delete(`/asset-resources/${id}/photos/${photoId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mobile-asset-photos", id] }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => axiosClient.delete(`/assets/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mobile-assets"] });
      navigation.goBack();
    },
  });

  function confirmDelete() {
    Alert.alert("Delete asset", `Delete "${asset?.name}"? This can't be undone.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate() },
    ]);
  }

  async function addMedia(useCamera: boolean) {
    const picked = await pickAssetMedia(useCamera);
    if (!picked.length) return;
    setUploadingMedia(true);
    try {
      for (const media of picked) await uploadPhotoMutation.mutateAsync(buildMediaFormData(media));
    } catch {
      Alert.alert("Upload failed", "Couldn't upload one or more files.");
    } finally {
      setUploadingMedia(false);
    }
  }

  function promptAddMedia() {
    Alert.alert("Add photo or video", undefined, [
      { text: "Take Photo/Video", onPress: () => addMedia(true) },
      { text: "Choose from Library", onPress: () => addMedia(false) },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  function confirmDeletePhoto(photoId: number) {
    Alert.alert("Remove", "Remove this photo/video?", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => deletePhotoMutation.mutate(photoId) },
    ]);
  }

  useLayoutEffect(() => {
    navigation.setOptions({
      title: asset?.name ?? "Asset",
      headerRight: () =>
        hasPermission("assets", "edit") ? (
          <TouchableOpacity onPress={() => navigation.navigate("AssetForm", { id })} style={{ paddingHorizontal: 4 }}>
            <Ionicons name="create-outline" size={22} color={colors.primary} />
          </TouchableOpacity>
        ) : null,
    });
  }, [navigation, asset, id, colors.primary]);

  if (isLoading || !asset) {
    return <ShimmerDetail />;
  }

  const overviewRows: [string, string][] = [
    ["Category", asset.category?.name ?? "—"],
    ["Location", asset.location?.name ?? "—"],
    ["Assigned to", asset.assignedTo ? `${asset.assignedTo.firstName} ${asset.assignedTo.lastName}` : "—"],
  ];

  const identityRows: [string, string][] = [
    ["Manufacturer", asset.manufacturer],
    ["Model", asset.model],
    ["Serial number", asset.serialNumber],
    ["Supplier", asset.supplier],
    ["Purchase date", asset.purchaseDate ? dayjs(asset.purchaseDate).format("DD MMM YYYY") : null],
    ["Purchase cost", asset.purchaseCost != null ? `£${asset.purchaseCost}` : null],
    ["Warranty expires", asset.warrantyExpiresAt ? dayjs(asset.warrantyExpiresAt).format("DD MMM YYYY") : null],
  ].filter(([, v]) => v !== null && v !== undefined) as [string, string][];

  const customFieldRows: [string, string][] = asset.customFieldValues
    .filter((v) => v.value !== null && v.value !== "")
    .map((v) => [v.field.label, v.value as string]);

  const device = asset.device;
  const deviceRows: [string, string][] = device
    ? ([
        ["Hostname", device.hostname],
        ["MAC address", device.macAddress],
        ["IP address", device.ipAddresses?.[0] ?? null],
        ["OS", [device.os, device.osVersion].filter(Boolean).join(" ") || null],
        ["CPU", device.cpu],
        ["RAM", device.ramGb ? `${device.ramGb} GB` : null],
        ["Logged-in user", device.loggedInUser],
        ["Last seen", device.lastSeen ? dayjs(device.lastSeen).format("DD MMM YYYY HH:mm") : null],
        ["Battery", device.batteryPresent ? `${device.batteryPercent ?? "—"}%${device.batteryCharging ? " (charging)" : ""}` : null],
      ].filter(([, v]) => v !== null && v !== undefined) as [string, string][])
    : [];

  const tickets = asset.tickets ?? [];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xl }}>
      <View style={{ alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg }}>
        <QRCode value={asset.assetTag} size={140} backgroundColor={colors.surface} color={colors.text} />
        <Text style={{ color: colors.text, fontSize: 16, fontWeight: "800", marginTop: spacing.md }}>{asset.name}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 2 }}>{asset.assetTag}</Text>
        <View style={{ marginTop: spacing.sm }}>
          <StatusBadge status={asset.status} />
        </View>
      </View>

      <Section title="Overview" colors={colors} spacing={spacing}>
        <RowList rows={overviewRows} colors={colors} />
      </Section>

      {identityRows.length > 0 && (
        <Section title="Identity & Purchase" colors={colors} spacing={spacing}>
          <RowList rows={identityRows} colors={colors} />
        </Section>
      )}

      {customFieldRows.length > 0 && (
        <Section title={`${asset.category?.name ?? "Category"} Details`} colors={colors} spacing={spacing}>
          <RowList rows={customFieldRows} colors={colors} />
        </Section>
      )}

      {deviceRows.length > 0 && (
        <Section title="Device & Network" colors={colors} spacing={spacing}>
          <RowList rows={deviceRows} colors={colors} />
        </Section>
      )}

      {activeCheckout && (
        <Section title="Checkout Status" colors={colors} spacing={spacing}>
          <RowList
            rows={
              [
                ["Checked out to", activeCheckout.checkedOutTo ? `${activeCheckout.checkedOutTo.firstName} ${activeCheckout.checkedOutTo.lastName}` : "—"],
                ["Checked out", dayjs(activeCheckout.checkedOutAt).format("DD MMM YYYY")],
                ["Due back", activeCheckout.dueBackAt ? dayjs(activeCheckout.dueBackAt).format("DD MMM YYYY") : "—"],
              ] as [string, string][]
            }
            colors={colors}
          />
        </Section>
      )}

      <Section title="Photos & Videos" colors={colors} spacing={spacing}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {(photos ?? []).map((photo) => {
            const url = `${API_ORIGIN}${photo.url}`;
            const video = isVideo(photo.url);
            return (
              <View key={photo.id} style={{ width: 80, height: 80 }}>
                <TouchableOpacity onPress={() => setViewerUrl(url)}>
                  {video ? (
                    <View style={{ width: 80, height: 80, borderRadius: radius.md, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" }}>
                      <Ionicons name="play-circle" size={26} color={colors.primary} />
                    </View>
                  ) : (
                    <Image source={{ uri: url }} style={{ width: 80, height: 80, borderRadius: radius.md }} />
                  )}
                </TouchableOpacity>
                {hasPermission("assets", "edit") && (
                  <TouchableOpacity
                    style={{ position: "absolute", top: -6, right: -6, backgroundColor: colors.danger, borderRadius: 10, width: 20, height: 20, alignItems: "center", justifyContent: "center" }}
                    onPress={() => confirmDeletePhoto(photo.id)}
                  >
                    <Ionicons name="close" size={13} color="#fff" />
                  </TouchableOpacity>
                )}
              </View>
            );
          })}

          {hasPermission("assets", "edit") && (
            <TouchableOpacity
              style={{ width: 80, height: 80, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, borderStyle: "dashed", alignItems: "center", justifyContent: "center" }}
              onPress={promptAddMedia}
              disabled={uploadingMedia}
            >
              {uploadingMedia ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="add" size={26} color={colors.textMuted} />}
            </TouchableOpacity>
          )}

          {!photos?.length && !hasPermission("assets", "edit") && <Text style={{ color: colors.textMuted, fontSize: 12.5 }}>No photos or videos.</Text>}
        </View>
      </Section>

      {asset.notes ? (
        <Section title="Notes" colors={colors} spacing={spacing}>
          <Text style={{ color: colors.text, fontSize: 13, lineHeight: 19 }}>{asset.notes}</Text>
        </Section>
      ) : null}

      <Section title={`Tickets, Problems & Issues${tickets.length ? ` (${tickets.length})` : ""}`} colors={colors} spacing={spacing}>
        {tickets.length === 0 ? (
          <Text style={{ color: colors.textMuted, fontSize: 12.5 }}>No tickets linked to this asset.</Text>
        ) : (
          <View style={{ gap: 8 }}>
            {tickets.map((t) => (
              <TouchableOpacity
                key={t.id}
                style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 12 }}
                onPress={() => (navigation.getParent() as any)?.navigate("HelpdeskTab", { screen: "TicketDetail", params: { id: t.id } })}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700" }}>{t.ticketNumber}</Text>
                  <View style={{ backgroundColor: colors.primary + "22", borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 }}>
                    <Text style={{ color: colors.primary, fontSize: 10, fontWeight: "700" }}>{ITIL_TYPE_LABEL[t.itilType]}</Text>
                  </View>
                </View>
                <Text style={{ color: colors.text, fontSize: 13.5, fontWeight: "700", marginTop: 4 }} numberOfLines={2}>
                  {t.title}
                </Text>
                <View style={{ flexDirection: "row", gap: 6, marginTop: 8 }}>
                  <TicketStatusPill status={t.status} />
                  <TicketPriorityPill priority={t.priority} />
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </Section>

      {hasPermission("assets", "delete") && (
        <TouchableOpacity
          style={{ marginTop: spacing.xl, borderWidth: 1.5, borderColor: colors.danger, borderRadius: radius.md, alignItems: "center", paddingVertical: 14 }}
          onPress={confirmDelete}
          disabled={deleteMutation.isPending}
        >
          <Text style={{ color: colors.danger, fontWeight: "700" }}>Delete asset</Text>
        </TouchableOpacity>
      )}

      <MediaViewerModal url={viewerUrl} onClose={() => setViewerUrl(null)} />
    </ScrollView>
  );
}

function MediaViewerModal({ url, onClose }: { url: string | null; onClose: () => void }) {
  const video = url ? isVideo(url) : false;
  const player = useVideoPlayer(video && url ? url : null, (p) => {
    p.loop = false;
  });

  return (
    <Modal visible={!!url} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "#000d", alignItems: "center", justifyContent: "center" }}>
        <TouchableOpacity style={{ position: "absolute", top: 50, right: 20, zIndex: 1 }} onPress={onClose}>
          <Ionicons name="close" size={30} color="#fff" />
        </TouchableOpacity>
        {url ? (
          video ? (
            <VideoView player={player} style={{ width: "100%", height: 320 }} nativeControls />
          ) : (
            <Image source={{ uri: url }} style={{ width: "92%", height: "70%" }} resizeMode="contain" />
          )
        ) : null}
      </View>
    </Modal>
  );
}
