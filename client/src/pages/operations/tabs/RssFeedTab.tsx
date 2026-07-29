import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { axiosClient } from "../../../api/axiosClient";
import { Icon } from "../../../components/Icon";
import { PermissionGate } from "../../../auth/PermissionGate";

interface RssSource { id: number; name: string; url: string; createdAt: string; }
interface FeedItem { title: string; link: string | null; pubDate: string | null; sourceName: string; }

export function RssFeedTab() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");

  const { data: sources } = useQuery({
    queryKey: ["op-rss-sources"],
    queryFn: async () => (await axiosClient.get("/operations/rss/sources")).data as RssSource[],
  });

  const { data: feed, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["op-rss-items"],
    queryFn: async () => (await axiosClient.get("/operations/rss/items")).data as { items: FeedItem[]; failedSources: string[] },
    enabled: Boolean(sources && sources.length > 0),
  });

  const addSourceMutation = useMutation({
    mutationFn: () => axiosClient.post("/operations/rss/sources", { name, url }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["op-rss-sources"] });
      setName("");
      setUrl("");
    },
  });

  const removeSourceMutation = useMutation({
    mutationFn: (id: number) => axiosClient.delete(`/operations/rss/sources/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["op-rss-sources"] });
      queryClient.invalidateQueries({ queryKey: ["op-rss-items"] });
    },
  });

  return (
    <div>
      <div className="ot-body-header">
        <div className="ot-body-header-text">Aggregated headlines from configured RSS/Atom feed sources.</div>
        <button className="ad-btn" onClick={() => refetch()} disabled={isFetching || !sources?.length}>
          <Icon name="activity" size={13} /> {isFetching ? "Refreshing..." : "Refresh Feed"}
        </button>
      </div>

      <div className="ad-grid">
        <div className="ad-panel">
          <div className="ad-panel-title">Feed Sources</div>
          <PermissionGate module="operations" action="edit">
            <div className="ad-add-form">
              <div className="ad-field"><label>Name</label><input className="ad-input" placeholder="e.g. Industry News" value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div className="ad-field"><label>Feed URL</label><input className="ad-input" placeholder="https://example.com/feed.xml" value={url} onChange={(e) => setUrl(e.target.value)} /></div>
              <button className="ad-btn ad-btn-primary" disabled={!name || !url || addSourceMutation.isPending} onClick={() => addSourceMutation.mutate()}>
                <Icon name="plus" size={12} /> Add Source
              </button>
            </div>
          </PermissionGate>
          {sources && sources.length > 0 ? (
            <div className="stack gap-2">
              {sources.map((s) => (
                <div key={s.id} className="ad-row-card">
                  <div>
                    <div className="ad-row-value">{s.name}</div>
                    <div className="ad-row-label" style={{ textTransform: "none" }}>{s.url}</div>
                  </div>
                  <PermissionGate module="operations" action="edit">
                    <button className="ad-btn ad-btn-danger" onClick={() => removeSourceMutation.mutate(s.id)}><Icon name="trash" size={12} /></button>
                  </PermissionGate>
                </div>
              ))}
            </div>
          ) : (
            <div className="ad-empty">No feed sources configured yet. Add one above to start pulling headlines.</div>
          )}
        </div>

        <div className="ad-panel">
          <div className="ad-panel-title">Latest Headlines</div>
          {!sources?.length ? (
            <div className="ad-empty">Add a feed source to see live headlines here.</div>
          ) : isLoading ? (
            <div className="ad-empty">Loading feed...</div>
          ) : feed && feed.items.length > 0 ? (
            <div className="stack gap-2" style={{ maxHeight: 480, overflowY: "auto" }}>
              {feed.items.map((item, i) => (
                <a key={i} className="ad-row-card" style={{ display: "block", textDecoration: "none" }} href={item.link ?? undefined} target="_blank" rel="noreferrer">
                  <div className="ad-row-value">{item.title}</div>
                  <div className="ad-row-label" style={{ textTransform: "none" }}>
                    {item.sourceName}{item.pubDate ? ` · ${dayjs(item.pubDate).format("DD MMM YYYY, HH:mm")}` : ""}
                  </div>
                </a>
              ))}
            </div>
          ) : (
            <div className="ad-empty">No headlines returned yet.</div>
          )}
          {feed && feed.failedSources.length > 0 && (
            <div className="ad-badge ad-badge-warning" style={{ marginTop: 12 }}>
              Could not fetch: {feed.failedSources.join(", ")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
