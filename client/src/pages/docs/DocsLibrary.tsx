import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ColumnDef } from "@tanstack/react-table";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { DataTable } from "../../components/DataTable";
import { Icon } from "../../components/Icon";
import { SkeletonBlock } from "../../components/Skeleton";
import { DOC_CATEGORIES, DOC_TYPE_LABELS } from "./docsConstants";
import { DocBookCard, DocLibraryItem } from "./DocBookCard";
import { CategoryTab, CategoryTabBar } from "./CategoryTabBar";

const RECENTLY_UPDATED_LIMIT = 12;

interface CollectionRef {
  id: number;
  name: string;
}

export function DocsLibrary({ onOpen }: { onOpen: (id: number) => void }) {
  const { data, isLoading } = useQuery<DocLibraryItem[]>({
    queryKey: ["docs-library"],
    queryFn: async () => (await axiosClient.get("/docs/library")).data,
  });

  const [activeCategory, setActiveCategory] = useState("");
  const [activeCollection, setActiveCollection] = useState<CollectionRef | null>(null);
  const [categoryView, setCategoryView] = useState<"table" | "grid">("table");

  const recentlyUpdated = useMemo(() => {
    if (!data) return [];
    return [...data].sort((a, b) => dayjs(b.updatedAt).diff(dayjs(a.updatedAt))).slice(0, RECENTLY_UPDATED_LIMIT);
  }, [data]);

  const reviewDueSoon = useMemo(() => {
    if (!data) return [];
    const now = dayjs();
    return data
      .filter((d) => d.reviewDueDate && dayjs(d.reviewDueDate).diff(now, "day") <= 30)
      .sort((a, b) => dayjs(a.reviewDueDate!).diff(dayjs(b.reviewDueDate!)));
  }, [data]);

  const categoryTabs = useMemo<CategoryTab[]>(() => {
    if (!data) return [];
    const counts = new Map<string, number>();
    for (const doc of data) counts.set(doc.category, (counts.get(doc.category) ?? 0) + 1);
    const known = DOC_CATEGORIES.filter((c) => counts.has(c));
    const extra = [...counts.keys()].filter((c) => !DOC_CATEGORIES.includes(c)).sort((a, b) => a.localeCompare(b));
    return [...known, ...extra].map((name) => ({ name, count: counts.get(name)! }));
  }, [data]);

  const categoryDocs = useMemo(() => {
    if (!data) return [];
    let docs = data;
    if (activeCollection) docs = docs.filter((d) => d.collection?.id === activeCollection.id);
    else if (activeCategory) docs = docs.filter((d) => d.category === activeCategory);
    return [...docs].sort((a, b) => dayjs(b.updatedAt).diff(dayjs(a.updatedAt)));
  }, [data, activeCategory, activeCollection]);

  function selectCategory(category: string) {
    setActiveCollection(null);
    setActiveCategory(category);
  }

  function selectCollection(collection: CollectionRef) {
    setActiveCollection(collection);
  }

  function backToTopLevelCategories() {
    setActiveCollection(null);
    setActiveCategory("");
  }

  const columns: ColumnDef<DocLibraryItem, any>[] = [
    {
      header: "Title",
      cell: ({ row }) => (
        <div>
          <div style={{ fontWeight: 600 }}>{row.original.title}</div>
          {row.original.summary && <div className="muted" style={{ fontSize: 11 }}>{row.original.summary}</div>}
        </div>
      ),
    },
    {
      header: "Collection",
      cell: ({ row }) =>
        row.original.collection ? (
          <button
            className="docs-collection-link"
            onClick={(e) => {
              e.stopPropagation();
              selectCollection(row.original.collection!);
            }}
          >
            {row.original.collection.name}
          </button>
        ) : (
          "—"
        ),
    },
    { header: "Type", cell: ({ row }) => <span className="badge badge-neutral">{DOC_TYPE_LABELS[row.original.docType]}</span> },
    { header: "Category", accessorKey: "category" },
    {
      header: "Review Due",
      cell: ({ row }) => {
        const due = row.original.reviewDueDate;
        if (!due) return "—";
        const overdue = dayjs(due).isBefore(dayjs());
        return <span style={{ color: overdue ? "var(--color-danger)" : undefined, fontWeight: overdue ? 600 : undefined }}>{dayjs(due).format("DD MMM YYYY")}{overdue ? " (overdue)" : ""}</span>;
      },
    },
    { header: "Updated", accessorFn: (r) => dayjs(r.updatedAt).format("DD MMM YYYY") },
    { header: "Author", accessorFn: (r) => (r.createdBy ? `${r.createdBy.firstName} ${r.createdBy.lastName}` : "—") },
  ];

  if (isLoading) {
    return (
      <div className="stack gap-3">
        <SkeletonBlock height={220} />
        <SkeletonBlock height={220} />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="empty-state">
        <Icon name="book" size={32} />
        <div style={{ marginTop: 10 }}>The library is empty — add the first document to start building the collection.</div>
      </div>
    );
  }

  return (
    <div className="docs-library">
      <div className="docs-shelf">
        <div className="docs-shelf-header">
          <div className="docs-shelf-title">Recently Updated</div>
          <div className="docs-shelf-count">{recentlyUpdated.length} {recentlyUpdated.length === 1 ? "document" : "documents"}</div>
        </div>
        <div className="docs-recent-grid">
          {recentlyUpdated.map((doc) => (
            <DocBookCard key={doc.id} doc={doc} onClick={() => onOpen(doc.id)} onCollectionClick={selectCollection} />
          ))}
        </div>
      </div>

      {reviewDueSoon.length > 0 && (
        <div className="docs-shelf">
          <div className="docs-shelf-header">
            <div className="docs-shelf-title">Review Due Soon</div>
            <div className="docs-shelf-count">{reviewDueSoon.length} {reviewDueSoon.length === 1 ? "document" : "documents"}</div>
          </div>
          <div className="docs-recent-grid">
            {reviewDueSoon.map((doc) => (
              <DocBookCard key={doc.id} doc={doc} onClick={() => onOpen(doc.id)} onCollectionClick={selectCollection} />
            ))}
          </div>
        </div>
      )}

      <div className="docs-shelf">
        <div className="docs-shelf-header">
          <div className="row gap-2" style={{ alignItems: "baseline" }}>
            {activeCollection ? (
              <>
                <button className="docs-breadcrumb-root" onClick={backToTopLevelCategories}>Categories</button>
                <Icon name="chevronRight" size={12} />
                <span className="docs-shelf-title">{activeCollection.name}</span>
              </>
            ) : (
              <span className="docs-shelf-title">Categories</span>
            )}
          </div>
          <div className="docs-view-toggle">
            <button className={categoryView === "table" ? "active" : ""} onClick={() => setCategoryView("table")}>
              <Icon name="menu" size={13} /> Table
            </button>
            <button className={categoryView === "grid" ? "active" : ""} onClick={() => setCategoryView("grid")}>
              <Icon name="grid" size={13} /> Grid
            </button>
          </div>
        </div>

        {!activeCollection && <CategoryTabBar categories={categoryTabs} active={activeCategory} onSelect={selectCategory} />}

        {categoryDocs.length === 0 ? (
          <div className="empty-state">No documents in this {activeCollection ? "collection" : "category"} yet.</div>
        ) : categoryView === "table" ? (
          <div className="card" style={{ marginTop: 12 }}>
            <DataTable columns={columns} data={categoryDocs} onRowClick={(row) => onOpen(row.id)} />
          </div>
        ) : (
          <div className="docs-recent-grid" style={{ marginTop: 12 }}>
            {categoryDocs.map((doc) => (
              <DocBookCard key={doc.id} doc={doc} onClick={() => onOpen(doc.id)} onCollectionClick={selectCollection} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
