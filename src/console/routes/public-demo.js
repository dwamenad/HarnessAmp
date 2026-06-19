export function renderRoute(route, context) {
  if (route.kind === 'docs') return context.renderDocsExperience(route);
  if (route.kind === 'app' || route.kind === 'report' || route.kind === 'project-report') {
    return context.renderAppSurface(context.appSurfaceState());
  }
  return context.renderHomeSurface(context.activeReportUrl());
}
