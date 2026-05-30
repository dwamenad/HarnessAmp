export function diffTraces(baselineTrace, mutatedTrace, mutation) {
  const changes = [];
  const beforeData = baselineTrace.input?.syntheticData ?? {};
  const afterData = mutatedTrace.input?.syntheticData ?? {};

  for (const key of new Set([...Object.keys(beforeData), ...Object.keys(afterData)])) {
    if (JSON.stringify(beforeData[key]) !== JSON.stringify(afterData[key])) {
      changes.push({
        field: key,
        before: beforeData[key],
        after: afterData[key],
      });
    }
  }

  const baselineToolNames = baselineTrace.toolCalls.map((call) => call.name);
  const mutatedToolNames = mutatedTrace.toolCalls.map((call) => call.name);

  return {
    mutationId: mutation.id,
    mutationFamily: mutation.family,
    summary: changes.length
      ? changes.map((change) => `${change.field} changed from ${formatValue(change.before)} to ${formatValue(change.after)}`).join('; ')
      : 'No structured input fields changed.',
    dataChanges: changes,
    baselineBehavior: summarizeTrace(baselineTrace),
    mutatedBehavior: summarizeTrace(mutatedTrace),
    toolCallDelta: {
      baseline: baselineToolNames,
      mutated: mutatedToolNames,
    },
  };
}

function summarizeTrace(trace) {
  return {
    finalAnswer: trace.finalAnswer,
    toolCalls: trace.toolCalls.map((call) => call.name),
  };
}

function formatValue(value) {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  return JSON.stringify(value);
}
