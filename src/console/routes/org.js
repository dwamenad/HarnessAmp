export function renderRoute(route, context) {
  if (route.pathname === '/org/members' || route.pathname === '/team') return context.renderOrgMembers();
  if (route.pathname === '/org/usage') return context.renderOrgUsage();
  if (route.pathname === '/org/billing') return context.renderOrgBilling();
  if (route.pathname === '/project/settings') return context.renderProjectSettings();
  if (route.pathname === '/usage') return context.renderSaasUsage();
  return context.renderOrgOverview();
}
