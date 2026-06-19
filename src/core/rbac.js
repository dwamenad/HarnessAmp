export const ORG_ROLES = Object.freeze(['owner', 'admin', 'developer', 'viewer']);

export const ORG_PERMISSIONS = Object.freeze({
  manageBilling: ['owner'],
  manageOrgSettings: ['owner', 'admin'],
  inviteMembers: ['owner', 'admin'],
  removeMembers: ['owner', 'admin'],
  changeMemberRoles: ['owner'],
  deleteOrganization: ['owner'],

  createProject: ['owner', 'admin', 'developer'],
  updateProject: ['owner', 'admin', 'developer'],
  deleteProject: ['owner', 'admin'],

  manageSecrets: ['owner', 'admin'],
  useSecretBackedTargets: ['owner', 'admin', 'developer'],

  createTarget: ['owner', 'admin', 'developer'],
  updateTarget: ['owner', 'admin', 'developer'],
  deleteTarget: ['owner', 'admin'],

  createRun: ['owner', 'admin', 'developer'],
  cancelRun: ['owner', 'admin', 'developer'],
  viewRun: ['owner', 'admin', 'developer', 'viewer'],

  viewReports: ['owner', 'admin', 'developer', 'viewer'],
  exportReports: ['owner', 'admin', 'developer'],

  manageCiGates: ['owner', 'admin', 'developer'],
});

export function normalizeOrgRole(value, fallback = 'viewer') {
  const role = String(value ?? '').toLowerCase();
  return ORG_ROLES.includes(role) ? role : fallback;
}

export function canRole(role, permission) {
  const allowed = ORG_PERMISSIONS[permission] ?? [];
  return allowed.includes(normalizeOrgRole(role));
}

export function rolePermissions(role) {
  return Object.fromEntries(Object.keys(ORG_PERMISSIONS).map((permission) => [
    permission,
    canRole(role, permission),
  ]));
}

export function assertRoleCan(role, permission) {
  if (!canRole(role, permission)) {
    throw new Error(`Organization role ${normalizeOrgRole(role)} does not have permission ${permission}`);
  }
}
