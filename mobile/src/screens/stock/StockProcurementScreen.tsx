import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ActivityIndicator, FlatList, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { useAuth } from "../../auth/AuthContext";
import { ShimmerList } from "../../components/Shimmer";
import { PickerModal, PickerOption } from "../../components/PickerModal";

interface Supplier { id: number; name: string; contactName: string | null; email: string | null; phone: string | null; _count: { purchaseOrders: number } }
interface PoItem { id: number; quantityOrdered: number; quantityReceived: number; stockItem: { id: number; sku: string; name: string; unit: string } }
interface PurchaseOrder { id: number; poNumber: string; status: "DRAFT" | "ORDERED" | "RECEIVED" | "CANCELLED"; expectedAt: string | null; supplier: { id: number; name: string }; items: PoItem[] }
interface StockItemOption { id: number; sku: string; name: string; unit: string }

const STATUS_TONE: Record<string, "muted" | "warning" | "success" | "danger"> = { DRAFT: "muted", ORDERED: "warning", RECEIVED: "success", CANCELLED: "danger" };

// Mirrors client/src/pages/stock/ProcurementTab.tsx (Suppliers & Purchase Orders).
export function StockProcurementScreen() {
  const { colors, spacing, radius } = useTheme();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const canCreate = hasPermission("stock", "create");
  const canEdit = hasPermission("stock", "edit");
  const canDuplicate = hasPermission("stock", "duplicate");

  const [supplierFormOpen, setSupplierFormOpen] = useState(false);
  const [poFormOpen, setPoFormOpen] = useState(false);
  const [receivingPo, setReceivingPo] = useState<PurchaseOrder | null>(null);
  const [supplierName, setSupplierName] = useState("");
  const [supplierContact, setSupplierContact] = useState("");
  const [supplierEmail, setSupplierEmail] = useState("");
  const [supplierPhone, setSupplierPhone] = useState("");
  const [poSupplierId, setPoSupplierId] = useState<number | null>(null);
  const [poSupplierPickerOpen, setPoSupplierPickerOpen] = useState(false);
  const [poExpectedAt, setPoExpectedAt] = useState("");
  const [poLines, setPoLines] = useState<{ stockItemId: number | null; quantityOrdered: string }[]>([{ stockItemId: null, quantityOrdered: "1" }]);
  const [lineItemPickerIdx, setLineItemPickerIdx] = useState<number | null>(null);

  const { data: suppliers } = useQuery({ queryKey: ["mobile-suppliers"], queryFn: async () => (await axiosClient.get("/procurement/suppliers")).data as Supplier[] });
  const { data: orders, isLoading } = useQuery({ queryKey: ["mobile-purchase-orders"], queryFn: async () => (await axiosClient.get("/procurement/purchase-orders")).data as PurchaseOrder[] });
  const { data: stockItems } = useQuery({ queryKey: ["mobile-stock-items-for-po"], queryFn: async () => (await axiosClient.get("/stock", { params: { pageSize: 200 } })).data.items as StockItemOption[] });

  function invalidatePOs() { queryClient.invalidateQueries({ queryKey: ["mobile-purchase-orders"] }); }

  const addSupplierMutation = useMutation({
    mutationFn: () => axiosClient.post("/procurement/suppliers", { name: supplierName.trim(), contactName: supplierContact || undefined, email: supplierEmail || undefined, phone: supplierPhone || undefined }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["mobile-suppliers"] }); setSupplierFormOpen(false); setSupplierName(""); setSupplierContact(""); setSupplierEmail(""); setSupplierPhone(""); },
  });
  const duplicateSupplierMutation = useMutation({ mutationFn: (id: number) => axiosClient.post(`/procurement/suppliers/${id}/duplicate`), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mobile-suppliers"] }) });
  const markOrderedMutation = useMutation({ mutationFn: (id: number) => axiosClient.patch(`/procurement/purchase-orders/${id}`, { status: "ORDERED" }), onSuccess: invalidatePOs });
  const cancelMutation = useMutation({ mutationFn: (id: number) => axiosClient.patch(`/procurement/purchase-orders/${id}`, { status: "CANCELLED" }), onSuccess: invalidatePOs });

  const createPoMutation = useMutation({
    mutationFn: () =>
      axiosClient.post("/procurement/purchase-orders", {
        supplierId: poSupplierId,
        expectedAt: poExpectedAt ? new Date(poExpectedAt).toISOString() : null,
        items: poLines.filter((l) => l.stockItemId).map((l) => ({ stockItemId: l.stockItemId, quantityOrdered: Number(l.quantityOrdered) || 1 })),
      }),
    onSuccess: () => { invalidatePOs(); queryClient.invalidateQueries({ queryKey: ["mobile-suppliers"] }); setPoFormOpen(false); setPoSupplierId(null); setPoExpectedAt(""); setPoLines([{ stockItemId: null, quantityOrdered: "1" }]); },
  });

  const validLines = poLines.filter((l) => l.stockItemId && Number(l.quantityOrdered) > 0);
  const supplierOptions: PickerOption[] = (suppliers ?? []).map((s) => ({ id: s.id, label: s.name }));
  const stockOptions: PickerOption[] = (stockItems ?? []).map((s) => ({ id: s.id, label: s.name, sublabel: s.sku }));
  const inputStyle = { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, backgroundColor: colors.bg };

  if (isLoading) return <ShimmerList />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
        <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}>Suppliers</Text>
            {canCreate && (
              <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} onPress={() => setSupplierFormOpen(true)}>
                <Text style={{ color: colors.text, fontSize: 11, fontWeight: "700" }}>+ Add Supplier</Text>
              </TouchableOpacity>
            )}
          </View>
          {(suppliers ?? []).length === 0 && <Text style={{ color: colors.textMuted, fontSize: 12 }}>No suppliers registered yet.</Text>}
          {(suppliers ?? []).map((s) => (
            <View key={s.id} style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: 8, flexDirection: "row", alignItems: "center" }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600" }}>{s.name}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>{s.contactName ?? "No contact"}{s.email ? ` · ${s.email}` : ""}{s.phone ? ` · ${s.phone}` : ""} · {s._count.purchaseOrders} orders</Text>
              </View>
              {canDuplicate && (
                <TouchableOpacity onPress={() => duplicateSupplierMutation.mutate(s.id)}><Ionicons name="copy-outline" size={17} color={colors.textMuted} /></TouchableOpacity>
              )}
            </View>
          ))}
        </View>

        <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}>Purchase Orders</Text>
            {canCreate && (
              <TouchableOpacity disabled={!suppliers?.length} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6, opacity: suppliers?.length ? 1 : 0.4 }} onPress={() => setPoFormOpen(true)}>
                <Text style={{ color: colors.text, fontSize: 11, fontWeight: "700" }}>+ New PO</Text>
              </TouchableOpacity>
            )}
          </View>
          {(orders ?? []).length === 0 && <Text style={{ color: colors.textMuted, fontSize: 12 }}>No purchase orders yet.</Text>}
          {(orders ?? []).map((po) => {
            const totalOrdered = po.items.reduce((s, i) => s + i.quantityOrdered, 0);
            const totalReceived = po.items.reduce((s, i) => s + i.quantityReceived, 0);
            const tone = STATUS_TONE[po.status];
            const toneColor = tone === "success" ? colors.success : tone === "warning" ? colors.warning : tone === "danger" ? colors.danger : colors.textMuted;
            return (
              <View key={po.id} style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: 10 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={{ color: colors.text, fontSize: 13, fontWeight: "700" }}>{po.poNumber}</Text>
                  <View style={{ backgroundColor: toneColor + "22", borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 }}>
                    <Text style={{ color: toneColor, fontSize: 10, fontWeight: "700" }}>{po.status}</Text>
                  </View>
                  <Text style={{ color: colors.textMuted, fontSize: 11, flex: 1 }} numberOfLines={1}>{po.supplier.name}</Text>
                </View>
                <Text style={{ color: colors.textMuted, fontSize: 11.5, marginTop: 4 }}>
                  {totalReceived}/{totalOrdered} units received{po.expectedAt ? ` · Expected ${dayjs(po.expectedAt).format("DD MMM YYYY")}` : ""}
                </Text>
                {po.items.map((i) => (
                  <Text key={i.id} style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>• {i.stockItem.name} — {i.quantityReceived}/{i.quantityOrdered} {i.stockItem.unit}</Text>
                ))}
                {canEdit && (
                  <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                    {po.status === "DRAFT" && (
                      <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.primary, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} disabled={markOrderedMutation.isPending} onPress={() => markOrderedMutation.mutate(po.id)}>
                        <Text style={{ color: colors.primary, fontSize: 11, fontWeight: "700" }}>Mark Ordered</Text>
                      </TouchableOpacity>
                    )}
                    {po.status === "ORDERED" && (
                      <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.primary, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} onPress={() => setReceivingPo(po)}>
                        <Text style={{ color: colors.primary, fontSize: 11, fontWeight: "700" }}>Receive Stock</Text>
                      </TouchableOpacity>
                    )}
                    {(po.status === "DRAFT" || po.status === "ORDERED") && (
                      <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.danger, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} disabled={cancelMutation.isPending} onPress={() => cancelMutation.mutate(po.id)}>
                        <Text style={{ color: colors.danger, fontSize: 11, fontWeight: "700" }}>Cancel</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </ScrollView>

      {supplierFormOpen && (
        <View style={{ position: "absolute", inset: 0, backgroundColor: "#0008", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm }}>
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: "700" }}>Add Supplier</Text>
              <TouchableOpacity onPress={() => setSupplierFormOpen(false)}><Ionicons name="close" size={22} color={colors.textMuted} /></TouchableOpacity>
            </View>
            <View style={{ gap: 10 }}>
              <TextInput style={inputStyle} placeholder="Name *" placeholderTextColor={colors.textMuted} value={supplierName} onChangeText={setSupplierName} />
              <TextInput style={inputStyle} placeholder="Contact Name" placeholderTextColor={colors.textMuted} value={supplierContact} onChangeText={setSupplierContact} />
              <TextInput style={inputStyle} placeholder="Email" placeholderTextColor={colors.textMuted} value={supplierEmail} onChangeText={setSupplierEmail} keyboardType="email-address" autoCapitalize="none" />
              <TextInput style={inputStyle} placeholder="Phone" placeholderTextColor={colors.textMuted} value={supplierPhone} onChangeText={setSupplierPhone} keyboardType="phone-pad" />
              <TouchableOpacity style={{ backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 12, opacity: supplierName.trim() ? 1 : 0.5 }} disabled={!supplierName.trim() || addSupplierMutation.isPending} onPress={() => addSupplierMutation.mutate()}>
                {addSupplierMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Add Supplier</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {poFormOpen && (
        <View style={{ position: "absolute", inset: 0, backgroundColor: "#0008", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, maxHeight: "88%" }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm }}>
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: "700" }}>New Purchase Order</Text>
              <TouchableOpacity onPress={() => setPoFormOpen(false)}><Ionicons name="close" size={22} color={colors.textMuted} /></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ gap: 10 }}>
              <TouchableOpacity style={inputStyle} onPress={() => setPoSupplierPickerOpen(true)}>
                <Text style={{ color: poSupplierId ? colors.text : colors.textMuted, fontSize: 14 }}>{supplierOptions.find((o) => o.id === poSupplierId)?.label ?? "Select supplier..."}</Text>
              </TouchableOpacity>
              <TextInput style={inputStyle} placeholder="Expected Date (YYYY-MM-DD)" placeholderTextColor={colors.textMuted} value={poExpectedAt} onChangeText={setPoExpectedAt} />

              <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700", textTransform: "uppercase" }}>Line Items</Text>
              {poLines.map((line, idx) => (
                <View key={idx} style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                  <TouchableOpacity style={[inputStyle, { flex: 2 }]} onPress={() => setLineItemPickerIdx(idx)}>
                    <Text style={{ color: line.stockItemId ? colors.text : colors.textMuted, fontSize: 13 }} numberOfLines={1}>{stockOptions.find((o) => o.id === line.stockItemId)?.label ?? "Select item..."}</Text>
                  </TouchableOpacity>
                  <TextInput style={[inputStyle, { flex: 1 }]} placeholder="Qty" placeholderTextColor={colors.textMuted} keyboardType="numeric" value={line.quantityOrdered} onChangeText={(v) => setPoLines((ls) => ls.map((l, i) => (i === idx ? { ...l, quantityOrdered: v } : l)))} />
                  <TouchableOpacity disabled={poLines.length === 1} onPress={() => setPoLines((ls) => ls.filter((_, i) => i !== idx))}>
                    <Ionicons name="close-circle-outline" size={20} color={poLines.length === 1 ? colors.border : colors.danger} />
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", gap: 6 }} onPress={() => setPoLines((ls) => [...ls, { stockItemId: null, quantityOrdered: "1" }])}>
                <Ionicons name="add" size={16} color={colors.primary} />
                <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "700" }}>Add Line</Text>
              </TouchableOpacity>
            </ScrollView>
            <TouchableOpacity style={{ backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 12, marginTop: spacing.md, opacity: poSupplierId && validLines.length > 0 ? 1 : 0.5 }} disabled={!poSupplierId || validLines.length === 0 || createPoMutation.isPending} onPress={() => createPoMutation.mutate()}>
              {createPoMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Create PO</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {receivingPo && <ReceiveStockSheet po={receivingPo} onClose={() => setReceivingPo(null)} />}

      <PickerModal visible={poSupplierPickerOpen} title="Supplier" options={supplierOptions} selectedId={poSupplierId} onSelect={(id) => setPoSupplierId(id as number | null)} onClose={() => setPoSupplierPickerOpen(false)} />
      <PickerModal visible={lineItemPickerIdx !== null} title="Stock Item" options={stockOptions} searchable selectedId={lineItemPickerIdx !== null ? poLines[lineItemPickerIdx].stockItemId : null} onSelect={(id) => { if (lineItemPickerIdx !== null) setPoLines((ls) => ls.map((l, i) => (i === lineItemPickerIdx ? { ...l, stockItemId: id as number | null } : l))); }} onClose={() => setLineItemPickerIdx(null)} />
    </View>
  );
}

function ReceiveStockSheet({ po, onClose }: { po: PurchaseOrder; onClose: () => void }) {
  const { colors, spacing, radius } = useTheme();
  const queryClient = useQueryClient();
  const outstanding = po.items.filter((i) => i.quantityReceived < i.quantityOrdered);
  const [quantities, setQuantities] = useState<Record<number, string>>(Object.fromEntries(outstanding.map((i) => [i.id, String(i.quantityOrdered - i.quantityReceived)])));
  const [locationId, setLocationId] = useState<number | null>(null);
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);
  const { data: locations } = useQuery({ queryKey: ["mobile-locations"], queryFn: async () => (await axiosClient.get("/locations")).data as { id: number; name: string }[] });

  const mutation = useMutation({
    mutationFn: () =>
      axiosClient.post(`/procurement/purchase-orders/${po.id}/receive`, {
        locationId,
        lines: outstanding.filter((i) => Number(quantities[i.id]) > 0).map((i) => ({ purchaseOrderItemId: i.id, quantityReceived: Number(quantities[i.id]) })),
      }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["mobile-purchase-orders"] }); queryClient.invalidateQueries({ queryKey: ["mobile-stock"] }); onClose(); },
  });

  const locationOptions: PickerOption[] = (locations ?? []).map((l) => ({ id: l.id, label: l.name }));
  const inputStyle = { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, backgroundColor: colors.bg };

  return (
    <View style={{ position: "absolute", inset: 0, backgroundColor: "#0008", justifyContent: "flex-end" }}>
      <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, maxHeight: "85%" }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm }}>
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: "700" }}>Receive Stock — {po.poNumber}</Text>
          <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={colors.textMuted} /></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ gap: 10 }}>
          <TouchableOpacity style={inputStyle} onPress={() => setLocationPickerOpen(true)}>
            <Text style={{ color: locationId ? colors.text : colors.textMuted, fontSize: 14 }}>{locationOptions.find((o) => o.id === locationId)?.label ?? "Receiving Location"}</Text>
          </TouchableOpacity>
          {outstanding.map((i) => (
            <View key={i.id} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={{ color: colors.text, fontSize: 13, flex: 1 }}>{i.stockItem.name} <Text style={{ color: colors.textMuted, fontSize: 11 }}>(outstanding {i.quantityOrdered - i.quantityReceived})</Text></Text>
              <TextInput style={[inputStyle, { width: 70 }]} keyboardType="numeric" value={quantities[i.id]} onChangeText={(v) => setQuantities((q) => ({ ...q, [i.id]: v }))} />
            </View>
          ))}
        </ScrollView>
        <TouchableOpacity style={{ backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 12, marginTop: spacing.md, opacity: locationId ? 1 : 0.5 }} disabled={!locationId || mutation.isPending} onPress={() => mutation.mutate()}>
          {mutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Confirm Receipt</Text>}
        </TouchableOpacity>
      </View>
      <PickerModal visible={locationPickerOpen} title="Location" options={locationOptions} selectedId={locationId} onSelect={(id) => setLocationId(id as number | null)} onClose={() => setLocationPickerOpen(false)} />
    </View>
  );
}
