import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { useAuth } from "../../auth/AuthContext";
import { KeyboardAvoidingScreen } from "../../components/KeyboardAvoidingScreen";
import { ModuleName } from "../../lib/permissions";
import { QueryFilterBuilder, FilterCondition } from "../../components/QueryFilterBuilder";
import { DATA_EXPLORER_SOURCES, getSource } from "../../lib/dataExplorerConfig";
import { MoreStackParamList } from "../../navigation/types";

type Visualization = "kpi" | "table" | "bar" | "pie" | "line";

interface ReportDetail {
  id: number;
  name: string;
  description: string | null;
  source: string;
  filters: { combinator: "AND" | "OR"; conditions: FilterCondition[] } | null;
  columns: string[] | null;
  groupBy: string | null;
  visualization: Visualization;
}

type PreviewResult =
  | { kind: "kpi"; value: number }
  | { kind: "table"; columns: string[]; rows: Record<string, unknown>[] }
  | { kind: "chart"; data: { label: string; count: number }[] };

const VISUALIZATIONS: { value: Visualization; label: string }[] = [
  { value: "table", label: "Table" },
  { value: "kpi", label: "KPI Count" },
  { value: "bar", label: "Bar Chart" },
  { value: "pie", label: "Pie Chart" },
  { value: "line", label: "Line Chart" },
];

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { colors, radius } = useTheme();
  return (
    <TouchableOpacity
      style={{ borderWidth: 1, borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary + "22" : colors.surface, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8 }}
      onPress={onPress}
    >
      <Text style={{ color: active ? colors.primary : colors.text, fontSize: 12.5, fontWeight: "600" }}>{label}</Text>
    </TouchableOpacity>
  );
}

export function ReportBuilderScreen() {
  const { colors, spacing, radius } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<MoreStackParamList>>();
  const route = useRoute<RouteProp<MoreStackParamList, "ReportBuilder">>();
  const queryClient = useQueryClient();
  const { hasPermission } = useAuth();
  const reportId = route.params?.reportId;
  const defaultSource = route.params?.defaultSource;

  const availableSources = DATA_EXPLORER_SOURCES.filter((s) => hasPermission(s.module as ModuleName, "view"));

  const { data: existing } = useQuery<ReportDetail>({
    queryKey: ["mobile-report-detail", reportId],
    queryFn: async () => (await axiosClient.get(`/reports/${reportId}`)).data,
    enabled: reportId != null,
  });

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sourceId, setSourceId] = useState((defaultSource && availableSources.some((s) => s.id === defaultSource) ? defaultSource : availableSources[0]?.id) ?? "");
  const [combinator, setCombinator] = useState<"AND" | "OR">("AND");
  const [conditions, setConditions] = useState<FilterCondition[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [groupBy, setGroupBy] = useState("");
  const [visualization, setVisualization] = useState<Visualization>("table");
  const [initialized, setInitialized] = useState(reportId == null);

  const source = getSource(sourceId) ?? availableSources[0];

  useEffect(() => {
    if (existing && !initialized) {
      setName(existing.name);
      setDescription(existing.description ?? "");
      setSourceId(existing.source);
      setCombinator(existing.filters?.combinator ?? "AND");
      setConditions(existing.filters?.conditions ?? []);
      setColumns(existing.columns ?? getSource(existing.source)?.defaultColumns ?? []);
      setGroupBy(existing.groupBy ?? "");
      setVisualization(existing.visualization);
      setInitialized(true);
    }
  }, [existing, initialized]);

  function changeSource(id: string) {
    setSourceId(id);
    setConditions([]);
    setGroupBy("");
    setColumns(getSource(id)?.defaultColumns ?? []);
  }

  function toggleColumn(key: string) {
    setColumns((cols) => (cols.includes(key) ? cols.filter((c) => c !== key) : [...cols, key]));
  }

  const spec = source
    ? { source: source.id, filters: { combinator, conditions }, columns: visualization === "table" ? columns : undefined, groupBy: groupBy || undefined, visualization }
    : null;

  const { data: preview, isFetching: previewLoading } = useQuery<PreviewResult>({
    queryKey: ["mobile-report-preview", spec],
    queryFn: async () => (await axiosClient.post("/reports/preview", spec)).data,
    enabled: !!spec && initialized,
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      const body = {
        name: name.trim(),
        description: description.trim() || null,
        source: source!.id,
        filters: { combinator, conditions },
        columns: visualization === "table" ? columns : null,
        groupBy: groupBy || null,
        visualization,
      };
      return reportId ? axiosClient.patch(`/reports/${reportId}`, body) : axiosClient.post("/reports", body);
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["mobile-reports"] });
      if (reportId) {
        queryClient.invalidateQueries({ queryKey: ["mobile-report-detail", reportId] });
        queryClient.invalidateQueries({ queryKey: ["mobile-report-meta", reportId] });
        queryClient.invalidateQueries({ queryKey: ["mobile-report-run", reportId] });
        navigation.goBack();
      } else {
        navigation.replace("ReportView", { id: res.data.id });
      }
    },
  });

  const canSave = name.trim().length > 0 && !!source;
  const labelStyle = { color: colors.textMuted, fontSize: 12, fontWeight: "700" as const, marginBottom: 8, textTransform: "uppercase" as const, marginTop: spacing.md };
  const inputStyle = { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, backgroundColor: colors.surface };

  return (
    <KeyboardAvoidingScreen>
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}>
      <Text style={[labelStyle, { marginTop: 0 }]}>Report Name</Text>
      <TextInput style={inputStyle} placeholder="e.g. Assets Due for Maintenance" placeholderTextColor={colors.textMuted} value={name} onChangeText={setName} />

      <Text style={labelStyle}>Description (optional)</Text>
      <TextInput style={inputStyle} placeholder="What is this report for?" placeholderTextColor={colors.textMuted} value={description} onChangeText={setDescription} />

      <Text style={labelStyle}>Data Source</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {availableSources.map((s) => (
          <Chip key={s.id} label={s.label} active={sourceId === s.id} onPress={() => changeSource(s.id)} />
        ))}
      </View>

      {source && (
        <>
          <Text style={labelStyle}>Filters</Text>
          <QueryFilterBuilder source={source} combinator={combinator} conditions={conditions} onCombinatorChange={setCombinator} onConditionsChange={setConditions} />

          <Text style={labelStyle}>Visualization</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {VISUALIZATIONS.map((v) => (
              <Chip key={v.value} label={v.label} active={visualization === v.value} onPress={() => setVisualization(v.value)} />
            ))}
          </View>

          {(["bar", "pie", "line"] as Visualization[]).includes(visualization) && (
            <>
              <Text style={labelStyle}>Group By</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {source.groupableFields.map((key) => (
                  <Chip key={key} label={source.fields.find((f) => f.key === key)?.label ?? key} active={groupBy === key} onPress={() => setGroupBy(key)} />
                ))}
              </View>
            </>
          )}

          {visualization === "table" && (
            <>
              <Text style={labelStyle}>Columns</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {source.availableColumns.map((c) => (
                  <Chip key={c.value} label={c.label} active={columns.includes(c.value)} onPress={() => toggleColumn(c.value)} />
                ))}
              </View>
            </>
          )}

          <Text style={labelStyle}>Live Preview</Text>
          <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, maxHeight: 220 }}>
            {previewLoading ? (
              <ActivityIndicator color={colors.primary} />
            ) : !preview ? (
              <Text style={{ color: colors.textMuted }}>—</Text>
            ) : preview.kind === "kpi" ? (
              <Text style={{ color: colors.text, fontSize: 28, fontWeight: "800" }}>{preview.value}</Text>
            ) : preview.kind === "chart" ? (
              preview.data.length ? (
                <ScrollView>
                  {preview.data.map((d, i) => (
                    <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 }}>
                      <Text style={{ color: colors.text, fontSize: 12.5 }}>{d.label}</Text>
                      <Text style={{ color: colors.text, fontSize: 12.5, fontWeight: "700" }}>{d.count}</Text>
                    </View>
                  ))}
                </ScrollView>
              ) : (
                <Text style={{ color: colors.textMuted }}>No matching data.</Text>
              )
            ) : preview.rows.length ? (
              <ScrollView>
                {preview.rows.slice(0, 5).map((row, i) => (
                  <View key={i} style={{ paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                    {preview.columns.map((c) => (
                      <Text key={c} style={{ color: colors.textMuted, fontSize: 11 }}>
                        {source.availableColumns.find((ac) => ac.value === c)?.label ?? c}: <Text style={{ color: colors.text, fontWeight: "600" }}>{String((row as any)[c] ?? "—")}</Text>
                      </Text>
                    ))}
                  </View>
                ))}
              </ScrollView>
            ) : (
              <Text style={{ color: colors.textMuted }}>No matching data.</Text>
            )}
          </View>
        </>
      )}

      <TouchableOpacity
        style={{ backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 15, marginTop: spacing.lg, opacity: canSave ? 1 : 0.6 }}
        disabled={!canSave || saveMutation.isPending}
        onPress={() => saveMutation.mutate()}
      >
        {saveMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700" }}>{reportId ? "Save Changes" : "Create Report"}</Text>}
      </TouchableOpacity>
    </ScrollView>
    </KeyboardAvoidingScreen>
  );
}
