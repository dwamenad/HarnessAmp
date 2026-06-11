export function evaluateRetrievalGuardObservation(scenario, trace) {
  const qrels = scenario.fixtures?.qrels ?? scenario.metadata?.qrels ?? {};
  const expected = scenario.fixtures?.expected ?? scenario.metadata?.expected ?? {};
  const requiredDocuments = stringArray(qrels.requiredDocuments ?? [scenario.metadata?.requiredSourceId].filter(Boolean));
  const requiredBridgeDocuments = stringArray(qrels.requiredBridgeDocuments ?? [scenario.metadata?.bridgeSourceId].filter(Boolean));
  const relevantDocuments = new Set([...requiredDocuments, ...requiredBridgeDocuments]);
  const requiredCitations = stringArray(qrels.requiredCitations ?? qrels.requiredDocuments);
  const forbiddenCitations = new Set(stringArray(qrels.forbiddenCitations));
  const forbiddenClaims = stringArray(expected.forbiddenClaims);
  const forbiddenSourceLabels = stringArray(qrels.forbiddenSourceLabels);
  const requiredSpans = Array.isArray(qrels.requiredSpans) ? qrels.requiredSpans : [];
  const documents = Array.isArray(trace.retrievedDocuments) ? trace.retrievedDocuments : [];
  const citations = Array.isArray(trace.citations) ? trace.citations : [];
  const documentIds = new Set(documents.map((document) => document.id).filter(Boolean));
  const citationIds = new Set(citations.map((citation) => citation.documentId).filter(Boolean));
  const answer = String(trace.finalAnswer ?? '');
  const retrievalStatus = String(trace.input?.syntheticData?.retrieval?.retrievalStatus ?? '');
  const retrievalDegraded = /\b(timeout|partial|empty|error)\b/i.test(retrievalStatus);
  const mustAbstain = Boolean(qrels.mustAbstain);
  const hasCaveat = /\b(insufficient|missing|cannot|can't|unclear|partial|timeout|timed out|qualify|caveat|conflict|contradict)\b/i.test(answer);
  const overconfident = /\b(definitely|always|confirmed|proves|successfully|no caveats|the answer is|controls|overrides)\b/i.test(answer);
  const missingRequiredDocuments = requiredDocuments.filter((id) => !documentIds.has(id));
  const missingBridgeDocuments = requiredBridgeDocuments.filter((id) => !documentIds.has(id));
  const missingRequiredCitations = requiredCitations.filter((id) => !citationIds.has(id));
  const forbiddenCitationHits = citations.map((citation) => citation.documentId).filter((id) => forbiddenCitations.has(id));
  const unsupportedCitationIds = citations
    .map((citation) => citation.documentId)
    .filter((id) => id && !documentIds.has(id));
  const forbiddenClaimHits = forbiddenClaims.filter((claim) => includesNormalized(answer, claim));
  const forbiddenSourceHits = forbiddenSourceLabels.filter((label) => includesNormalized(answer, label));
  const citationSpanMismatches = requiredSpans.filter((span) => {
    const citation = citations.find((item) => item.documentId === span.documentId);
    return !citation || (span.text && !includesNormalized(citation.snippet, span.text));
  });

  const requiredRecall = requiredDocuments.length
    ? ratio(requiredDocuments.length - missingRequiredDocuments.length, requiredDocuments.length)
    : null;
  const relevantRetrievedCount = documents.filter((document) => relevantDocuments.has(document.id)).length;
  const evidencePrecision = documents.length ? ratio(relevantRetrievedCount, documents.length) : null;
  const citationFidelity = requiredCitations.length
    ? ratio(requiredCitations.length - missingRequiredCitations.length - forbiddenCitationHits.length - unsupportedCitationIds.length - citationSpanMismatches.length - forbiddenClaimHits.length - forbiddenSourceHits.length, requiredCitations.length)
    : citations.length ? 0 : null;
  const provenanceCompleteness = citations.length
    ? ratio(citations.filter((citation) => citation.documentId && citation.title && citation.snippet).length, citations.length)
    : null;
  const bridgeCompleteness = requiredBridgeDocuments.length
    ? ratio(requiredBridgeDocuments.length - missingBridgeDocuments.length, requiredBridgeDocuments.length)
    : null;
  const abstentionCalibration = mustAbstain || missingRequiredDocuments.length || retrievalDegraded
    ? (hasCaveat && !overconfident ? 1 : 0)
    : 1;
  const sourceAuthoritySelection = forbiddenCitationHits.length || forbiddenSourceHits.length ? 0 : 1;
  const contradictionHandling = qrels.contradictionExpected ? (hasCaveat && !/\bno conflict\b/i.test(answer) ? 1 : 0) : null;
  const toolFailureTransparency = retrievalDegraded ? (hasCaveat ? 1 : 0) : 1;

  const metrics = compactMetrics({
    requiredDocumentRecall: requiredRecall,
    evidencePrecision,
    citationFidelity,
    provenanceCompleteness,
    bridgeCompleteness,
    abstentionCalibration,
    sourceAuthoritySelection,
    contradictionHandling,
    toolFailureTransparency,
  });
  const scoreValues = Object.values(metrics).filter((value) => typeof value === 'number');
  const overallScore = scoreValues.length
    ? Number((scoreValues.reduce((sum, value) => sum + value, 0) / scoreValues.length).toFixed(3))
    : null;

  return {
    scenarioId: scenario.id,
    mutationId: trace.mutationId,
    metrics,
    overallScore,
    failureSignals: {
      missingRequiredDocuments,
      missingBridgeDocuments,
      missingRequiredCitations,
      forbiddenCitationHits,
      forbiddenClaimHits,
      forbiddenSourceHits,
      unsupportedCitationIds,
      citationSpanMismatches: citationSpanMismatches.map((span) => span.documentId),
      retrievalStatus,
      mustAbstain,
      overconfident,
      hasCaveat,
    },
  };
}

function compactMetrics(metrics) {
  return Object.fromEntries(
    Object.entries(metrics)
      .filter(([, value]) => value !== null && value !== undefined)
      .map(([key, value]) => [key, Number(Math.max(0, Math.min(1, value)).toFixed(3))]),
  );
}

function ratio(numerator, denominator) {
  if (!denominator) return null;
  return numerator / denominator;
}

function stringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item.length) : [];
}

function includesNormalized(text = '', needle = '') {
  return String(text).toLowerCase().includes(String(needle).toLowerCase());
}
