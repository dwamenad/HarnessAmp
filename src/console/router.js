export const saasRouteLabels = {
  '/dashboard': 'Overview',
  '/harnesses': 'Harnesses',
  '/harnesses/new': 'New Harness',
  '/changes': 'Change Impact',
  '/packs': 'Test Profiles',
  '/contracts': 'Tool Contracts',
  '/targets': 'Execution Targets',
  '/runs/new': 'Test Runs',
  '/runs/run-healthguard-2419': 'Run Progress',
  '/runs/run-healthguard-2419/summary': 'Certification Summary',
  '/failures': 'Failures',
  '/failures/fail-redflag-017': 'Failure Evidence',
  '/compare': 'Compare',
  '/reports': 'Evidence',
  '/ci': 'Automation',
  '/org': 'Organization',
  '/org/members': 'Members',
  '/org/usage': 'Usage',
  '/org/billing': 'Billing',
  '/project/settings': 'Project Settings',
  '/usage': 'Usage & Billing',
  '/team': 'Members',
};

export const saasNav = [
  ['/dashboard', 'Overview', 'OV'],
  ['/changes', 'Change Impact', 'CI'],
  ['/harnesses', 'Agents', 'AG'],
  ['/contracts', 'Tool Contracts', 'TC'],
  ['/runs/new', 'Test Runs', 'TR'],
  ['/failures', 'Failures', 'FE'],
  ['/reports', 'Evidence', 'EV'],
  ['/ci', 'Automation', 'AU'],
];

export const organizationNav = [
  ['/org/members', 'Members', 'MB'],
  ['/org/usage', 'Usage', 'US'],
  ['/org/billing', 'Billing', 'BL'],
];

export function resolveRoute(pathname = '/', { packLabelForSlug = null } = {}) {
  const normalizedPath = pathname.length > 1 ? pathname.replace(/\/+$/u, '') : pathname;
  const packMatch = normalizedPath.match(/^\/packs\/([^/]+)$/u);
  if (packMatch) {
    const packSlug = decodeURIComponent(packMatch[1]);
    return {
      kind: 'console',
      routeType: 'pack-detail',
      packSlug,
      pathname: normalizedPath,
      label: packLabelForSlug?.(packSlug) ?? 'Release Gate Detail',
    };
  }

  const runSummaryMatch = normalizedPath.match(/^\/runs\/([^/]+)\/summary$/u);
  if (runSummaryMatch) {
    return {
      kind: 'console',
      routeType: 'run-summary',
      runId: decodeURIComponent(runSummaryMatch[1]),
      pathname: normalizedPath,
      label: 'Certification Summary',
    };
  }

  const runProgressMatch = normalizedPath.match(/^\/runs\/([^/]+)$/u);
  if (runProgressMatch && normalizedPath !== '/runs/new') {
    return {
      kind: 'console',
      routeType: 'run-progress',
      runId: decodeURIComponent(runProgressMatch[1]),
      pathname: normalizedPath,
      label: 'Run Progress',
    };
  }

  const failureMatch = normalizedPath.match(/^\/failures\/([^/]+)$/u);
  if (failureMatch) {
    return {
      kind: 'console',
      routeType: 'failure',
      failureId: decodeURIComponent(failureMatch[1]),
      pathname: normalizedPath,
      label: 'Failure Evidence',
    };
  }

  if (Object.prototype.hasOwnProperty.call(saasRouteLabels, normalizedPath)) {
    return {
      kind: 'console',
      routeType: 'static',
      pathname: normalizedPath,
      label: saasRouteLabels[normalizedPath],
    };
  }

  const projectReportMatch = pathname.match(/^\/projects\/([^/]+)\/reports\/([^/]+)$/u);
  if (projectReportMatch) {
    return {
      kind: 'project-report',
      projectId: decodeURIComponent(projectReportMatch[1]),
      reportId: decodeURIComponent(projectReportMatch[2]),
    };
  }

  const reportMatch = pathname.match(/^\/report\/([^/]+)$/u);
  if (reportMatch) {
    return {
      kind: 'report',
      reportId: decodeURIComponent(reportMatch[1]),
    };
  }

  if (normalizedPath === '/docs') {
    return {
      kind: 'docs',
      slug: '',
    };
  }

  const docsMatch = normalizedPath.match(/^\/docs\/(.+)$/u);
  if (docsMatch) {
    return {
      kind: 'docs',
      slug: decodeURIComponent(docsMatch[1]),
    };
  }

  if (normalizedPath === '/app') {
    return { kind: 'app' };
  }

  return { kind: 'home' };
}

export function isSaasNavActive(routeOrPathname, href) {
  const pathname = typeof routeOrPathname === 'string'
    ? routeOrPathname
    : routeOrPathname?.pathname ?? '';
  return pathname === href
    || (href === '/harnesses' && pathname.startsWith('/harnesses/'))
    || (href === '/failures' && pathname.startsWith('/failures/'));
}

export function metricHref(label) {
  if (/critical|failure/iu.test(label)) return '/failures';
  if (/robustness|baseline/iu.test(label)) return '/compare';
  if (/usage/iu.test(label)) return '/org/usage';
  return null;
}
