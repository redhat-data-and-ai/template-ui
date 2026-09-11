const PRIVILEGED_ROLES = new Set(["owners", "admins", "builders"]);

/** Returns true if the current user has a privileged role (owners/admins/builders). */
export function isPrivilegedUser(): boolean {
  const role = window.APP_DATA?.userRole;
  if (role == null) return false;
  return PRIVILEGED_ROLES.has(role);
}
