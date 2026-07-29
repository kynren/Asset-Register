import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { axiosClient } from "../../api/axiosClient";
import { AssetDetail } from "./detail/types";
import { HarnessDetailPage } from "./HarnessDetailPage";
import { Skeleton, SkeletonText } from "../../components/Skeleton";

// Top-level route wrapper for /harness/:id — Harness is a dedicated view, not a tab inside the
// generic Asset Detail page, so it has its own fetch + loading state here rather than piggybacking
// on AssetDetailPage's.
export function HarnessDetailRoutePage() {
  const { id } = useParams();
  const queryClient = useQueryClient();

  const { data: asset, isLoading } = useQuery({
    queryKey: ["asset", id],
    queryFn: async () => (await axiosClient.get(`/assets/${id}`)).data as AssetDetail,
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["asset", id] });
  }

  if (isLoading || !asset) {
    return (
      <div className="ad-shell">
        <div className="ad-header">
          <Skeleton width={220} height={22} />
        </div>
        <div style={{ padding: 22 }}>
          <div className="ad-grid">
            <div className="ad-panel"><SkeletonText lines={6} /></div>
            <div className="ad-panel"><SkeletonText lines={3} /></div>
          </div>
        </div>
      </div>
    );
  }

  return <HarnessDetailPage asset={asset} onUpdated={invalidate} />;
}
