export function renderRoute(route, context) {
  if (route.pathname === '/runs/new') return context.renderSaasNewRun();
  if (route.routeType === 'run-summary') return context.renderSaasRunSummary(route.runId);
  if (route.routeType === 'run-progress') return context.renderSaasRunProgress(route.runId);
  return context.renderSaasNewRun();
}
