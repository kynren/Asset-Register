import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ColumnDef } from "@tanstack/react-table";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { DataTable } from "../../components/DataTable";
import { Icon } from "../../components/Icon";
import { PermissionGate } from "../../auth/PermissionGate";
import { DOC_CATEGORIES, DOC_TYPES, DOC_TYPE_LABELS, DocType } from "./docsConstants";
import { DocumentFormModal } from "./DocumentFormModal";
import { DocsLibrary } from "./DocsLibrary";
import { DocBookCard } from "./DocBookCard";
import { CollectionsManageModal, DocCollectionItem } from "./CollectionsManageModal";

interface DocListItem {
  id: number;
  title: string;
  docType: DocType;
  category: string;
  collectionId: number;
  collection: { id: number; name: string } | null;
  summary: string | null;
  tags: string[];
  isPublished: boolean;
  reviewDueDate: string | null;
  updatedAt: string;
  createdBy: { firstName: string; lastName: string } | null;
}

export function DocsListPage() {
  const [search, setSearch] = useState("");
  const [docType, setDocType] = useState<DocType | "">("");
  const [category, setCategory] = useState("");
  const [collectionId, setCollectionId] = useState("");
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [showManageCollections, setShowManageCollections] = useState(false);
  const [view, setView] = useState<"library" | "table">("library");
  const navigate = useNavigate();

  const { data: collections } = useQuery({
    queryKey: ["docs-collections"],
    queryFn: async () => (await axiosClient.get("/docs/collections")).data as DocCollectionItem[],
  });

  const hasActiveFilter = Boolean(search.trim() || docType || category || collectionId);
  const showShelves = view === "library" && !hasActiveFilter;
  const showBookResults = view === "library" && hasActiveFilter;

  const { data, isLoading } = useQuery({
    queryKey: ["docs", { search, docType, category, collectionId, page }],
    queryFn: async () =>
      (
        await axiosClient.get("/docs", {
          params: { search: search || undefined, docType: docType || undefined, category: category || undefined, collectionId: collectionId || undefined, page, pageSize: showBookResults ? 60 : 15 },
        })
      ).data,
    enabled: view === "table" || hasActiveFilter,
  });

  const columns: ColumnDef<DocListItem, any>[] = [
    {
      header: "Title",
      cell: ({ row }) => (
        <div>
          <div style={{ fontWeight: 600 }}>{row.original.title}</div>
          {row.original.summary && <div className="muted" style={{ fontSize: 11 }}>{row.original.summary}</div>}
        </div>
      ),
    },
    { header: "Collection", accessorFn: (r) => r.collection?.name ?? "—" },
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

  return (
    <div className="stack gap-3">
      <div className="page-header">
        <div>
          <h1 className="page-title">Docs & SOPs</h1>
          <p className="page-subtitle">Standard operating procedures, work instructions, runbooks, checklists, and reference material.</p>
        </div>
        <PermissionGate module="docs" action="create">
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            <Icon name="plus" size={14} /> New Document
          </button>
        </PermissionGate>
      </div>

      <div className="row gap-2 flex-wrap" style={{ alignItems: "center" }}>
        <input
          className="input"
          style={{ flex: "1 1 260px" }}
          placeholder="Search titles, content, tags..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
        <select className="select" style={{ maxWidth: 240 }} value={docType} onChange={(e) => { setDocType(e.target.value as DocType | ""); setPage(1); }}>
          <option value="">All Types</option>
          {DOC_TYPES.map((t) => <option key={t} value={t}>{DOC_TYPE_LABELS[t]}</option>)}
        </select>
        <select className="select" style={{ maxWidth: 220 }} value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}>
          <option value="">All Categories</option>
          {DOC_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="select" style={{ maxWidth: 220 }} value={collectionId} onChange={(e) => { setCollectionId(e.target.value); setPage(1); }}>
          <option value="">All Collections</option>
          {(collections ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button className="btn btn-secondary btn-sm" onClick={() => setShowManageCollections(true)}>
          <Icon name="layers" size={13} /> Collections
        </button>
        <div className="docs-view-toggle">
          <button className={view === "library" ? "active" : ""} onClick={() => setView("library")}>
            <Icon name="book" size={13} /> Library
          </button>
          <button className={view === "table" ? "active" : ""} onClick={() => setView("table")}>
            <Icon name="grid" size={13} /> List
          </button>
        </div>
      </div>

      {showShelves && <DocsLibrary onOpen={(id) => navigate(`/docs/${id}`)} />}

      {showBookResults && (
        <div className="docs-shelf">
          <div className="docs-shelf-header">
            <div className="docs-shelf-title">Search Results</div>
            <div className="docs-shelf-count">{data?.total ?? 0} {data?.total === 1 ? "document" : "documents"}</div>
          </div>
          {!isLoading && (data?.items?.length ?? 0) === 0 ? (
            <div className="empty-state">{search ? `No documents match "${search}".` : "No documents match these filters."}</div>
          ) : (
            <div className="docs-shelf-track" style={{ flexWrap: "wrap", overflow: "visible" }}>
              {(data?.items ?? []).map((doc: DocListItem) => (
                <DocBookCard key={doc.id} doc={doc} onClick={() => navigate(`/docs/${doc.id}`)} />
              ))}
            </div>
          )}
        </div>
      )}

      {view === "table" && (
        <div className="card">
          <DataTable
            tableId="docs.list"
            defaultViewMode="list"
            columns={columns}
            data={data?.items ?? []}
            isLoading={isLoading}
            page={data?.page}
            totalPages={data?.totalPages}
            onPageChange={setPage}
            onRowClick={(row) => navigate(`/docs/${row.id}`)}
            emptyMessage={search ? `No documents match "${search}".` : "No documents yet — add the first one."}
          />
        </div>
      )}

      {showCreate && <DocumentFormModal onClose={() => setShowCreate(false)} onCreated={(doc) => { setShowCreate(false); navigate(`/docs/${doc.id}`); }} />}
      {showManageCollections && <CollectionsManageModal onClose={() => setShowManageCollections(false)} />}
    </div>
  );
}
