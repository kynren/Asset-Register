import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { Icon } from "../../components/Icon";
import { useAuth } from "../../auth/AuthContext";
import { ChipSelect } from "../../components/ChipSelect";

interface SubstituteRow {
  id: number;
  startDate: string;
  endDate: string;
  substitute: { id: number; firstName: string; lastName: string; email: string };
}

// Lets a user delegate their pending ticket approvals to a stand-in for a bounded date range (e.g.
// while on leave) — mirrors GLPI's "Authorized Substitutes" preference. See
// tickets.controller.ts's getActiveDelegatorIds() for where this is consulted.
export function AuthorizedSubstitutesCard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [substituteId, setSubstituteId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: rows } = useQuery({
    queryKey: ["my-substitutes"],
    queryFn: async () => (await axiosClient.get("/profile/substitutes")).data as SubstituteRow[],
  });
  const { data: users } = useQuery({ queryKey: ["users-directory"], queryFn: async () => (await axiosClient.get("/users/directory")).data });

  const addMutation = useMutation({
    mutationFn: () =>
      axiosClient.post("/profile/substitutes", {
        substituteId: Number(substituteId),
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-substitutes"] });
      setSubstituteId("");
      setStartDate("");
      setEndDate("");
      setError(null);
    },
    onError: (err: any) => setError(err.response?.data?.error ?? "Could not add substitute."),
  });

  const removeMutation = useMutation({
    mutationFn: (id: number) => axiosClient.delete(`/profile/substitutes/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["my-substitutes"] }),
  });

  const now = Date.now();

  return (
    <div className="card">
      <h3 className="mt-0">Authorized Substitutes</h3>
      <p className="muted" style={{ fontSize: 12 }}>
        Delegate your pending ticket approvals to a stand-in for a date range — useful while you're on leave. They'll see your
        pending approvals alongside their own for the duration.
      </p>
      {error && <div className="alert alert-danger">{error}</div>}

      <div className="stack gap-1" style={{ marginBottom: 12 }}>
        {(rows ?? []).map((r) => {
          const active = now >= new Date(r.startDate).getTime() && now <= new Date(r.endDate).getTime();
          return (
            <div key={r.id} className="row gap-2" style={{ justifyContent: "space-between", fontSize: 13, padding: "6px 0", borderBottom: "1px solid var(--color-border)" }}>
              <span>
                {r.substitute.firstName} {r.substitute.lastName}
                <span className="muted"> — {dayjs(r.startDate).format("DD MMM YYYY")} to {dayjs(r.endDate).format("DD MMM YYYY")}</span>
              </span>
              {active && <span className="badge badge-success">Active now</span>}
              <button className="btn btn-secondary btn-sm btn-icon" title="Remove" onClick={() => removeMutation.mutate(r.id)}>
                <Icon name="trash" size={12} />
              </button>
            </div>
          );
        })}
        {!rows?.length && <div className="muted" style={{ fontSize: 12 }}>No substitutes delegated yet.</div>}
      </div>

      <div className="row gap-2 flex-wrap">
        <ChipSelect
          value={substituteId}
          onChange={setSubstituteId}
          placeholder="Select substitute..."
          options={[
            { value: "", label: "Select substitute..." },
            ...(users ?? []).filter((u: any) => u.id !== user?.id).map((u: any) => ({ value: String(u.id), label: `${u.firstName} ${u.lastName}` })),
          ]}
        />
        <input className="input" type="date" style={{ width: "auto" }} value={startDate} onChange={(e) => setStartDate(e.target.value)} title="Start date" />
        <input className="input" type="date" style={{ width: "auto" }} value={endDate} onChange={(e) => setEndDate(e.target.value)} title="End date" />
        <button className="btn btn-secondary btn-sm" disabled={!substituteId || !startDate || !endDate || addMutation.isPending} onClick={() => addMutation.mutate()}>
          <Icon name="plus" size={12} /> Delegate
        </button>
      </div>
    </div>
  );
}
