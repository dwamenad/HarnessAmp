import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import net from 'node:net';
import { ADAPTER_FAILURE_CLASSES, AdapterExecutionError, normalizeAdapterDiagnostics } from './contract.js';
import {
  HARNESSAMP_RUN_TOKEN_HEADER,
  buildPreflightRequest,
  buildDoctorScenarioRequest,
  summarizeValidation,
  validateObservationResponse,
  validatePreflightResponse,
} from './harnessamp-contract.js';

export const LOCAL_TUNNEL_HEADER = HARNESSAMP_RUN_TOKEN_HEADER;

const DEFAULT_PREFLIGHT_TIMEOUT_MS = 5000;
const DEFAULT_DISPATCH_TIMEOUT_MS = 30000;
const DEFAULT_MAX_RESPONSE_BYTES = 1024 * 1024;
const MAX_REDIRECTS = 5;

export function createLocalTunnelRunToken() {
  return crypto.randomBytes(24).toString('base64url');
}

export function createLocalTunnelTokenNonce() {
  return crypto.randomBytes(16).toString('base64url');
}

export function localTunnelRunTokenForNonce(nonce) {
  const normalizedNonce = String(nonce ?? '');
  if (!normalizedNonce) return '';
  const secret = process.env.HARNESSAMP_LOCAL_TUNNEL_TOKEN_SECRET
    ?? process.env.HARNESSAMP_SECRET_ENCRYPTION_KEY
    ?? process.env.WORKER_SERVICE_TOKEN
    ?? 'harnessamp-local-tunnel-dev-secret';
  return crypto
    .createHmac('sha256', secret)
    .update(`local_http_tunnel:${normalizedNonce}`)
    .digest('base64url');
}

export async function preflightLocalHttpTunnelTarget(target, options = {}) {
  if (target?.type !== 'local_http_tunnel') return null;
  const startedAtMs = Date.now();
  const timeoutMs = positiveNumber(options.timeoutMs, DEFAULT_PREFLIGHT_TIMEOUT_MS);
  const maxResponseBytes = positiveNumber(options.maxResponseBytes, DEFAULT_MAX_RESPONSE_BYTES);
  const runToken = options.runToken ?? target.runToken ?? '';
  if (!runToken) {
    throw localTunnelError('Local tunnel preflight requires a run token.', {
      target: target.endpointUrl,
      failureClass: ADAPTER_FAILURE_CLASSES.LOCAL_TUNNEL_CONTRACT_MISMATCH,
      phase: 'before_dispatch',
      startedAtMs,
    });
  }

  const result = await requestLocalTunnelJson({
    endpointUrl: target.endpointUrl,
    runToken,
    timeoutMs,
    maxResponseBytes,
    phase: 'preflight',
    body: buildPreflightRequest(),
    resolver: options.resolver,
    fetchImpl: options.fetchImpl,
  });

  const validation = validatePreflightResponse(result.payload);
  if (!validation.valid) {
    throw localTunnelError('Local tunnel preflight failed: endpoint must return { "ok": true }, { "ready": true }, an observation array, or { "observations": [] }.', {
      target: result.url,
      httpStatus: result.status,
      failureClass: ADAPTER_FAILURE_CLASSES.LOCAL_TUNNEL_CONTRACT_MISMATCH,
      rawErrorMessage: `Local tunnel preflight failed: ${summarizeValidation(validation)}`,
      phase: 'preflight',
      startedAtMs,
    });
  }

  return {
    endpointUrl: target.endpointUrl,
    ok: true,
    startedAt: new Date(startedAtMs).toISOString(),
    completedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAtMs,
  };
}

export async function dispatchLocalHttpTunnelJob({
  job,
  executionTarget,
  runToken,
  timeoutMs = 0,
  maxResponseBytes = DEFAULT_MAX_RESPONSE_BYTES,
  resolver,
  fetchImpl,
}) {
  if (!runToken) {
    throw localTunnelError('Local tunnel dispatch requires a run token.', {
      ...jobDiagnostics(job, executionTarget.endpointUrl),
      failureClass: ADAPTER_FAILURE_CLASSES.LOCAL_TUNNEL_CONTRACT_MISMATCH,
      phase: 'before_dispatch',
    });
  }
  const result = await requestLocalTunnelJson({
    endpointUrl: executionTarget.endpointUrl,
    runToken,
    timeoutMs: positiveNumber(timeoutMs, DEFAULT_DISPATCH_TIMEOUT_MS),
    maxResponseBytes: positiveNumber(maxResponseBytes, DEFAULT_MAX_RESPONSE_BYTES),
    phase: 'during_adapter_call',
    body: {
      jobId: job.id,
      profile: job.payload.profileId,
      preset: job.payload.presetId,
      thresholds: job.payload.thresholds,
      pack: job.payload.pack,
    },
    diagnosticsDefaults: jobDiagnostics(job, executionTarget.endpointUrl),
    resolver,
    fetchImpl,
  });

  const observations = Array.isArray(result.payload) ? result.payload : result.payload?.observations;
  const validation = validateObservationResponse(result.payload);
  if (!validation.valid || !Array.isArray(observations)) {
    throw localTunnelError('Local tunnel response must be an observation array or { observations }.', {
      ...jobDiagnostics(job, executionTarget.endpointUrl),
      httpStatus: result.status,
      failureClass: ADAPTER_FAILURE_CLASSES.LOCAL_TUNNEL_CONTRACT_MISMATCH,
      rawErrorMessage: `Local tunnel response failed contract validation: ${summarizeValidation(validation)}`,
      phase: 'during_parsing',
      startedAtMs: result.startedAtMs,
    });
  }
  return observations;
}

export async function runLocalTunnelDoctor({
  url,
  timeoutMs = DEFAULT_PREFLIGHT_TIMEOUT_MS,
  maxResponseBytes = DEFAULT_MAX_RESPONSE_BYTES,
  fetchImpl,
  resolver,
} = {}) {
  const normalizedTimeoutMs = positiveNumber(timeoutMs, DEFAULT_PREFLIGHT_TIMEOUT_MS);
  const normalizedMaxResponseBytes = positiveNumber(maxResponseBytes, DEFAULT_MAX_RESPONSE_BYTES);
  const diagnostics = [];
  const runToken = createLocalTunnelRunToken();
  const target = {
    type: 'local_http_tunnel',
    endpointUrl: url,
  };

  if (!url) {
    return doctorResult(false, [{
      check: 'configuration',
      ok: false,
      failureClass: ADAPTER_FAILURE_CLASSES.EXECUTION_TARGET_MISSING,
      message: 'Pass --url with a public HTTPS adapter endpoint.',
      action: 'Example: npm run harnessamp:doctor -- --url https://example.ngrok.app/api/agent',
    }]);
  }

  try {
    await preflightLocalHttpTunnelTarget(target, {
      runToken,
      timeoutMs: normalizedTimeoutMs,
      maxResponseBytes: normalizedMaxResponseBytes,
      fetchImpl,
      resolver,
    });
    diagnostics.push({
      check: 'preflight',
      ok: true,
      message: 'Preflight returned valid JSON readiness.',
    });
  } catch (error) {
    diagnostics.push(diagnosticFromError('preflight', error, guidanceForFailure(error?.failureClass)));
    return doctorResult(false, diagnostics);
  }

  try {
    const response = await requestLocalTunnelJson({
      endpointUrl: url,
      runToken,
      timeoutMs: normalizedTimeoutMs,
      maxResponseBytes: normalizedMaxResponseBytes,
      phase: 'doctor_dispatch',
      body: buildDoctorScenarioRequest(),
      fetchImpl,
      resolver,
    });
    const validation = validateObservationResponse(response.payload);
    if (!validation.valid) {
      diagnostics.push({
        check: 'dispatch',
        ok: false,
        failureClass: ADAPTER_FAILURE_CLASSES.LOCAL_TUNNEL_CONTRACT_MISMATCH,
        message: summarizeValidation(validation),
        action: 'Return { "observations": [] } or an observations array from scenario dispatch.',
      });
      return doctorResult(false, diagnostics);
    }
    diagnostics.push({
      check: 'dispatch',
      ok: true,
      message: 'Dispatch returned a valid observation response.',
    });
  } catch (error) {
    diagnostics.push(diagnosticFromError('dispatch', error, guidanceForFailure(error?.failureClass)));
    return doctorResult(false, diagnostics);
  }

  try {
    await requestLocalTunnelJson({
      endpointUrl: url,
      runToken: createLocalTunnelRunToken(),
      timeoutMs: normalizedTimeoutMs,
      maxResponseBytes: normalizedMaxResponseBytes,
      phase: 'doctor_token_check',
      body: buildDoctorScenarioRequest(),
      fetchImpl,
      resolver,
    });
    diagnostics.push({
      check: 'token',
      ok: false,
      failureClass: ADAPTER_FAILURE_CLASSES.LOCAL_TUNNEL_CONTRACT_MISMATCH,
      message: 'Endpoint accepted a dispatch request with the wrong run token.',
      action: `Read ${LOCAL_TUNNEL_HEADER} during preflight and reject dispatch requests whose header does not match.`,
    });
    return doctorResult(false, diagnostics);
  } catch (error) {
    if (error?.failureClass === ADAPTER_FAILURE_CLASSES.LOCAL_TUNNEL_CONTRACT_MISMATCH) {
      diagnostics.push({
        check: 'token',
        ok: true,
        message: 'Endpoint rejected a dispatch request with the wrong run token.',
      });
      return doctorResult(true, diagnostics);
    }
    diagnostics.push(diagnosticFromError('token', error, guidanceForFailure(error?.failureClass)));
    return doctorResult(false, diagnostics);
  }
}

export async function requestLocalTunnelJson({
  endpointUrl,
  runToken,
  timeoutMs,
  maxResponseBytes,
  phase,
  body,
  diagnosticsDefaults = {},
  resolver,
  fetchImpl,
}) {
  const startedAtMs = Date.now();
  const requestTimestamp = new Date(startedAtMs).toISOString();
  const targetUrl = await validateLocalTunnelUrl(endpointUrl, { resolver });
  const response = await fetchLocalTunnelWithRedirects({
    url: targetUrl,
    runToken,
    timeoutMs,
    body,
    phase,
    startedAtMs,
    diagnosticsDefaults: {
      ...diagnosticsDefaults,
      target: endpointUrl,
      requestTimestamp,
    },
    resolver,
    fetchImpl,
  });

  const contentType = response.headers?.get?.('content-type') ?? '';
  if (!contentType.toLowerCase().includes('json')) {
    throw localTunnelError('Local tunnel response must be JSON with a JSON content-type.', {
      ...diagnosticsDefaults,
      target: response.url || endpointUrl,
      httpStatus: response.status,
      failureClass: ADAPTER_FAILURE_CLASSES.LOCAL_TUNNEL_INVALID_JSON,
      rawErrorMessage: 'Local tunnel response must be JSON with a JSON content-type.',
      phase: 'during_parsing',
      startedAtMs,
      requestTimestamp,
    });
  }

  const text = await readResponseText(response, {
    maxResponseBytes,
    target: response.url || targetUrl.href,
    phase,
    startedAtMs,
    diagnosticsDefaults: {
      ...diagnosticsDefaults,
      target: response.url || endpointUrl,
      requestTimestamp,
      httpStatus: response.status,
    },
  });

  let payload;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    throw localTunnelError('Local tunnel response must be valid JSON.', {
      ...diagnosticsDefaults,
      target: response.url || endpointUrl,
      httpStatus: response.status,
      failureClass: ADAPTER_FAILURE_CLASSES.LOCAL_TUNNEL_INVALID_JSON,
      rawErrorMessage: 'Local tunnel response must be valid JSON.',
      phase: 'during_parsing',
      startedAtMs,
      requestTimestamp,
    });
  }

  return {
    payload,
    status: response.status,
    url: response.url || targetUrl.href,
    startedAtMs,
    durationMs: Date.now() - startedAtMs,
  };
}

export async function validateLocalTunnelUrl(endpointUrl, options = {}) {
  let parsed;
  try {
    parsed = new URL(endpointUrl);
  } catch {
    throw localTunnelError('Local tunnel requires a valid URL.', {
      target: endpointUrl,
      failureClass: ADAPTER_FAILURE_CLASSES.EXECUTION_TARGET_INVALID,
      phase: 'before_dispatch',
    });
  }
  if (parsed.protocol !== 'https:') {
    throw localTunnelError('Local tunnel requires an HTTPS endpoint URL.', {
      target: endpointUrl,
      failureClass: ADAPTER_FAILURE_CLASSES.EXECUTION_TARGET_INVALID,
      phase: 'before_dispatch',
    });
  }
  if (!parsed.hostname) {
    throw localTunnelError('Local tunnel requires a hostname.', {
      target: endpointUrl,
      failureClass: ADAPTER_FAILURE_CLASSES.EXECUTION_TARGET_INVALID,
      phase: 'before_dispatch',
    });
  }

  const hostname = stripIpv6Brackets(parsed.hostname.toLowerCase());
  if (isBlockedHostname(hostname)) {
    throw localTunnelError('Local tunnel target is blocked because it points to a private or metadata hostname.', {
      target: endpointUrl,
      failureClass: ADAPTER_FAILURE_CLASSES.LOCAL_TUNNEL_PRIVATE_IP_BLOCKED,
      phase: 'before_dispatch',
    });
  }

  const literalFamily = net.isIP(hostname);
  if (literalFamily) {
    if (isBlockedIp(hostname)) {
      throw localTunnelError('Local tunnel target is blocked because it points to a private or metadata IP.', {
        target: endpointUrl,
        failureClass: ADAPTER_FAILURE_CLASSES.LOCAL_TUNNEL_PRIVATE_IP_BLOCKED,
        phase: 'before_dispatch',
      });
    }
    return parsed;
  }

  const addresses = await resolveHostname(hostname, options.resolver);
  const blocked = addresses.find((record) => isBlockedIp(record.address));
  if (blocked) {
    throw localTunnelError('Local tunnel target is blocked because DNS resolved to a private or metadata IP.', {
      target: endpointUrl,
      failureClass: ADAPTER_FAILURE_CLASSES.LOCAL_TUNNEL_PRIVATE_IP_BLOCKED,
      phase: 'before_dispatch',
    });
  }
  return parsed;
}

async function fetchLocalTunnelWithRedirects({
  url,
  runToken,
  timeoutMs,
  body,
  phase,
  startedAtMs,
  diagnosticsDefaults,
  resolver,
  fetchImpl,
}) {
  let currentUrl = url;
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    currentUrl = await validateLocalTunnelUrl(currentUrl.href, { resolver });
    const response = await fetchWithTimeout({
      url: currentUrl.href,
      runToken,
      timeoutMs,
      body,
      phase,
      startedAtMs,
      diagnosticsDefaults,
      fetchImpl,
    });

    if (!isRedirectStatus(response.status)) {
      if (!response.ok) {
        throw localTunnelError(messageForHttpStatus(response.status), {
          ...diagnosticsDefaults,
          target: currentUrl.href,
          httpStatus: response.status,
          failureClass: classifyLocalTunnelHttpStatus(response.status),
          phase,
          startedAtMs,
        });
      }
      return response;
    }

    const location = response.headers?.get?.('location');
    if (!location) {
      throw localTunnelError('Local tunnel redirect was blocked because the response did not include a Location header.', {
        ...diagnosticsDefaults,
        target: currentUrl.href,
        httpStatus: response.status,
        failureClass: ADAPTER_FAILURE_CLASSES.LOCAL_TUNNEL_REDIRECT_BLOCKED,
        phase,
        startedAtMs,
      });
    }
    let redirectUrl;
    try {
      redirectUrl = new URL(location, currentUrl);
    } catch {
      throw localTunnelError('Local tunnel redirect was blocked because the redirect target is invalid.', {
        ...diagnosticsDefaults,
        target: currentUrl.href,
        httpStatus: response.status,
        failureClass: ADAPTER_FAILURE_CLASSES.LOCAL_TUNNEL_REDIRECT_BLOCKED,
        phase,
        startedAtMs,
      });
    }
    try {
      currentUrl = await validateLocalTunnelUrl(redirectUrl.href, { resolver });
    } catch (error) {
      throw localTunnelError('Local tunnel redirect was blocked because the redirect target is unsafe.', {
        ...diagnosticsDefaults,
        target: redirectUrl.href,
        httpStatus: response.status,
        failureClass: error?.failureClass === ADAPTER_FAILURE_CLASSES.LOCAL_TUNNEL_PRIVATE_IP_BLOCKED
          ? ADAPTER_FAILURE_CLASSES.LOCAL_TUNNEL_REDIRECT_BLOCKED
          : error?.failureClass ?? ADAPTER_FAILURE_CLASSES.LOCAL_TUNNEL_REDIRECT_BLOCKED,
        phase,
        startedAtMs,
      });
    }
  }

  throw localTunnelError('Local tunnel redirect was blocked because it exceeded the redirect limit.', {
    ...diagnosticsDefaults,
    target: url.href,
    failureClass: ADAPTER_FAILURE_CLASSES.LOCAL_TUNNEL_REDIRECT_BLOCKED,
    phase,
    startedAtMs,
  });
}

async function fetchWithTimeout({ url, runToken, timeoutMs, body, phase, startedAtMs, diagnosticsDefaults, fetchImpl }) {
  const controller = new AbortController();
  const abortTimeout = setTimeout(() => controller.abort(), timeoutMs);
  let rejectTimeout;
  try {
    const request = (fetchImpl ?? fetch)(url, {
      method: 'POST',
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        [LOCAL_TUNNEL_HEADER]: runToken,
      },
      body: JSON.stringify(body),
    });
    return await Promise.race([
      request,
      new Promise((_, reject) => {
        rejectTimeout = setTimeout(() => reject(new DOMException('Local tunnel request timed out.', 'AbortError')), timeoutMs);
      }),
    ]);
  } catch (error) {
    const failureClass = classifyLocalTunnelNetworkError(error);
    throw localTunnelError(messageForNetworkError(error, failureClass, timeoutMs), {
      ...diagnosticsDefaults,
      target: url,
      failureClass,
      rawErrorMessage: messageForNetworkError(error, failureClass, timeoutMs),
      phase,
      startedAtMs,
      timedOut: failureClass === ADAPTER_FAILURE_CLASSES.LOCAL_TUNNEL_TIMEOUT,
    });
  } finally {
    clearTimeout(abortTimeout);
    clearTimeout(rejectTimeout);
  }
}

async function readResponseText(response, { maxResponseBytes, target, phase, startedAtMs, diagnosticsDefaults }) {
  const contentLength = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(contentLength) && contentLength > maxResponseBytes) {
    throw localTunnelError(`Local tunnel response exceeded ${maxResponseBytes} bytes.`, {
      ...diagnosticsDefaults,
      target,
      failureClass: ADAPTER_FAILURE_CLASSES.LOCAL_TUNNEL_CONTRACT_MISMATCH,
      rawErrorMessage: `Local tunnel response exceeded ${maxResponseBytes} bytes.`,
      phase: 'during_parsing',
      startedAtMs,
    });
  }

  if (response.body?.getReader) {
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxResponseBytes) {
        await reader.cancel().catch(() => {});
        throw localTunnelError(`Local tunnel response exceeded ${maxResponseBytes} bytes.`, {
          ...diagnosticsDefaults,
          target,
          failureClass: ADAPTER_FAILURE_CLASSES.LOCAL_TUNNEL_CONTRACT_MISMATCH,
          rawErrorMessage: `Local tunnel response exceeded ${maxResponseBytes} bytes.`,
          phase: 'during_parsing',
          startedAtMs,
        });
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString('utf8');
  }

  if (typeof response.text === 'function') {
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > maxResponseBytes) {
      throw localTunnelError(`Local tunnel response exceeded ${maxResponseBytes} bytes.`, {
        ...diagnosticsDefaults,
        target,
        failureClass: ADAPTER_FAILURE_CLASSES.LOCAL_TUNNEL_CONTRACT_MISMATCH,
        rawErrorMessage: `Local tunnel response exceeded ${maxResponseBytes} bytes.`,
        phase: 'during_parsing',
        startedAtMs,
      });
    }
    return text;
  }

  if (typeof response.json === 'function') {
    const text = JSON.stringify(await response.json());
    if (Buffer.byteLength(text, 'utf8') > maxResponseBytes) {
      throw localTunnelError(`Local tunnel response exceeded ${maxResponseBytes} bytes.`, {
        ...diagnosticsDefaults,
        target,
        failureClass: ADAPTER_FAILURE_CLASSES.LOCAL_TUNNEL_CONTRACT_MISMATCH,
        rawErrorMessage: `Local tunnel response exceeded ${maxResponseBytes} bytes.`,
        phase: 'during_parsing',
        startedAtMs,
      });
    }
    return text;
  }

  return '';
}

async function resolveHostname(hostname, resolver) {
  try {
    const lookup = resolver ?? globalThis.__harnessAmpLocalTunnelDnsLookup ?? dns.lookup;
    return await lookup(hostname, { all: true, verbatim: true });
  } catch (error) {
    throw localTunnelError('Local tunnel DNS lookup failed.', {
      target: hostname,
      failureClass: ADAPTER_FAILURE_CLASSES.LOCAL_TUNNEL_DNS_ERROR,
      rawErrorMessage: error instanceof Error ? error.message : String(error),
      phase: 'before_dispatch',
    });
  }
}

function isBlockedHostname(hostname) {
  return hostname === 'localhost'
    || hostname === 'localhost.localdomain'
    || hostname === 'metadata.google.internal'
    || hostname === 'metadata'
    || hostname.endsWith('.localhost')
    || hostname.endsWith('.local')
    || hostname.endsWith('.internal');
}

function doctorResult(ok, checks) {
  return {
    ok,
    checks,
  };
}

function diagnosticFromError(check, error, action) {
  return {
    check,
    ok: false,
    failureClass: error?.failureClass ?? ADAPTER_FAILURE_CLASSES.LOCAL_TUNNEL_UNREACHABLE,
    message: error instanceof Error ? error.message : String(error ?? 'Unknown local tunnel error.'),
    action,
  };
}

function guidanceForFailure(failureClass) {
  switch (failureClass) {
    case ADAPTER_FAILURE_CLASSES.LOCAL_TUNNEL_PRIVATE_IP_BLOCKED:
      return 'Use a public HTTPS tunnel URL. HarnessAmp blocks localhost, private IPs, link-local ranges, and metadata endpoints.';
    case ADAPTER_FAILURE_CLASSES.LOCAL_TUNNEL_REDIRECT_BLOCKED:
      return 'Remove redirects to private/internal URLs and make the public HTTPS URL point directly at the adapter route.';
    case ADAPTER_FAILURE_CLASSES.LOCAL_TUNNEL_TIMEOUT:
      return 'Start the local app, keep the tunnel open, and make the adapter respond before the timeout.';
    case ADAPTER_FAILURE_CLASSES.LOCAL_TUNNEL_INVALID_JSON:
      return 'Return JSON only with content that matches the HarnessAmp adapter contract.';
    case ADAPTER_FAILURE_CLASSES.LOCAL_TUNNEL_CONTRACT_MISMATCH:
      return `Validate ${LOCAL_TUNNEL_HEADER} and return { "ok": true } for preflight or { "observations": [] } for dispatch.`;
    case ADAPTER_FAILURE_CLASSES.LOCAL_TUNNEL_CLOSED_OR_EXPIRED:
      return 'Restart or rotate the tunnel, then rerun the doctor command with the new forwarding URL.';
    case ADAPTER_FAILURE_CLASSES.LOCAL_TUNNEL_DNS_ERROR:
      return 'Check the tunnel hostname and DNS resolution.';
    case ADAPTER_FAILURE_CLASSES.LOCAL_TUNNEL_TLS_ERROR:
      return 'Use a valid public HTTPS tunnel certificate.';
    default:
      return 'Confirm the adapter URL is reachable, public, HTTPS, and still running.';
  }
}

function isBlockedIp(ip) {
  const family = net.isIP(ip);
  if (family === 4) return isBlockedIpv4(ip);
  if (family === 6) return isBlockedIpv6(ip);
  return true;
}

function isBlockedIpv4(ip) {
  const parts = ip.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 0)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19))
    || a >= 224;
}

function isBlockedIpv6(ip) {
  const normalized = ip.toLowerCase();
  return normalized === '::'
    || normalized === '::1'
    || normalized.startsWith('fc')
    || normalized.startsWith('fd')
    || normalized.startsWith('fe8')
    || normalized.startsWith('fe9')
    || normalized.startsWith('fea')
    || normalized.startsWith('feb')
    || normalized.startsWith('ff')
    || normalized.startsWith('::ffff:10.')
    || normalized.startsWith('::ffff:127.')
    || normalized.startsWith('::ffff:169.254.')
    || normalized.startsWith('::ffff:192.168.');
}

function classifyLocalTunnelNetworkError(error) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const code = error?.cause?.code ?? error?.code ?? '';
  if (error?.name === 'AbortError' || /abort|timeout|timed out/i.test(message)) return ADAPTER_FAILURE_CLASSES.LOCAL_TUNNEL_TIMEOUT;
  if (/ENOTFOUND|EAI_AGAIN|dns|getaddrinfo/i.test(`${code} ${message}`)) return ADAPTER_FAILURE_CLASSES.LOCAL_TUNNEL_DNS_ERROR;
  if (/certificate|self-signed|SSL|TLS|ERR_TLS|CERT/i.test(`${code} ${message}`)) return ADAPTER_FAILURE_CLASSES.LOCAL_TUNNEL_TLS_ERROR;
  return ADAPTER_FAILURE_CLASSES.LOCAL_TUNNEL_UNREACHABLE;
}

function classifyLocalTunnelHttpStatus(status) {
  if (status === 401 || status === 403) return ADAPTER_FAILURE_CLASSES.LOCAL_TUNNEL_CONTRACT_MISMATCH;
  if ([404, 410, 502, 503, 504].includes(Number(status))) return ADAPTER_FAILURE_CLASSES.LOCAL_TUNNEL_CLOSED_OR_EXPIRED;
  return ADAPTER_FAILURE_CLASSES.LOCAL_TUNNEL_HTTP_ERROR;
}

function messageForHttpStatus(status) {
  if (status === 401 || status === 403) return 'Local tunnel rejected the run token or adapter contract.';
  if ([404, 410, 502, 503, 504].includes(Number(status))) return `Local tunnel appears closed or expired; endpoint returned HTTP ${status}.`;
  return `Local tunnel returned HTTP ${status}.`;
}

function messageForNetworkError(error, failureClass, timeoutMs) {
  if (failureClass === ADAPTER_FAILURE_CLASSES.LOCAL_TUNNEL_TIMEOUT) return `Local tunnel timed out after ${timeoutMs}ms.`;
  if (failureClass === ADAPTER_FAILURE_CLASSES.LOCAL_TUNNEL_DNS_ERROR) return 'Local tunnel DNS lookup failed.';
  if (failureClass === ADAPTER_FAILURE_CLASSES.LOCAL_TUNNEL_TLS_ERROR) return 'Local tunnel TLS validation failed.';
  return 'Local tunnel is unreachable.';
}

function localTunnelError(message, diagnostics = {}) {
  return new AdapterExecutionError(message, normalizeAdapterDiagnostics(diagnostics, {
    adapterType: 'local_http_tunnel',
    target: diagnostics.target ?? '',
    responseTimestamp: new Date().toISOString(),
    latencyMs: diagnostics.startedAtMs ? Date.now() - diagnostics.startedAtMs : null,
    failureClass: diagnostics.failureClass,
    rawErrorMessage: diagnostics.rawErrorMessage ?? message,
    phase: diagnostics.phase ?? '',
  }));
}

function jobDiagnostics(job, target) {
  return {
    adapterType: 'local_http_tunnel',
    target,
    workerId: job.workerId ?? job.claimedBy ?? '',
    jobId: job.id,
    retryAttempt: job.attempts,
    benchmarkId: job.payload?.pack?.id ?? job.payload?.pack?.project ?? '',
    benchmarkVersion: job.payload?.pack?.version ?? null,
  };
}

function isRedirectStatus(status) {
  return [301, 302, 303, 307, 308].includes(Number(status));
}

function stripIpv6Brackets(value) {
  return value.startsWith('[') && value.endsWith(']') ? value.slice(1, -1) : value;
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}
