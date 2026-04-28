export function collectFailureCorpus(analysis, options = {}) {
  const entries = collectFailureEntries(analysis, options);

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    project: analysis.bundle.project,
    source: {
      packProject: analysis.bundle.project,
      packVersion: analysis.bundle.version ?? 1,
      analysisMode: analysis.mode,
    },
    summary: summarizeFailureCorpus(entries),
    entries,
  };
}

export function mergeFailureCorpora(...corpora) {
  const entriesById = new Map();

  corpora
    .filter(Boolean)
    .flatMap((corpus) => Array.isArray(corpus.entries) ? corpus.entries : [])
    .forEach((entry) => {
      if (!entry?.id) return;
      entriesById.set(entry.id, entry);
    });

  const entries = Array.from(entriesById.values()).sort((a, b) => a.id.localeCompare(b.id));

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    project: corpora.find((item) => item?.project)?.project ?? 'HarnessAmp Failure Corpus',
    source: {
      mergedCorpusCount: corpora.filter(Boolean).length,
    },
    summary: summarizeFailureCorpus(entries),
    entries,
  };
}

export function formatFailureCorpusReport(corpus) {
  const lines = [];
  lines.push('# Failure corpus report');
  lines.push('');
  lines.push(`- Project: ${corpus.project}`);
  lines.push(`- Entries: ${corpus.summary.entryCount}`);
  lines.push(`- Hidden holdout failures: ${corpus.summary.hiddenFailureCount}`);
  lines.push(`- Unique surfaces: ${corpus.summary.uniqueSurfaceCount}`);
  lines.push(`- Unique failure types: ${corpus.summary.uniqueFailureTypeCount}`);
  lines.push('');
  lines.push('## Entries');
  lines.push('');

  if (!corpus.entries.length) {
    lines.push('- No failure entries collected.');
    return lines.join('\n');
  }

  corpus.entries.forEach((entry) => {
    lines.push(`- ${entry.id}: ${entry.failureType} on ${entry.surface} (${entry.tier})`);
  });

  return lines.join('\n');
}

function collectFailureEntries(analysis, options) {
  const passThreshold = clampInt(options.passThreshold ?? 70, 0, 100);
  const recommendations = Array.isArray(analysis.recommendations) ? analysis.recommendations : [];

  return analysis.pack.variants.flatMap((variant) => {
    const outcome = analysis.outcomesById[variant.id];
    if (!outcome) return [];

    const failed = outcome.passed === false || (Number.isFinite(outcome.score) && outcome.score < passThreshold);
    if (!failed) return [];

    const failureType = variant.tier === 'holdout' ? 'holdout_regression' : 'visible_regression';
    const expectedBehavior = analysis.bundle.intent?.mission
      ? `Preserve the mission under ${variant.familyLabel} mutation: ${analysis.bundle.intent.mission}`
      : `Preserve the intended behavior under ${variant.familyLabel} mutation.`;

    return [
      {
        id: buildEntryId(analysis.bundle.project, variant.id, failureType),
        capturedAt: new Date().toISOString(),
        project: analysis.bundle.project,
        packRef: {
          project: analysis.bundle.project,
          version: analysis.bundle.version ?? 1,
        },
        variantId: variant.id,
        familyId: variant.familyId,
        familyLabel: variant.familyLabel,
        surface: variant.familyLabel,
        tier: variant.tier,
        title: variant.title,
        failureType,
        observedBehavior: outcome.notes || `Variant dropped to ${outcome.score ?? 0} under ${variant.title}.`,
        expectedBehavior,
        fixCandidates: recommendations.slice(0, 3).map((item) => item.title),
        generalized: null,
        evidence: {
          score: outcome.score,
          latencyMs: outcome.latencyMs,
          notes: outcome.notes,
          estimatedRisk: variant.estimatedRisk,
          changes: variant.changes,
        },
      },
    ];
  });
}

function summarizeFailureCorpus(entries) {
  const surfaces = new Set(entries.map((entry) => entry.surface).filter(Boolean));
  const failureTypes = new Set(entries.map((entry) => entry.failureType).filter(Boolean));

  return {
    entryCount: entries.length,
    hiddenFailureCount: entries.filter((entry) => entry.tier === 'holdout').length,
    uniqueSurfaceCount: surfaces.size,
    uniqueFailureTypeCount: failureTypes.size,
  };
}

function buildEntryId(project, variantId, failureType) {
  return `${slugify(project)}__${slugify(variantId)}__${slugify(failureType)}`;
}

function clampInt(value, min, max) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return min;
  return Math.max(min, Math.min(max, parsed));
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}
