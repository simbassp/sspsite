"use client";

import { ADMIN_PERMISSION_OPTIONS, type AdminPermissionOptionKey } from "@/lib/admin-permission-ui";
import type { UserPermissions } from "@/lib/types";

function AdminPermissionIcon({ permissionKey }: { permissionKey: AdminPermissionOptionKey }) {
  switch (permissionKey) {
    case "news":
      return (
        <svg viewBox="0 0 24 24" className="admin-users-page__perm-icon-svg" aria-hidden>
          <rect x="4" y="4" width="13" height="16" rx="2" />
          <path d="M17 7h3v11a2 2 0 0 1-2 2" />
          <line x1="7" y1="9" x2="14" y2="9" />
          <line x1="7" y1="13" x2="14" y2="13" />
        </svg>
      );
    case "tests":
      return (
        <svg viewBox="0 0 24 24" className="admin-users-page__perm-icon-svg" aria-hidden>
          <rect x="5" y="4" width="14" height="17" rx="2" />
          <rect x="9" y="2.5" width="6" height="3.5" rx="1.2" />
          <path d="M8 12.5l2.2 2.2L16 10" />
        </svg>
      );
    case "results":
      return (
        <svg viewBox="0 0 24 24" className="admin-users-page__perm-icon-svg" aria-hidden>
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16.5 16.5 4 4" />
        </svg>
      );
    case "resetResults":
      return (
        <svg viewBox="0 0 24 24" className="admin-users-page__perm-icon-svg" aria-hidden>
          <path d="M20 12a8 8 0 1 1-2.3-5.7" />
          <path d="M20 4v5h-5" />
        </svg>
      );
    case "uav":
      return (
        <svg viewBox="0 0 24 24" className="admin-users-page__perm-icon-svg" aria-hidden>
          <rect x="4" y="8" width="16" height="11" rx="2" />
          <path d="M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          <line x1="4" y1="13" x2="20" y2="13" />
        </svg>
      );
    case "counteraction":
      return (
        <svg viewBox="0 0 24 24" className="admin-users-page__perm-icon-svg" aria-hidden>
          <path d="M12 3l8 3v6c0 5-3.5 8.5-8 9.8C7.5 20.5 4 17 4 12V6l8-3z" />
        </svg>
      );
    case "userList":
      return (
        <svg viewBox="0 0 24 24" className="admin-users-page__perm-icon-svg" aria-hidden>
          <circle cx="9" cy="8" r="3.5" />
          <path d="M3.5 19c1.6-3 3.8-4.5 5.5-4.5s3.9 1.5 5.5 4.5" />
          <circle cx="17" cy="9" r="2.8" />
          <path d="M14.5 19c1-2 2.4-3 3.5-3s2.5 1 3.5 3" />
        </svg>
      );
    case "users":
      return (
        <svg viewBox="0 0 24 24" className="admin-users-page__perm-icon-svg" aria-hidden>
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
      );
    case "personnelModeration":
      return (
        <svg viewBox="0 0 24 24" className="admin-users-page__perm-icon-svg" aria-hidden>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      );
    default:
      return null;
  }
}

type AdminPermissionPickerProps = {
  permissions: UserPermissions;
  disabled?: boolean;
  onToggle: (key: keyof UserPermissions, checked: boolean) => void;
};

export function AdminPermissionPicker({ permissions, disabled = false, onToggle }: AdminPermissionPickerProps) {
  return (
    <div className="admin-users-page__perm-list">
      {ADMIN_PERMISSION_OPTIONS.map((item) => (
        <label key={item.key} className="admin-users-page__perm-row">
          <input
            className="admin-users-perm-checkbox"
            type="checkbox"
            checked={permissions[item.key]}
            disabled={disabled}
            onChange={(event) => onToggle(item.key, event.target.checked)}
          />
          <span className={`admin-users-page__perm-icon is-${item.tone}`}>
            <AdminPermissionIcon permissionKey={item.key} />
          </span>
          <span className="admin-users-page__perm-copy">
            <strong>{item.label}</strong>
            <small>{item.description}</small>
          </span>
        </label>
      ))}
    </div>
  );
}
