import { VaultTab } from "./VaultTab";

export function PasswordManagementPage() {
  return (
    <div className="stack gap-3">
      <div className="page-header">
        <div>
          <h1 className="page-title">Password Management</h1>
          <p className="page-subtitle">Your personal password vault.</p>
        </div>
      </div>

      <VaultTab />
    </div>
  );
}
