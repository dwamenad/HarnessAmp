export function collectV2RegressionCorpus(runOrSuiteReport) {
  const reports = Array.isArray(runOrSuiteReport?.reports)
    ? runOrSuiteReport.reports
    : [runOrSuiteReport].filter(Boolean);
  const entries = reports.flatMap(regressionEntriesForReport);

  return {
    version: '2.0.0-alpha',
    source: {
      runId: runOrSuiteReport?.runId ?? null,
      suiteId: runOrSuiteReport?.suite?.id ?? null,
      pack: runOrSuiteReport?.suite?.pack ?? runOrSuiteReport?.pack?.id ?? null,
    },
    summary: {
      entryCount: entries.length,
      criticalCount: entries.filter((entry) => entry.severity === 'critical').length,
      generatedCount: entries.filter((entry) => entry.provenance?.generated).length,
    },
    entries,
  };
}

function regressionEntriesForReport(report) {
  const failedResults = (report.contractResults ?? []).filter((result) => !result.passed);
  return failedResults.map((result) => {
    const trace = (report.mutatedTraces ?? []).find((item) => item.mutationId === result.mutationId)
      ?? report.mutatedTraces?.[0]
      ?? null;
    const evaluation = (report.domainEvaluations ?? []).find((item) => item.mutationId === result.mutationId)
      ?? report.domainEvaluations?.[0]
      ?? null;
    return {
      id: [
        report.scenario?.id ?? 'scenario',
        result.contractId,
        result.mutationId ?? 'mutation',
        result.failureType ?? 'failure',
      ].join('__'),
      scenarioId: report.scenario?.id ?? null,
      scenarioName: report.scenario?.name ?? null,
      pack: report.pack?.id ?? null,
      mutationId: result.mutationId ?? null,
      contractId: result.contractId,
      severity: result.severity,
      failureType: result.failureType,
      expectedBehavior: result.explanation,
      observedBehavior: trace?.finalAnswer ?? null,
      evidence: result.evidence ?? [],
      metrics: evaluation?.metrics ?? {},
      failureSignals: evaluation?.failureSignals ?? {},
      provenance: evaluation?.provenance ?? {
        generated: false,
        sourcePath: report.scenario?.sourcePath ?? null,
      },
      promotion: {
        status: 'candidate',
        recommendedSuite: `${report.pack?.id ?? 'v2'}-regression`,
        releaseBlocking: result.severity === 'critical' || result.severity === 'high',
      },
    };
  });
}
