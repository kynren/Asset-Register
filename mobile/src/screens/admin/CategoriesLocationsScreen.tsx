import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, FlatList, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { useAuth } from "../../auth/AuthContext";
import { ShimmerList } from "../../components/Shimmer";
import { PickerModal, PickerOption } from "../../components/PickerModal";

interface Ref { id: number; name: string }
interface AssetCategory {
  id: number;
  name: string;
  isComputerAsset: boolean;
  isShowAsset: boolean;
  isSwitchingDevice: boolean;
  formTemplateId: number | null;
  formTemplate: Ref | null;
  collectionId: number | null;
  collection: Ref | null;
  publicIntakeEnabled: boolean;
  publicIntakeToken: string | null;
}
interface FormTemplate { id: number; name: string; description: string | null; categories: Ref[]; fieldCount: number; categoryCount: number }
interface LocationItem { id: number; name: string; address?: string | null }
interface TicketCategory {
  id: number;
  name: string;
  parentId: number | null;
  parent: Ref | null;
  defaultTemplateId: number | null;
  defaultTemplate: Ref | null;
  defaultSlaId: number | null;
  defaultSla: Ref | null;
}

const TABS = [
  { key: "categories", label: "Categories" },
  { key: "templates", label: "Templates" },
  { key: "locations", label: "Locations" },
  { key: "tickets", label: "Tickets" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

// Mirrors client/src/pages/admin/CategoriesLocationsTab.tsx's 4 sub-sections (Asset Categories,
// Form Templates, Locations, Ticket Categories), collapsed into a tab switcher rather than 4
// stacked cards to fit a phone screen.
export function CategoriesLocationsScreen() {
  const { colors } = useTheme();
  const [tab, setTab] = useState<TabKey>("categories");

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface }}>
        {TABS.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={{ flex: 1, paddingVertical: 12, alignItems: "center", borderBottomWidth: 2, borderBottomColor: tab === t.key ? colors.primary : "transparent" }}
            onPress={() => setTab(t.key)}
          >
            <Text style={{ color: tab === t.key ? colors.primary : colors.textMuted, fontSize: 12, fontWeight: "700" }}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {tab === "categories" && <AssetCategoriesTab />}
      {tab === "templates" && <FormTemplatesTab />}
      {tab === "locations" && <LocationsTab />}
      {tab === "tickets" && <TicketCategoriesTab />}
    </View>
  );
}

function ToggleRow({ title, desc, value, onChange }: { title: string; desc: string; value: boolean; onChange: (v: boolean) => void }) {
  const { colors, spacing, radius } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.sm }}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontSize: 12.5, fontWeight: "700" }}>{title}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 10.5, marginTop: 2 }}>{desc}</Text>
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.primary, false: colors.border }} />
    </View>
  );
}

function emptyCategoryForm() {
  return { name: "", collectionId: null as number | null, formTemplateId: null as number | null, isComputerAsset: false, isShowAsset: false, isSwitchingDevice: false };
}

// Asset Categories tab. Simplifications vs web: no per-category custom column configuration
// (CategoryColumnsModal) and no capacities override (customizeCapacities/ALL_CAPACITY_KEYS) — both
// are power-user table/tab configuration with no mobile precedent, same reasoning already applied
// to Form Templates' field builder below.
function AssetCategoriesTab() {
  const { colors, spacing, radius } = useTheme();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AssetCategory | null>(null);
  const [form, setForm] = useState(emptyCategoryForm());
  const [collectionPickerOpen, setCollectionPickerOpen] = useState(false);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const { data: categories, isLoading } = useQuery({ queryKey: ["mobile-asset-categories"], queryFn: async () => (await axiosClient.get("/asset-categories")).data as AssetCategory[] });
  const { data: templates } = useQuery({ queryKey: ["mobile-asset-form-templates"], queryFn: async () => (await axiosClient.get("/asset-form-templates")).data as FormTemplate[] });
  const { data: collections } = useQuery({ queryKey: ["mobile-asset-collections"], queryFn: async () => (await axiosClient.get("/asset-collections")).data as Ref[] });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["mobile-asset-categories"] });
  }

  function closeForm() {
    setShowForm(false);
    setEditing(null);
    setForm(emptyCategoryForm());
  }

  function startEdit(c: AssetCategory) {
    setEditing(c);
    setForm({ name: c.name, collectionId: c.collectionId, formTemplateId: c.formTemplateId, isComputerAsset: c.isComputerAsset, isShowAsset: c.isShowAsset, isSwitchingDevice: c.isSwitchingDevice });
    setShowForm(true);
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = { name: form.name.trim(), collectionId: form.collectionId, formTemplateId: form.formTemplateId, isComputerAsset: form.isComputerAsset, isShowAsset: form.isShowAsset, isSwitchingDevice: form.isSwitchingDevice };
      return editing ? axiosClient.patch(`/asset-categories/${editing.id}`, payload) : axiosClient.post("/asset-categories", payload);
    },
    onSuccess: () => { invalidate(); closeForm(); },
  });

  const deleteMutation = useMutation({ mutationFn: (id: number) => axiosClient.delete(`/asset-categories/${id}`), onSuccess: invalidate });
  const duplicateMutation = useMutation({ mutationFn: (id: number) => axiosClient.post(`/asset-categories/${id}/duplicate`), onSuccess: invalidate });

  const intakeMutation = useMutation({
    mutationFn: (enable: boolean) => (enable ? axiosClient.post(`/asset-categories/${editing!.id}/public-intake`) : axiosClient.delete(`/asset-categories/${editing!.id}/public-intake`)),
    onSuccess: (res) => { setEditing((prev) => (prev ? { ...prev, publicIntakeEnabled: res.data.publicIntakeEnabled, publicIntakeToken: res.data.publicIntakeToken } : prev)); invalidate(); },
  });

  function confirmDelete(c: AssetCategory) {
    Alert.alert("Delete category", `Delete "${c.name}"? This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(c.id) },
    ]);
  }

  const inputStyle = { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, backgroundColor: colors.surface };
  const collectionOptions: PickerOption[] = (collections ?? []).map((c) => ({ id: c.id, label: c.name }));
  const templateOptions: PickerOption[] = (templates ?? []).map((t) => ({ id: t.id, label: t.name }));
  const intakeUrl = editing?.publicIntakeToken ? `https://app/intake/${editing.publicIntakeToken}` : "";

  if (isLoading) return <ShimmerList />;

  return (
    <FlatList
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
      data={categories ?? []}
      keyExtractor={(item) => String(item.id)}
      ListHeaderComponent={
        <View style={{ marginBottom: spacing.md }}>
          {!showForm ? (
            hasPermission("admin", "create") ? (
              <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 12 }} onPress={() => setShowForm(true)}>
                <Ionicons name="add" size={16} color={colors.text} />
                <Text style={{ color: colors.text, fontWeight: "700", fontSize: 13 }}>Add Category</Text>
              </TouchableOpacity>
            ) : null
          ) : (
            <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 10 }}>
              <TextInput style={inputStyle} placeholder="Category name" placeholderTextColor={colors.textMuted} value={form.name} onChangeText={(v) => setForm((f) => ({ ...f, name: v }))} />
              <TouchableOpacity style={[inputStyle, { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }]} onPress={() => setCollectionPickerOpen(true)}>
                <Text style={{ color: form.collectionId ? colors.text : colors.textMuted, fontSize: 13.5 }}>{collections?.find((c) => c.id === form.collectionId)?.name ?? "No collection"}</Text>
                <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
              </TouchableOpacity>
              <TouchableOpacity style={[inputStyle, { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }]} onPress={() => setTemplatePickerOpen(true)}>
                <Text style={{ color: form.formTemplateId ? colors.text : colors.textMuted, fontSize: 13.5 }}>{templates?.find((t) => t.id === form.formTemplateId)?.name ?? "No linked form template"}</Text>
                <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
              </TouchableOpacity>

              <ToggleRow title="Computer / Network Asset" desc="Shows full IT tabs on Asset Detail instead of the generic set." value={form.isComputerAsset} onChange={(v) => setForm((f) => ({ ...f, isComputerAsset: v }))} />
              <ToggleRow title="Show Asset" desc="Counted on Operational Context's Active Show Assets gauge." value={form.isShowAsset} onChange={(v) => setForm((f) => ({ ...f, isShowAsset: v }))} />
              <ToggleRow title="Switching Device" desc="Appears on Network Topology's Switching tab for port mapping." value={form.isSwitchingDevice} onChange={(v) => setForm((f) => ({ ...f, isSwitchingDevice: v }))} />

              {editing && (
                <View style={{ backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.sm, gap: 8 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontSize: 12.5, fontWeight: "700" }}>Public Intake Form</Text>
                      <Text style={{ color: colors.textMuted, fontSize: 10.5, marginTop: 2 }}>Shareable link where anyone can propose a new asset for review.</Text>
                    </View>
                    <Switch value={editing.publicIntakeEnabled} onValueChange={(v) => intakeMutation.mutate(v)} trackColor={{ true: colors.primary, false: colors.border }} />
                  </View>
                  {editing.publicIntakeEnabled && editing.publicIntakeToken && (
                    <TouchableOpacity onLongPress={() => setLinkCopied(true)} style={{ backgroundColor: colors.surface, borderRadius: radius.sm, padding: 8 }}>
                      <Text selectable style={{ color: colors.text, fontSize: 10.5, fontFamily: "monospace" }}>{intakeUrl}</Text>
                      <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 2 }}>{linkCopied ? "Long-pressed — select and copy the text above" : "Long-press to select the link, then copy"}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, alignItems: "center", paddingVertical: 10 }} onPress={closeForm}>
                  <Text style={{ color: colors.text, fontWeight: "700", fontSize: 12.5 }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 1, backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 10, opacity: form.name.trim() ? 1 : 0.5 }}
                  disabled={!form.name.trim() || saveMutation.isPending}
                  onPress={() => saveMutation.mutate()}
                >
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12.5 }}>{editing ? "Save" : "Add Category"}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      }
      ListEmptyComponent={!isLoading ? <Text style={{ color: colors.textMuted, textAlign: "center" }}>No asset categories yet.</Text> : null}
      renderItem={({ item: c }) => (
        <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: 6 }}>
          <Text style={{ color: colors.text, fontSize: 13.5, fontWeight: "700" }}>{c.name}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
            {c.collection && <Chip label={c.collection.name} color={colors.textMuted} />}
            <Chip label={c.isComputerAsset ? "Computer / Network" : "Generic"} color={c.isComputerAsset ? colors.primary : colors.textMuted} />
            {c.isShowAsset && <Chip label="Show Asset" color={colors.primary} />}
            {c.isSwitchingDevice && <Chip label="Switching" color={colors.primary} />}
            {c.formTemplate ? <Chip label={c.formTemplate.name} color={colors.primary} /> : <Chip label="No form template" color={colors.textMuted} />}
          </View>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            {hasPermission("admin", "edit") && (
              <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} onPress={() => startEdit(c)}>
                <Text style={{ color: colors.text, fontSize: 11, fontWeight: "700" }}>Edit</Text>
              </TouchableOpacity>
            )}
            {hasPermission("admin", "duplicate") && (
              <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} onPress={() => duplicateMutation.mutate(c.id)}>
                <Text style={{ color: colors.text, fontSize: 11, fontWeight: "700" }}>Duplicate</Text>
              </TouchableOpacity>
            )}
            {hasPermission("admin", "delete") && (
              <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.danger, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} onPress={() => confirmDelete(c)}>
                <Text style={{ color: colors.danger, fontSize: 11, fontWeight: "700" }}>Delete</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
      ListFooterComponent={
        <>
          <PickerModal visible={collectionPickerOpen} title="Collection" options={collectionOptions} selectedId={form.collectionId} allowClear onSelect={(id) => setForm((f) => ({ ...f, collectionId: id as number | null }))} onClose={() => setCollectionPickerOpen(false)} />
          <PickerModal visible={templatePickerOpen} title="Form Template" options={templateOptions} selectedId={form.formTemplateId} allowClear onSelect={(id) => setForm((f) => ({ ...f, formTemplateId: id as number | null }))} onClose={() => setTemplatePickerOpen(false)} />
        </>
      }
    />
  );
}

function Chip({ label, color }: { label: string; color: string }) {
  return (
    <View style={{ backgroundColor: color + "1e", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
      <Text style={{ color, fontSize: 10, fontWeight: "700" }}>{label}</Text>
    </View>
  );
}

// Form Templates tab. Web's "Manage Fields" opens FormTemplateBuilderModal, a drag-and-drop custom
// field builder with per-field-type config — no mobile precedent (same simplification already
// applied to Resource Scheduling's drag grid and the Email Template block builder). Mobile covers
// create/rename/duplicate/delete of the template shell only; field authoring stays web-only.
function FormTemplatesTab() {
  const { colors, spacing, radius } = useTheme();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<FormTemplate | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const { data: templates, isLoading } = useQuery({ queryKey: ["mobile-asset-form-templates-tab"], queryFn: async () => (await axiosClient.get("/asset-form-templates")).data as FormTemplate[] });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["mobile-asset-form-templates-tab"] });
    queryClient.invalidateQueries({ queryKey: ["mobile-asset-form-templates"] });
  }

  function closeForm() {
    setShowForm(false);
    setEditing(null);
    setName("");
    setDescription("");
  }

  function startEdit(t: FormTemplate) {
    setEditing(t);
    setName(t.name);
    setDescription(t.description ?? "");
    setShowForm(true);
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = { name: name.trim(), description: description.trim() || undefined };
      return editing ? axiosClient.patch(`/asset-form-templates/${editing.id}`, payload) : axiosClient.post("/asset-form-templates", payload);
    },
    onSuccess: () => { invalidate(); closeForm(); },
  });

  const deleteMutation = useMutation({ mutationFn: (id: number) => axiosClient.delete(`/asset-form-templates/${id}`), onSuccess: invalidate });
  const duplicateMutation = useMutation({ mutationFn: (id: number) => axiosClient.post(`/asset-form-templates/${id}/duplicate`), onSuccess: invalidate });

  function confirmDelete(t: FormTemplate) {
    Alert.alert("Delete form template", `Delete "${t.name}"? Categories linked to it will lose their custom fields.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(t.id) },
    ]);
  }

  const inputStyle = { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, backgroundColor: colors.surface };

  if (isLoading) return <ShimmerList />;

  return (
    <FlatList
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
      data={templates ?? []}
      keyExtractor={(item) => String(item.id)}
      ListHeaderComponent={
        <View style={{ marginBottom: spacing.md }}>
          <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 10 }}>Field authoring (adding/reordering custom fields) is web-only for now — manage templates and their fields at app-settings.kynren.com/admin.</Text>
          {!showForm ? (
            hasPermission("admin", "create") ? (
              <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 12 }} onPress={() => setShowForm(true)}>
                <Ionicons name="add" size={16} color={colors.text} />
                <Text style={{ color: colors.text, fontWeight: "700", fontSize: 13 }}>New Template</Text>
              </TouchableOpacity>
            ) : null
          ) : (
            <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 10 }}>
              <TextInput style={inputStyle} placeholder="Template name" placeholderTextColor={colors.textMuted} value={name} onChangeText={setName} />
              <TextInput style={inputStyle} placeholder="Description (optional)" placeholderTextColor={colors.textMuted} value={description} onChangeText={setDescription} />
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, alignItems: "center", paddingVertical: 10 }} onPress={closeForm}>
                  <Text style={{ color: colors.text, fontWeight: "700", fontSize: 12.5 }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 1, backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 10, opacity: name.trim() ? 1 : 0.5 }}
                  disabled={!name.trim() || saveMutation.isPending}
                  onPress={() => saveMutation.mutate()}
                >
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12.5 }}>{editing ? "Save" : "Create"}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      }
      ListEmptyComponent={!isLoading ? <Text style={{ color: colors.textMuted, textAlign: "center" }}>No form templates yet.</Text> : null}
      renderItem={({ item: t }) => (
        <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: 6 }}>
          <Text style={{ color: colors.text, fontSize: 13.5, fontWeight: "700" }}>{t.name}</Text>
          {t.description && <Text style={{ color: colors.textMuted, fontSize: 11.5, marginTop: 2 }}>{t.description}</Text>}
          <Text style={{ color: colors.textMuted, fontSize: 10.5, marginTop: 4 }}>{t.fieldCount} field{t.fieldCount === 1 ? "" : "s"} · {t.categoryCount} categor{t.categoryCount === 1 ? "y" : "ies"}</Text>
          {t.categories.length > 0 && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
              {t.categories.map((c) => <Chip key={c.id} label={c.name} color={colors.textMuted} />)}
            </View>
          )}
          <View style={{ flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            {hasPermission("admin", "edit") && (
              <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} onPress={() => startEdit(t)}>
                <Text style={{ color: colors.text, fontSize: 11, fontWeight: "700" }}>Rename</Text>
              </TouchableOpacity>
            )}
            {hasPermission("admin", "duplicate") && (
              <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} onPress={() => duplicateMutation.mutate(t.id)}>
                <Text style={{ color: colors.text, fontSize: 11, fontWeight: "700" }}>Duplicate</Text>
              </TouchableOpacity>
            )}
            {hasPermission("admin", "delete") && (
              <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.danger, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} onPress={() => confirmDelete(t)}>
                <Text style={{ color: colors.danger, fontSize: 11, fontWeight: "700" }}>Delete</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
    />
  );
}

// Locations tab. Skips bulk-select/bulk-delete and CSV import (web's BulkActionsBar/DataTable
// import) — no mobile precedent for multi-select lists; single-row delete + duplicate covers it.
function LocationsTab() {
  const { colors, spacing, radius } = useTheme();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<LocationItem | null>(null);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");

  const { data: locations, isLoading } = useQuery({ queryKey: ["mobile-locations"], queryFn: async () => (await axiosClient.get("/locations")).data as LocationItem[] });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["mobile-locations"] });
  }

  function closeForm() {
    setShowForm(false);
    setEditing(null);
    setName("");
    setAddress("");
  }

  function startEdit(l: LocationItem) {
    setEditing(l);
    setName(l.name);
    setAddress(l.address ?? "");
    setShowForm(true);
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = { name: name.trim(), address: address.trim() || undefined };
      return editing ? axiosClient.patch(`/locations/${editing.id}`, payload) : axiosClient.post("/locations", payload);
    },
    onSuccess: () => { invalidate(); closeForm(); },
  });

  const deleteMutation = useMutation({ mutationFn: (id: number) => axiosClient.delete(`/locations/${id}`), onSuccess: invalidate });
  const duplicateMutation = useMutation({ mutationFn: (id: number) => axiosClient.post(`/locations/${id}/duplicate`), onSuccess: invalidate });

  function confirmDelete(l: LocationItem) {
    Alert.alert("Delete location", `Delete "${l.name}"? This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(l.id) },
    ]);
  }

  const inputStyle = { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, backgroundColor: colors.surface };

  if (isLoading) return <ShimmerList />;

  return (
    <FlatList
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
      data={locations ?? []}
      keyExtractor={(item) => String(item.id)}
      ListHeaderComponent={
        <View style={{ marginBottom: spacing.md }}>
          {!showForm ? (
            hasPermission("admin", "create") ? (
              <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 12 }} onPress={() => setShowForm(true)}>
                <Ionicons name="add" size={16} color={colors.text} />
                <Text style={{ color: colors.text, fontWeight: "700", fontSize: 13 }}>Add Location</Text>
              </TouchableOpacity>
            ) : null
          ) : (
            <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 10 }}>
              <TextInput style={inputStyle} placeholder="Name" placeholderTextColor={colors.textMuted} value={name} onChangeText={setName} />
              <TextInput style={inputStyle} placeholder="Address (optional)" placeholderTextColor={colors.textMuted} value={address} onChangeText={setAddress} />
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, alignItems: "center", paddingVertical: 10 }} onPress={closeForm}>
                  <Text style={{ color: colors.text, fontWeight: "700", fontSize: 12.5 }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 1, backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 10, opacity: name.trim() ? 1 : 0.5 }}
                  disabled={!name.trim() || saveMutation.isPending}
                  onPress={() => saveMutation.mutate()}
                >
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12.5 }}>{editing ? "Save" : "Add"}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      }
      ListEmptyComponent={!isLoading ? <Text style={{ color: colors.textMuted, textAlign: "center" }}>None added yet.</Text> : null}
      renderItem={({ item: l }) => (
        <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: 6 }}>
          <Text style={{ color: colors.text, fontSize: 13.5, fontWeight: "700" }}>{l.name}</Text>
          {l.address && <Text style={{ color: colors.textMuted, fontSize: 11.5, marginTop: 2 }}>{l.address}</Text>}
          <View style={{ flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            {hasPermission("admin", "edit") && (
              <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} onPress={() => startEdit(l)}>
                <Text style={{ color: colors.text, fontSize: 11, fontWeight: "700" }}>Edit</Text>
              </TouchableOpacity>
            )}
            {hasPermission("admin", "duplicate") && (
              <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} onPress={() => duplicateMutation.mutate(l.id)}>
                <Text style={{ color: colors.text, fontSize: 11, fontWeight: "700" }}>Duplicate</Text>
              </TouchableOpacity>
            )}
            {hasPermission("admin", "delete") && (
              <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.danger, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} onPress={() => confirmDelete(l)}>
                <Text style={{ color: colors.danger, fontSize: 11, fontWeight: "700" }}>Delete</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
    />
  );
}

function emptyTicketCategoryForm() {
  return { name: "", parentId: null as number | null, defaultTemplateId: null as number | null, defaultSlaId: null as number | null };
}

function TicketCategoriesTab() {
  const { colors, spacing, radius } = useTheme();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<TicketCategory | null>(null);
  const [form, setForm] = useState(emptyTicketCategoryForm());
  const [parentPickerOpen, setParentPickerOpen] = useState(false);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [slaPickerOpen, setSlaPickerOpen] = useState(false);

  const { data: categories, isLoading } = useQuery({ queryKey: ["mobile-ticket-categories"], queryFn: async () => (await axiosClient.get("/ticket-categories")).data as TicketCategory[] });
  const { data: templates } = useQuery({ queryKey: ["mobile-ticket-templates"], queryFn: async () => (await axiosClient.get("/ticket-templates")).data as Ref[] });
  const { data: slas } = useQuery({ queryKey: ["mobile-ticket-slas"], queryFn: async () => (await axiosClient.get("/ticket-slas")).data as Ref[] });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["mobile-ticket-categories"] });
  }

  function closeForm() {
    setShowForm(false);
    setEditing(null);
    setForm(emptyTicketCategoryForm());
  }

  function startEdit(c: TicketCategory) {
    setEditing(c);
    setForm({ name: c.name, parentId: c.parentId, defaultTemplateId: c.defaultTemplateId, defaultSlaId: c.defaultSlaId });
    setShowForm(true);
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = { name: form.name.trim(), parentId: form.parentId, defaultTemplateId: form.defaultTemplateId, defaultSlaId: form.defaultSlaId };
      return editing ? axiosClient.patch(`/ticket-categories/${editing.id}`, payload) : axiosClient.post("/ticket-categories", payload);
    },
    onSuccess: () => { invalidate(); closeForm(); },
  });

  const deleteMutation = useMutation({ mutationFn: (id: number) => axiosClient.delete(`/ticket-categories/${id}`), onSuccess: invalidate });

  function confirmDelete(c: TicketCategory) {
    Alert.alert(`Delete "${c.name}"`, "Tickets in this category will be uncategorized. Child categories will lose their parent link.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(c.id) },
    ]);
  }

  const inputStyle = { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, backgroundColor: colors.surface };
  const parentOptions: PickerOption[] = (categories ?? []).filter((c) => c.id !== editing?.id).map((c) => ({ id: c.id, label: c.name }));
  const templateOptions: PickerOption[] = (templates ?? []).map((t) => ({ id: t.id, label: t.name }));
  const slaOptions: PickerOption[] = (slas ?? []).map((s) => ({ id: s.id, label: s.name }));

  if (isLoading) return <ShimmerList />;

  return (
    <FlatList
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
      data={categories ?? []}
      keyExtractor={(item) => String(item.id)}
      ListHeaderComponent={
        <View style={{ marginBottom: spacing.md }}>
          <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 10 }}>
            Categories can nest under a parent, and each carries an optional default template and SLA — applied automatically when a ticket is created in that category.
          </Text>
          {!showForm ? (
            hasPermission("admin", "create") ? (
              <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 12 }} onPress={() => setShowForm(true)}>
                <Ionicons name="add" size={16} color={colors.text} />
                <Text style={{ color: colors.text, fontWeight: "700", fontSize: 13 }}>Add Category</Text>
              </TouchableOpacity>
            ) : null
          ) : (
            <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 10 }}>
              <TextInput style={inputStyle} placeholder="Category name" placeholderTextColor={colors.textMuted} value={form.name} onChangeText={(v) => setForm((f) => ({ ...f, name: v }))} />
              <TouchableOpacity style={[inputStyle, { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }]} onPress={() => setParentPickerOpen(true)}>
                <Text style={{ color: form.parentId ? colors.text : colors.textMuted, fontSize: 13.5 }}>{categories?.find((c) => c.id === form.parentId)?.name ?? "No parent"}</Text>
                <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
              </TouchableOpacity>
              <TouchableOpacity style={[inputStyle, { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }]} onPress={() => setTemplatePickerOpen(true)}>
                <Text style={{ color: form.defaultTemplateId ? colors.text : colors.textMuted, fontSize: 13.5 }}>{templates?.find((t) => t.id === form.defaultTemplateId)?.name ?? "No default template"}</Text>
                <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
              </TouchableOpacity>
              <TouchableOpacity style={[inputStyle, { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }]} onPress={() => setSlaPickerOpen(true)}>
                <Text style={{ color: form.defaultSlaId ? colors.text : colors.textMuted, fontSize: 13.5 }}>{slas?.find((s) => s.id === form.defaultSlaId)?.name ?? "No default SLA"}</Text>
                <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
              </TouchableOpacity>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, alignItems: "center", paddingVertical: 10 }} onPress={closeForm}>
                  <Text style={{ color: colors.text, fontWeight: "700", fontSize: 12.5 }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 1, backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 10, opacity: form.name.trim() ? 1 : 0.5 }}
                  disabled={!form.name.trim() || saveMutation.isPending}
                  onPress={() => saveMutation.mutate()}
                >
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12.5 }}>{editing ? "Save" : "Add Category"}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      }
      ListEmptyComponent={!isLoading ? <Text style={{ color: colors.textMuted, textAlign: "center" }}>No ticket categories yet.</Text> : null}
      renderItem={({ item: c }) => (
        <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: 6 }}>
          <Text style={{ color: colors.text, fontSize: 13.5, fontWeight: "700" }}>{c.name}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
            {c.parent && <Chip label={`Parent: ${c.parent.name}`} color={colors.textMuted} />}
            {c.defaultTemplate && <Chip label={`Template: ${c.defaultTemplate.name}`} color={colors.primary} />}
            {c.defaultSla && <Chip label={`SLA: ${c.defaultSla.name}`} color={colors.primary} />}
          </View>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            {hasPermission("admin", "edit") && (
              <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} onPress={() => startEdit(c)}>
                <Text style={{ color: colors.text, fontSize: 11, fontWeight: "700" }}>Edit</Text>
              </TouchableOpacity>
            )}
            {hasPermission("admin", "delete") && (
              <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.danger, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} onPress={() => confirmDelete(c)}>
                <Text style={{ color: colors.danger, fontSize: 11, fontWeight: "700" }}>Delete</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
      ListFooterComponent={
        <>
          <PickerModal visible={parentPickerOpen} title="Parent Category" options={parentOptions} selectedId={form.parentId} allowClear onSelect={(id) => setForm((f) => ({ ...f, parentId: id as number | null }))} onClose={() => setParentPickerOpen(false)} />
          <PickerModal visible={templatePickerOpen} title="Default Template" options={templateOptions} selectedId={form.defaultTemplateId} allowClear onSelect={(id) => setForm((f) => ({ ...f, defaultTemplateId: id as number | null }))} onClose={() => setTemplatePickerOpen(false)} />
          <PickerModal visible={slaPickerOpen} title="Default SLA" options={slaOptions} selectedId={form.defaultSlaId} allowClear onSelect={(id) => setForm((f) => ({ ...f, defaultSlaId: id as number | null }))} onClose={() => setSlaPickerOpen(false)} />
        </>
      }
    />
  );
}
