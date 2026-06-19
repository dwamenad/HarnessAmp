export function renderRoute(route, context) {
  if (route.pathname === '/dashboard') return context.renderSaasDashboard();
  if (route.pathname === '/harnesses') return context.renderSaasHarnesses();
  if (route.pathname === '/harnesses/new') return context.renderSaasNewHarness();
  if (route.routeType === 'pack-detail') return context.renderSaasPackDetail(route.packSlug);
  if (route.pathname === '/packs') return context.renderSaasPacks();
  if (route.pathname === '/contracts') return context.renderSaasContracts();
  if (route.pathname === '/compare') return context.renderSaasCompare();
  if (route.pathname === '/ci') return context.renderSaasCi();
  return context.renderSaasDashboard();
}
