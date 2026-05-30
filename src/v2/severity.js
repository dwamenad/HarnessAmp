export const SEVERITY_RANK = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export function severityRank(severity) {
  return SEVERITY_RANK[severity] ?? 0;
}

export function meetsSeverityThreshold(severity, threshold = 'critical') {
  return severityRank(severity) >= severityRank(threshold);
}
