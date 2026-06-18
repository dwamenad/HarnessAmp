export const ADAPTER_FAILURE_CLASSES = Object.freeze({
  EXECUTION_TARGET_MISSING: 'execution_target_missing',
  EXECUTION_TARGET_INVALID: 'execution_target_invalid',
  EXECUTION_TARGET_UNSUPPORTED: 'execution_target_unsupported',
  REGISTERED_RUNNER_MISSING: 'registered_runner_missing',
  VERCEL_AI_SDK_ROUTE_MISSING: 'vercel_ai_sdk_route_missing',
  HOSTED_PROVIDER_DISABLED: 'hosted_provider_disabled',
  HOSTED_PROVIDER_SECRET_MISSING: 'hosted_provider_secret_missing',
  HOSTED_PROVIDER_SECRET_DISABLED: 'hosted_provider_secret_disabled',
  HOSTED_PROVIDER_SECRET_PROVIDER_MISMATCH: 'hosted_provider_secret_provider_mismatch',
  HOSTED_PROVIDER_AUTH_ERROR: 'hosted_provider_auth_error',
  HOSTED_PROVIDER_RATE_LIMITED: 'hosted_provider_rate_limited',
  HOSTED_PROVIDER_TIMEOUT: 'hosted_provider_timeout',
  HOSTED_PROVIDER_INVALID_RESPONSE: 'hosted_provider_invalid_response',
  HOSTED_PROVIDER_MODEL_MISSING: 'hosted_provider_model_missing',
  HOSTED_PROVIDER_UNKNOWN: 'hosted_provider_unknown_error',
  LOCAL_TUNNEL_UNREACHABLE: 'local_tunnel_unreachable',
  LOCAL_TUNNEL_TIMEOUT: 'local_tunnel_timeout',
  LOCAL_TUNNEL_TLS_ERROR: 'local_tunnel_tls_error',
  LOCAL_TUNNEL_DNS_ERROR: 'local_tunnel_dns_error',
  LOCAL_TUNNEL_REDIRECT_BLOCKED: 'local_tunnel_redirect_blocked',
  LOCAL_TUNNEL_PRIVATE_IP_BLOCKED: 'local_tunnel_private_ip_blocked',
  LOCAL_TUNNEL_CONTRACT_MISMATCH: 'local_tunnel_contract_mismatch',
  LOCAL_TUNNEL_INVALID_JSON: 'local_tunnel_invalid_json',
  LOCAL_TUNNEL_HTTP_ERROR: 'local_tunnel_http_error',
  LOCAL_TUNNEL_CLOSED_OR_EXPIRED: 'local_tunnel_closed_or_expired',
  TARGET_MISSING: 'adapter_target_missing',
  TIMEOUT: 'adapter_timeout',
  HTTP_ERROR: 'adapter_http_error',
  INVALID_RESPONSE: 'adapter_invalid_response',
  SCHEMA_MISMATCH: 'adapter_schema_mismatch',
  EXECUTION_ERROR: 'adapter_execution_error',
  AUTH_ERROR: 'adapter_auth_error',
  RATE_LIMITED: 'adapter_rate_limited',
  WORKER_CANCELED: 'adapter_worker_canceled',
  UNKNOWN: 'adapter_unknown_error',
});

const NON_RETRYABLE_FAILURES = new Set([
  ADAPTER_FAILURE_CLASSES.EXECUTION_TARGET_MISSING,
  ADAPTER_FAILURE_CLASSES.EXECUTION_TARGET_INVALID,
  ADAPTER_FAILURE_CLASSES.EXECUTION_TARGET_UNSUPPORTED,
  ADAPTER_FAILURE_CLASSES.REGISTERED_RUNNER_MISSING,
  ADAPTER_FAILURE_CLASSES.VERCEL_AI_SDK_ROUTE_MISSING,
  ADAPTER_FAILURE_CLASSES.HOSTED_PROVIDER_DISABLED,
  ADAPTER_FAILURE_CLASSES.HOSTED_PROVIDER_SECRET_MISSING,
  ADAPTER_FAILURE_CLASSES.HOSTED_PROVIDER_SECRET_DISABLED,
  ADAPTER_FAILURE_CLASSES.HOSTED_PROVIDER_SECRET_PROVIDER_MISMATCH,
  ADAPTER_FAILURE_CLASSES.HOSTED_PROVIDER_AUTH_ERROR,
  ADAPTER_FAILURE_CLASSES.HOSTED_PROVIDER_MODEL_MISSING,
  ADAPTER_FAILURE_CLASSES.LOCAL_TUNNEL_REDIRECT_BLOCKED,
  ADAPTER_FAILURE_CLASSES.LOCAL_TUNNEL_PRIVATE_IP_BLOCKED,
  ADAPTER_FAILURE_CLASSES.LOCAL_TUNNEL_CONTRACT_MISMATCH,
  ADAPTER_FAILURE_CLASSES.LOCAL_TUNNEL_INVALID_JSON,
  ADAPTER_FAILURE_CLASSES.TARGET_MISSING,
  ADAPTER_FAILURE_CLASSES.INVALID_RESPONSE,
  ADAPTER_FAILURE_CLASSES.SCHEMA_MISMATCH,
  ADAPTER_FAILURE_CLASSES.WORKER_CANCELED,
]);

const SECRET_PATTERN = /authorization|cookie|token|secret|key|credential|password/i;

export class AdapterExecutionError extends Error {
  constructor(message, diagnostics = {}) {
    super(message);
    this.name = 'AdapterExecutionError';
    this.diagnostics = normalizeAdapterDiagnostics(diagnostics, { rawErrorMessage: message });
    this.failureClass = this.diagnostics.failureClass;
    this.retryable = this.diagnostics.retryable;
  }
}

export function adapterFailureRetryable(failureClass) {
  return Boolean(failureClass) && !NON_RETRYABLE_FAILURES.has(failureClass);
}

export function classifyAdapterError(error, context = {}) {
  const status = Number(context.httpStatus ?? error?.status ?? error?.statusCode);
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (context.canceled || /cancel/i.test(message)) return ADAPTER_FAILURE_CLASSES.WORKER_CANCELED;
  if (context.timeout || error?.name === 'AbortError' || /timed out|timeout/i.test(message)) return ADAPTER_FAILURE_CLASSES.TIMEOUT;
  if (/execution target.*missing|required/i.test(message)) return ADAPTER_FAILURE_CLASSES.EXECUTION_TARGET_MISSING;
  if (/execution target.*invalid/i.test(message)) return ADAPTER_FAILURE_CLASSES.EXECUTION_TARGET_INVALID;
  if (/execution target.*unsupported|unsupported execution target/i.test(message)) return ADAPTER_FAILURE_CLASSES.EXECUTION_TARGET_UNSUPPORTED;
  if (/registered runner.*missing|runner not found/i.test(message)) return ADAPTER_FAILURE_CLASSES.REGISTERED_RUNNER_MISSING;
  if (/vercel ai sdk.*route.*missing|route target.*required/i.test(message)) return ADAPTER_FAILURE_CLASSES.VERCEL_AI_SDK_ROUTE_MISSING;
  if (/hosted provider.*disabled/i.test(message)) return ADAPTER_FAILURE_CLASSES.HOSTED_PROVIDER_DISABLED;
  if (/hosted provider.*secret.*missing|secret.*not found/i.test(message)) return ADAPTER_FAILURE_CLASSES.HOSTED_PROVIDER_SECRET_MISSING;
  if (/hosted provider.*secret.*disabled|secret.*disabled|secret.*deleted/i.test(message)) return ADAPTER_FAILURE_CLASSES.HOSTED_PROVIDER_SECRET_DISABLED;
  if (/provider.*mismatch/i.test(message)) return ADAPTER_FAILURE_CLASSES.HOSTED_PROVIDER_SECRET_PROVIDER_MISMATCH;
  if (/model.*missing|requires model/i.test(message)) return ADAPTER_FAILURE_CLASSES.HOSTED_PROVIDER_MODEL_MISSING;
  if (/local tunnel.*private|private.*blocked|metadata endpoint/i.test(message)) return ADAPTER_FAILURE_CLASSES.LOCAL_TUNNEL_PRIVATE_IP_BLOCKED;
  if (/local tunnel.*redirect/i.test(message)) return ADAPTER_FAILURE_CLASSES.LOCAL_TUNNEL_REDIRECT_BLOCKED;
  if (/local tunnel.*dns|getaddrinfo|enotfound|eai_again/i.test(message)) return ADAPTER_FAILURE_CLASSES.LOCAL_TUNNEL_DNS_ERROR;
  if (/local tunnel.*tls|certificate|self-signed|ssl|tls/i.test(message)) return ADAPTER_FAILURE_CLASSES.LOCAL_TUNNEL_TLS_ERROR;
  if (/local tunnel.*timed out|local tunnel.*timeout/i.test(message)) return ADAPTER_FAILURE_CLASSES.LOCAL_TUNNEL_TIMEOUT;
  if (/local tunnel.*contract|x-harnessamp-run-token/i.test(message)) return ADAPTER_FAILURE_CLASSES.LOCAL_TUNNEL_CONTRACT_MISMATCH;
  if (/local tunnel.*json|local tunnel.*parse/i.test(message)) return ADAPTER_FAILURE_CLASSES.LOCAL_TUNNEL_INVALID_JSON;
  if (/local tunnel.*closed|local tunnel.*expired/i.test(message)) return ADAPTER_FAILURE_CLASSES.LOCAL_TUNNEL_CLOSED_OR_EXPIRED;
  if (/local tunnel.*http|local tunnel.*returned/i.test(message)) return ADAPTER_FAILURE_CLASSES.LOCAL_TUNNEL_HTTP_ERROR;
  if (status === 401 || status === 403) return ADAPTER_FAILURE_CLASSES.AUTH_ERROR;
  if (status === 429) return ADAPTER_FAILURE_CLASSES.RATE_LIMITED;
  if (status >= 400) return ADAPTER_FAILURE_CLASSES.HTTP_ERROR;
  if (/does not export|cannot find module|no such file|requires target|target .*missing/i.test(message)) {
    return ADAPTER_FAILURE_CLASSES.TARGET_MISSING;
  }
  if (/schema/i.test(message)) return ADAPTER_FAILURE_CLASSES.SCHEMA_MISMATCH;
  if (/invalid response|must be|json|parse/i.test(message)) return ADAPTER_FAILURE_CLASSES.INVALID_RESPONSE;
  return message ? ADAPTER_FAILURE_CLASSES.EXECUTION_ERROR : ADAPTER_FAILURE_CLASSES.UNKNOWN;
}

export function normalizeAdapterDiagnostics(input = {}, defaults = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const requestTimestamp = stringOr(source.requestTimestamp ?? defaults.requestTimestamp, null);
  const responseTimestamp = stringOr(source.responseTimestamp ?? defaults.responseTimestamp, null);
  const failureClass = stringOr(source.failureClass ?? defaults.failureClass, null);
  return {
    adapterType: stringOr(source.adapterType ?? defaults.adapterType, ''),
    target: redactText(source.target ?? defaults.target ?? ''),
    runnerId: redactText(source.runnerId ?? defaults.runnerId ?? ''),
    requestTimestamp,
    responseTimestamp,
    latencyMs: nullableNumber(source.latencyMs ?? defaults.latencyMs),
    httpStatus: nullableNumber(source.httpStatus ?? defaults.httpStatus),
    timedOut: Boolean(source.timedOut ?? defaults.timedOut ?? false),
    retryAttempt: nullableNumber(source.retryAttempt ?? defaults.retryAttempt),
    workerId: stringOr(source.workerId ?? defaults.workerId, ''),
    jobId: stringOr(source.jobId ?? defaults.jobId, ''),
    benchmarkId: stringOr(source.benchmarkId ?? defaults.benchmarkId, ''),
    benchmarkVersion: source.benchmarkVersion ?? defaults.benchmarkVersion ?? null,
    scenarioId: stringOr(source.scenarioId ?? defaults.scenarioId, ''),
    mutationId: stringOr(source.mutationId ?? defaults.mutationId, ''),
    mutationFamily: stringOr(source.mutationFamily ?? defaults.mutationFamily, ''),
    failureClass,
    rawErrorMessage: truncate(redactText(source.rawErrorMessage ?? defaults.rawErrorMessage ?? ''), 600),
    phase: stringOr(source.phase ?? defaults.phase, ''),
    retryable: source.retryable ?? defaults.retryable ?? adapterFailureRetryable(failureClass),
    modelMetadata: sanitizeDebugPayload(source.modelMetadata ?? defaults.modelMetadata ?? {}),
    toolTraceCount: nullableNumber(source.toolTraceCount ?? defaults.toolTraceCount),
    usage: sanitizeDebugPayload(source.usage ?? defaults.usage ?? {}),
  };
}

export function sanitizeDebugPayload(value) {
  if (value == null || typeof value !== 'object') return typeof value === 'string' ? redactText(value) : value;
  if (Array.isArray(value)) return value.map((item) => sanitizeDebugPayload(item));
  const clean = {};
  for (const [key, item] of Object.entries(value)) {
    clean[key] = SECRET_PATTERN.test(key) ? '[redacted]' : sanitizeDebugPayload(item);
  }
  return clean;
}

function redactText(value) {
  const text = String(value ?? '');
  return text
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, 'sk-[redacted]')
    .replace(/sk-ant-[A-Za-z0-9_-]{8,}/g, 'sk-ant-[redacted]')
    .replace(/x-harnessamp-run-token\s*[:=]\s*[^&\s]+/gi, 'x-harnessamp-run-token=[redacted]')
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [redacted]')
    .replace(/(authorization|token|secret|key|password|credential|api[_-]?key)=([^&\s]+)/gi, '$1=[redacted]');
}

function stringOr(value, fallback) {
  return typeof value === 'string' && value.length ? value : fallback;
}

function nullableNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function truncate(value, maxLength) {
  const text = String(value ?? '');
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}
