import { ReactNode } from "react";
import { Icon } from "./Icon";

interface FilterBarProps {
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  children?: ReactNode;
  actions?: ReactNode;
}

export function FilterBar({ search, onSearchChange, searchPlaceholder = "Search...", children, actions }: FilterBarProps) {
  return (
    <div className="filter-bar">
      {onSearchChange && (
        <div style={{ position: "relative" }}>
          <span style={{ position: "absolute", left: 10, top: 9, color: "var(--color-text-muted)" }}>
            <Icon name="search" size={14} />
          </span>
          <input
            className="input"
            style={{ paddingLeft: 30, minWidth: 220 }}
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
      )}
      {children}
      <div className="flex-1" />
      {actions}
    </div>
  );
}
