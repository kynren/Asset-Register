import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { axiosClient } from "../api/axiosClient";

// Generic per-user UI-state persistence — whatever a user changes (grid layout, selected
// filters, panel state) is saved to their account server-side instead of resetting on next
// login or a different device. `key` must be one of the backend's known preference keys.
export function useUserPreference<T>(key: string, defaultValue: T) {
  const queryClient = useQueryClient();
  const queryKey = ["user-preference", key];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => (await axiosClient.get(`/preferences/${key}`)).data.value as T | null,
    staleTime: 60_000,
  });

  const mutation = useMutation({
    mutationFn: (value: T) => axiosClient.put(`/preferences/${key}`, { value }),
    onMutate: async (value: T) => {
      queryClient.setQueryData(queryKey, value);
    },
  });

  const value = data ?? defaultValue;
  return { value, setValue: mutation.mutate, isLoading } as const;
}
