import dayjs from "dayjs";
import { Icon } from "../../components/Icon";
import { DOC_TYPE_COLORS, DOC_TYPE_ICONS, DOC_TYPE_LABELS, DocType } from "./docsConstants";

export interface DocLibraryItem {
  id: number;
  title: string;
  docType: DocType;
  category: string;
  collection?: { id: number; name: string } | null;
  summary: string | null;
  tags: string[];
  isPublished: boolean;
  reviewDueDate: string | null;
  updatedAt: string;
  createdBy: { firstName: string; lastName: string } | null;
}

interface DocBookCardProps {
  doc: DocLibraryItem;
  onClick: () => void;
  onCollectionClick?: (collection: { id: number; name: string }) => void;
}

export function DocBookCard({ doc, onClick, onCollectionClick }: DocBookCardProps) {
  const colors = DOC_TYPE_COLORS[doc.docType];
  const overdue = doc.reviewDueDate ? dayjs(doc.reviewDueDate).isBefore(dayjs()) : false;

  return (
    <div className="book-card" onClick={onClick} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onClick()}>
      <div className="book-card-inner">
        <div className="book-card-face book-card-front" style={{ background: `linear-gradient(155deg, ${colors.from}, ${colors.to})` }}>
          {overdue && <div className="book-card-ribbon">Review Overdue</div>}
          {!doc.isPublished && <div className="book-card-draft">Draft</div>}
          <Icon name={DOC_TYPE_ICONS[doc.docType]} size={26} />
          <div>
            <div className="book-card-title">{doc.title}</div>
            <div className="book-card-type">{DOC_TYPE_LABELS[doc.docType]}</div>
          </div>
        </div>

        <div className="book-card-face book-card-back">
          <div className="book-card-back-type">
            {DOC_TYPE_LABELS[doc.docType]}
            {doc.collection && (
              <>
                {" · "}
                <span
                  className="book-card-collection-link"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCollectionClick?.(doc.collection!);
                  }}
                >
                  {doc.collection.name}
                </span>
              </>
            )}
          </div>
          <div className="book-card-back-title">{doc.title}</div>
          {doc.summary && <div className="book-card-back-summary">{doc.summary}</div>}
          {doc.tags.length > 0 && (
            <div className="book-card-back-tags">
              {doc.tags.slice(0, 3).map((t) => (
                <span key={t} className="badge badge-neutral">{t}</span>
              ))}
            </div>
          )}
          <div className="book-card-back-footer">
            <span className={overdue ? "text-danger" : "muted"} style={{ fontSize: 11 }}>
              {doc.reviewDueDate ? `Review ${overdue ? "overdue" : "due"} ${dayjs(doc.reviewDueDate).format("DD MMM YYYY")}` : "No review scheduled"}
            </span>
            <span className="book-card-open">
              Open <Icon name="arrowRight" size={12} />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
