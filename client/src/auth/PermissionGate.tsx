import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { ActionName, ModuleName } from "../lib/permissions";

interface PermissionGateProps {
  module: ModuleName;
  action?: ActionName;
  children: ReactNode;
  fallback?: ReactNode;
  redirect?: boolean;
}

export function PermissionGate({ module, action = "view", children, fallback = null, redirect = false }: PermissionGateProps) {
  const { hasPermission } = useAuth();
  if (!hasPermission(module, action)) {
    if (redirect) return <Navigate to="/" replace />;
    return <>{fallback}</>;
  }
  return <>{children}</>;
}

export function usePermission(module: ModuleName, action: ActionName = "view") {
  const { hasPermission } = useAuth();
  return hasPermission(module, action);
}
