import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { axiosClient } from "../api/axiosClient";

export interface CustomColumn {
  id: number;
  entityType: string;
  name: string;
  fieldType: "TEXT" | "NUMBER" | "DATE" | "BOOLEAN";
  order: number;
}

// User-addable extra columns on Assets/Stock (see server/prisma/schema.prisma CustomColumn) —
// any permitted user can add one from the list page itself, spanning every row of that entityType
// regardless of category. Distinct from AssetFormTemplate (admin-defined, per-category) and
// AssetCategory.tableColumns (toggles visibility of existing fields only).
export function useCustomColumns(entityType: string) {
  const queryClient = useQueryClient();
  const queryKey = ["custom-columns", entityType];

  const { data: columns, isLoading } = useQuery({
    queryKey,
    queryFn: async () => (await axiosClient.get("/custom-columns", { params: { entityType } })).data as CustomColumn[],
  });

  const createMutation = useMutation({
    mutationFn: (v: { name: string; fieldType: CustomColumn["fieldType"] }) =>
      axiosClient.post("/custom-columns", { entityType, ...v, order: columns?.length ?? 0 }),
    meta: { successMessage: "Column added" },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => axiosClient.delete(`/custom-columns/${id}`),
    meta: { successMessage: "Column removed" },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const listQueryKey = entityType === "Asset" ? "assets" : entityType === "StockItem" ? "stock" : entityType;
  const setValueMutation = useMutation({
    mutationFn: ({ columnId, entityId, value }: { columnId: number; entityId: number; value: string | null }) =>
      axiosClient.patch(`/custom-columns/${columnId}/values/${entityId}`, { value }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [listQueryKey] }),
  });

  return { columns: columns ?? [], isLoading, createMutation, deleteMutation, setValueMutation };
}
