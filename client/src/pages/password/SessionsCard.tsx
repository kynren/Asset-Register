import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { Icon } from "../../components/Icon";

interface Session {
  id: number;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  expiresAt: string;
  isCurrent: boolean;
}

function describeAgent(userAgent: string | null): string {
  if (!userAgent) return "Unknown device";
  if (/Mobi|Android/i.test(userAgent)) return "Mobile browser";
  if (/Windows/i.test(userAgent)) return "Windows";
  if (/Macintosh/i.test(userAgent)) return "macOS";
  if (/Linux/i.test(userAgent)) return "Linux";
  return "Desktop browser";
}

export function SessionsCard() {
  const queryClient = useQueryClient();

  const { data: sessions, isLoading } = useQuery({
    queryKey: ["auth-sessions"],
    queryFn: async () => (await axiosClient.get("/auth/sessions")).data as Session[],
  });

  const revokeMutation = useMutation({
    mutationFn: (id: number) => axiosClient.delete(`/auth/sessions/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["auth-sessions"] }),
  });

  const revokeOthersMutation = useMutation({
    mutationFn: () => axiosClient.post("/auth/sessions/revoke-others"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["auth-sessions"] }),
  });

  return (
    <div className="card" style={{ maxWidth: 620 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h3 className="mt-0">Active Sessions</h3>
        <button className="btn btn-secondary btn-sm" disabled={revokeOthersMutation.isPending} onClick={() => revokeOthersMutation.mutate()}>
          Log Out Other Devices
        </button>
      </div>
      {isLoading ? (
        <div className="muted">Loading...</div>
      ) : sessions && sessions.length > 0 ? (
        <div className="stack gap-2">
          {sessions.map((s) => (
            <div key={s.id} className="row gap-2" style={{ justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--color-border)" }}>
              <div className="row gap-2">
                <Icon name="cpu" size={16} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {describeAgent(s.userAgent)} {s.isCurrent && <span className="badge badge-success" style={{ marginLeft: 6 }}>This device</span>}
                  </div>
                  <div className="muted" style={{ fontSize: 11 }}>
                    {s.ipAddress ?? "Unknown IP"} · Signed in {dayjs(s.createdAt).format("DD MMM YYYY, HH:mm")}
                  </div>
                </div>
              </div>
              {!s.isCurrent && (
                <button className="btn btn-danger btn-sm" disabled={revokeMutation.isPending} onClick={() => revokeMutation.mutate(s.id)}>
                  Revoke
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">No active sessions found.</div>
      )}
    </div>
  );
}
