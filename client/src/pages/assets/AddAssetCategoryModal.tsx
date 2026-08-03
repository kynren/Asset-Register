import { useState } from "react";
import { FormModal } from "../../components/FormModal";
import { Icon } from "../../components/Icon";

interface CategoryOption {
  id: number;
  name: string;
  collectionId: number | null;
}

interface CollectionOption {
  id: number;
  name: string;
}

// Shown when "Add Asset" is clicked while the All Categories tab is active — there's no single
// obvious category to create into, so the user picks a top-level collection (Harness, IT Assets,
// Office, ...) first, then a category within it. Collections with exactly one category (e.g.
// Harness) skip straight to that category with no second step.
export function AddAssetCategoryModal({
  collections,
  categories,
  onSelect,
  onClose,
}: {
  collections: CollectionOption[];
  categories: CategoryOption[];
  onSelect: (categoryId: number) => void;
  onClose: () => void;
}) {
  const [activeCollectionId, setActiveCollectionId] = useState<number | null>(null);
  const activeCollection = collections.find((c) => c.id === activeCollectionId) ?? null;
  const categoriesInActiveCollection = activeCollection ? categories.filter((c) => c.collectionId === activeCollection.id) : [];

  function chooseCollection(collection: CollectionOption) {
    const inCollection = categories.filter((c) => c.collectionId === collection.id);
    if (inCollection.length <= 1) {
      if (inCollection[0]) onSelect(inCollection[0].id);
      return;
    }
    setActiveCollectionId(collection.id);
  }

  return (
    <FormModal title="Add Asset" onClose={onClose} hideFooter maxWidth={420}>
      {activeCollection ? (
        <>
          <button type="button" className="btn btn-secondary btn-sm" style={{ marginBottom: 10 }} onClick={() => setActiveCollectionId(null)}>
            <Icon name="chevronLeft" size={12} /> Back to Collections
          </button>
          <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>Choose a category in {activeCollection.name}.</p>
          <div className="stack gap-1">
            {categoriesInActiveCollection.map((c) => (
              <button
                key={c.id}
                type="button"
                className="btn btn-secondary"
                style={{ justifyContent: "space-between", width: "100%" }}
                onClick={() => onSelect(c.id)}
              >
                {c.name}
                <Icon name="chevronRight" size={14} />
              </button>
            ))}
            {categoriesInActiveCollection.length === 0 && <div className="empty-state">No categories in this collection yet.</div>}
          </div>
        </>
      ) : (
        <>
          <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>Choose a collection for the new asset.</p>
          <div className="stack gap-1">
            {collections.map((col) => (
              <button
                key={col.id}
                type="button"
                className="btn btn-secondary"
                style={{ justifyContent: "space-between", width: "100%" }}
                onClick={() => chooseCollection(col)}
              >
                {col.name}
                <Icon name="chevronRight" size={14} />
              </button>
            ))}
            {collections.length === 0 && <div className="empty-state">No collections yet.</div>}
          </div>
        </>
      )}
    </FormModal>
  );
}
