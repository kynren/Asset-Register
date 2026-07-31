import { useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { Icon } from "../../components/Icon";
import { SkeletonBlock } from "../../components/Skeleton";
import { DOC_TYPES, DOC_TYPE_LABELS } from "./docsConstants";
import { DocBookCard, DocLibraryItem } from "./DocBookCard";

interface Shelf {
  key: string;
  title: string;
  docs: DocLibraryItem[];
}

export function DocsLibrary({ onOpen }: { onOpen: (id: number) => void }) {
  const { data, isLoading } = useQuery<DocLibraryItem[]>({
    queryKey: ["docs-library"],
    queryFn: async () => (await axiosClient.get("/docs/library")).data,
  });

  const shelves = useMemo<Shelf[]>(() => {
    if (!data || data.length === 0) return [];
    const now = dayjs();
    const recentlyUpdated = [...data].sort((a, b) => dayjs(b.updatedAt).diff(dayjs(a.updatedAt))).slice(0, 16);
    const reviewDue = data
      .filter((d) => d.reviewDueDate && dayjs(d.reviewDueDate).diff(now, "day") <= 30)
      .sort((a, b) => dayjs(a.reviewDueDate!).diff(dayjs(b.reviewDueDate!)));

    const list: Shelf[] = [{ key: "recent", title: "Recently Updated", docs: recentlyUpdated }];
    if (reviewDue.length > 0) list.push({ key: "review", title: "Review Due Soon", docs: reviewDue });

    const collectionsById = new Map<number, { name: string; docs: DocLibraryItem[] }>();
    for (const doc of data) {
      if (!doc.collection) continue;
      const entry = collectionsById.get(doc.collection.id);
      if (entry) entry.docs.push(doc);
      else collectionsById.set(doc.collection.id, { name: doc.collection.name, docs: [doc] });
    }
    for (const [id, { name, docs }] of [...collectionsById.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name))) {
      list.push({ key: `collection-${id}`, title: name, docs });
    }

    for (const type of DOC_TYPES) {
      const docs = data.filter((d) => d.docType === type);
      if (docs.length > 0) list.push({ key: type, title: DOC_TYPE_LABELS[type], docs });
    }
    return list;
  }, [data]);

  if (isLoading) {
    return (
      <div className="stack gap-3">
        <SkeletonBlock height={220} />
        <SkeletonBlock height={220} />
      </div>
    );
  }

  if (shelves.length === 0) {
    return (
      <div className="empty-state">
        <Icon name="book" size={32} />
        <div style={{ marginTop: 10 }}>The library is empty — add the first document to start building shelves.</div>
      </div>
    );
  }

  return (
    <div className="docs-library">
      {shelves.map((shelf) => (
        <ShelfRow key={shelf.key} title={shelf.title} docs={shelf.docs} onOpen={onOpen} />
      ))}
    </div>
  );
}

function ShelfRow({ title, docs, onOpen }: { title: string; docs: DocLibraryItem[]; onOpen: (id: number) => void }) {
  const trackRef = useRef<HTMLDivElement>(null);

  function scroll(dir: 1 | -1) {
    trackRef.current?.scrollBy({ left: dir * 480, behavior: "smooth" });
  }

  return (
    <div className="docs-shelf">
      <div className="docs-shelf-header">
        <div className="docs-shelf-title">{title}</div>
        <div className="docs-shelf-count">{docs.length} {docs.length === 1 ? "document" : "documents"}</div>
      </div>
      <div className="docs-shelf-track-wrap">
        <button className="docs-shelf-arrow left" onClick={() => scroll(-1)} aria-label="Scroll left">
          <Icon name="chevronLeft" size={20} />
        </button>
        <div className="docs-shelf-track" ref={trackRef}>
          {docs.map((doc) => (
            <DocBookCard key={doc.id} doc={doc} onClick={() => onOpen(doc.id)} />
          ))}
        </div>
        <button className="docs-shelf-arrow right" onClick={() => scroll(1)} aria-label="Scroll right">
          <Icon name="chevronRight" size={20} />
        </button>
      </div>
      <div className="docs-shelf-ledge" />
    </div>
  );
}
