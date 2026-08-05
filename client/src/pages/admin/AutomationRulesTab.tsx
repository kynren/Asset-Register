import { RecordRulesPanel } from "./RecordRulesPanel";

const ASSET_CONDITION_FIELDS = ["name", "assetTag", "status", "manufacturer", "model", "categoryId", "locationId"];
const ASSET_ACTION_FIELDS = ["status", "categoryId", "locationId", "assignedToId", "manufacturer"];

const STOCK_CONDITION_FIELDS = ["name", "sku", "category", "unit"];
const STOCK_ACTION_FIELDS = ["category", "unit", "reorderLevel"];

// Generalizes Lighting's schedule-based automations and Helpdesk's create-time Business Rules
// into the same "when field matches, set field" engine for Assets and Stock — the two modules
// that previously had no automation of their own. See server/src/lib/recordRules.ts.
export function AutomationRulesTab() {
  return (
    <div className="stack gap-3">
      <RecordRulesPanel
        entityType="Asset"
        module="assets"
        title="Asset Automation Rules"
        description="Rules run on every asset create and/or update, before it's saved. All conditions on a rule must match; a later rule's actions can override an earlier one's."
        conditionFields={ASSET_CONDITION_FIELDS}
        actionFields={ASSET_ACTION_FIELDS}
      />
      <RecordRulesPanel
        entityType="StockItem"
        module="stock"
        title="Stock Automation Rules"
        description="Rules run on every stock item create and/or update, before it's saved. All conditions on a rule must match; a later rule's actions can override an earlier one's."
        conditionFields={STOCK_CONDITION_FIELDS}
        actionFields={STOCK_ACTION_FIELDS}
      />
    </div>
  );
}
