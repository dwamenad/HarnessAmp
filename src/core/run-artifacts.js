const DEFAULT_MAX_TEXT_LENGTH = 12000;

export function collectRunArtifacts(runs, options = {}) {
  return runs.flatMap((run) => normalizeRunArtifacts(run, options));
}

export function normalizeRunArtifacts(run, options = {}) {
  if (!run || typeof run !== 'object') return [];
  const maxTextLength = Number(options.maxTextLength ?? DEFAULT_MAX_TEXT_LENGTH);
  const artifacts = [];
  const base = {
    runId: stringOr(run.runId, 'unknown-run'),
    taskId: stringOr(run.taskId, ''),
    mutationId: run.mutationId ?? null,
    createdAt: run.timestamp ?? new Date().toISOString(),
  };

  addArtifactList(artifacts, run.artifacts, base, maxTextLength);
  addArtifactList(artifacts, run.runArtifacts, base, maxTextLength);

  const trace = isObject(run.trace) ? run.trace : isObject(run.metadata?.trace) ? run.metadata.trace : {};
  addCommandArtifacts(artifacts, trace.commands ?? run.metadata?.commands, base, maxTextLength);
  addFileDiffArtifacts(artifacts, trace.fileDiffs ?? run.metadata?.fileDiffs, base, maxTextLength);
  addSandboxArtifacts(artifacts, trace.sandboxEvents ?? run.metadata?.sandboxEvents, base, maxTextLength);
  addApprovalArtifacts(artifacts, trace.approvals ?? run.metadata?.approvals, base, maxTextLength);
  addLogArtifact(artifacts, 'terminal_output', 'Terminal output', trace.terminalOutput ?? run.metadata?.terminalOutput, base, maxTextLength);
  addLogArtifact(artifacts, 'stdout', 'Stdout', trace.stdout ?? run.metadata?.stdout, base, maxTextLength);
  addLogArtifact(artifacts, 'stderr', 'Stderr', trace.stderr ?? run.metadata?.stderr, base, maxTextLength);

  return artifacts.map((artifact, index) => ({
    id: artifact.id ?? buildArtifactId(base.runId, artifact.type, index),
    ...base,
    ...artifact,
    redacted: artifact.redacted ?? true,
  }));
}

function addArtifactList(artifacts, list, base, maxTextLength) {
  if (!Array.isArray(list)) return;
  list.filter(isObject).forEach((item, index) => {
    artifacts.push({
      type: stringOr(item.type, 'runner_artifact'),
      title: stringOr(item.title, `Runner artifact ${index + 1}`),
      content: truncateText(item.content ?? item.text ?? item.value ?? '', maxTextLength),
      metadata: isObject(item.metadata) ? item.metadata : {},
      redacted: item.redacted ?? true,
      id: item.id ?? null,
      uri: item.uri ?? null,
      contentType: item.contentType ?? null,
      runId: item.runId ?? base.runId,
      taskId: item.taskId ?? base.taskId,
      mutationId: item.mutationId ?? base.mutationId,
    });
  });
}

function addCommandArtifacts(artifacts, commands, base, maxTextLength) {
  if (!Array.isArray(commands)) return;
  commands.filter(isObject).forEach((command, index) => {
    artifacts.push({
      type: 'terminal_command',
      title: stringOr(command.title, `Command ${index + 1}`),
      content: truncateText(command.output ?? command.stdout ?? command.stderr ?? '', maxTextLength),
      metadata: {
        command: command.command ?? command.cmd ?? '',
        cwd: command.cwd ?? null,
        exitCode: command.exitCode ?? command.code ?? null,
        durationMs: command.durationMs ?? null,
      },
      redacted: command.redacted ?? true,
      runId: command.runId ?? base.runId,
      taskId: command.taskId ?? base.taskId,
      mutationId: command.mutationId ?? base.mutationId,
    });
  });
}

function addFileDiffArtifacts(artifacts, fileDiffs, base, maxTextLength) {
  if (!Array.isArray(fileDiffs)) return;
  fileDiffs.filter(isObject).forEach((diff, index) => {
    artifacts.push({
      type: 'file_diff',
      title: stringOr(diff.title, diff.path ? `Diff ${diff.path}` : `File diff ${index + 1}`),
      content: truncateText(diff.diff ?? diff.patch ?? '', maxTextLength),
      metadata: {
        path: diff.path ?? null,
        language: diff.language ?? null,
        changeType: diff.changeType ?? null,
      },
      redacted: diff.redacted ?? true,
      runId: diff.runId ?? base.runId,
      taskId: diff.taskId ?? base.taskId,
      mutationId: diff.mutationId ?? base.mutationId,
    });
  });
}

function addSandboxArtifacts(artifacts, events, base, maxTextLength) {
  if (!Array.isArray(events)) return;
  events.filter(isObject).forEach((event, index) => {
    artifacts.push({
      type: 'sandbox_event',
      title: stringOr(event.title, `Sandbox event ${index + 1}`),
      content: truncateText(event.message ?? event.content ?? '', maxTextLength),
      metadata: {
        action: event.action ?? null,
        path: event.path ?? null,
        allowed: event.allowed ?? null,
        policy: event.policy ?? null,
      },
      redacted: event.redacted ?? true,
      runId: event.runId ?? base.runId,
      taskId: event.taskId ?? base.taskId,
      mutationId: event.mutationId ?? base.mutationId,
    });
  });
}

function addApprovalArtifacts(artifacts, approvals, base, maxTextLength) {
  if (!Array.isArray(approvals)) return;
  approvals.filter(isObject).forEach((approval, index) => {
    artifacts.push({
      type: 'approval_event',
      title: stringOr(approval.title, `Approval event ${index + 1}`),
      content: truncateText(approval.reason ?? approval.content ?? '', maxTextLength),
      metadata: {
        action: approval.action ?? null,
        approved: approval.approved ?? null,
        source: approval.source ?? null,
      },
      redacted: approval.redacted ?? true,
      runId: approval.runId ?? base.runId,
      taskId: approval.taskId ?? base.taskId,
      mutationId: approval.mutationId ?? base.mutationId,
    });
  });
}

function addLogArtifact(artifacts, type, title, content, base, maxTextLength) {
  if (typeof content !== 'string' || !content) return;
  artifacts.push({
    type,
    title,
    content: truncateText(content, maxTextLength),
    metadata: {},
    redacted: true,
    runId: base.runId,
    taskId: base.taskId,
    mutationId: base.mutationId,
  });
}

function buildArtifactId(runId, type, index) {
  return `${slugify(runId)}__${slugify(type)}__${index + 1}`;
}

function truncateText(value, maxTextLength) {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  if (text.length <= maxTextLength) return text;
  return `${text.slice(0, maxTextLength)}\n[truncated ${text.length - maxTextLength} chars]`;
}

function stringOr(value, fallback) {
  return typeof value === 'string' && value.length ? value : fallback;
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-') || 'artifact';
}
