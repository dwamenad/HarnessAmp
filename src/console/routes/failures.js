export function renderRoute(route, context) {
  if (route.routeType === 'failure') return context.renderSaasFailureDetail(route.failureId);
  return context.renderSaasFailuresList();
}
