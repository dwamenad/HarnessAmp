import { analyzeBundle } from '../core/engine.js';
import {
  AdapterExecutionError,
  ADAPTER_FAILURE_CLASSES,
  classifyAdapterError,
  normalizeAdapterDiagnostics,
  sanitizeDebugPayload,
} from './contract.js';

const PROVIDER_ENDPOINTS = {
  openai: 'https://api.openai.com/v1/chat/completions',
  anthropic: 'https://api.anthropic.com/v1/messages',
};

const EXECUTABLE_PROVIDERS = new Set(['openai', 'anthropic']);

export async function executeHostedProviderBenchmark(bundleInput, config = {}, options = {}) {
  const analysis = analyzeBundle(bundleInput);
  const variants = selectVariants(analysis.pack.variants, config.mode ?? 'sample');
  const observations = [];
  for (const variant of variants) {
    if (await shouldCancel(options)) break;
    const scenario = variant.harness?.scenarios?.[0] ?? analysis.bundle.harness?.scenarios?.[0] ?? {};
    observations.push(await executeHostedProviderVariant({
      bundle: analysis.bundle,
      variant,
      scenario,
      config,
      options,
    }));
  }
  return {
    adapter: {
      type: 'hosted_provider',
      provider: config.provider,
      model: config.model,
      secretRef: config.secretRef,
    },
    observations,
  };
}

export async function executeHostedProviderAgentRun({ bundle, mutation = null, task = null, environment = 'local', config = {} }) {
  const scenario = task ?? bundle.harness?.scenarios?.[0] ?? {};
  const variant = {
    id: mutation?.mutationId ?? scenario.id ?? 'baseline',
    familyId: mutation?.mutationFamily ?? 'hosted_provider',
    tier: 'visible',
    harness: bundle.harness,
  };
  const observation = await executeHostedProviderVariant({
    bundle,
    variant,
    scenario,
    config,
    options: { environment },
  });
  return {
    runId: `${slugify(bundle.project)}__${slugify(scenario.id ?? 'task')}__${slugify(mutation?.mutationId ?? 'baseline')}`,
    harnessId: slugify(bundle.project),
    harnessVersion: bundle.version ?? 1,
    agentVersion: bundle.wrapper?.agentVersion ?? bundle.harness?.agentVersion ?? 'hosted-provider',
    modelVersion: config.model,
    mutationPackVersion: mutation?.version ?? null,
    mutationId: mutation?.mutationId ?? null,
    mutationSeed: mutation?.deterministicSeed ?? null,
    runnerVersion: 'hosted-provider/0.1.0',
    evaluatorVersion: 'diagnostic-rules/1.0.0',
    timestamp: new Date().toISOString(),
    environment,
    toolMode: 'hosted-provider',
    taskId: scenario.id ?? 'task-001',
    inputPrompt: observation.inputPrompt,
    outputText: observation.outputText,
    toolCalls: observation.toolCalls,
    toolOutputs: observation.toolResults,
    errors: observation.error ? [observation.error] : [],
    latencyMs: observation.latencyMs,
    tokenUsage: observation.tokenUsage,
    metadata: {
      passed: observation.passed,
      score: observation.score,
      adapterType: 'hosted_provider',
      provider: config.provider,
      model: config.model,
      secretRef: config.secretRef ?? null,
      failureClass: observation.metadata?.failureClass ?? null,
      diagnostics: observation.diagnostics,
    },
  };
}

async function executeHostedProviderVariant({ bundle, variant, scenario, config, options }) {
  const startedAt = Date.now();
  const requestTimestamp = new Date(startedAt).toISOString();
  const prompt = scenario.objective ?? scenario.input ?? scenario.title ?? '';
  const diagnosticsBase = {
    adapterType: 'hosted_provider',
    target: `${config.provider}:${config.model}`,
    requestTimestamp,
    workerId: options.workerId ?? '',
    jobId: options.jobId ?? '',
    retryAttempt: options.retryAttempt,
    benchmarkId: bundle.id ?? bundle.project ?? '',
    benchmarkVersion: bundle.version ?? null,
    scenarioId: scenario.id ?? variant.id ?? '',
    mutationId: null,
    mutationFamily: variant.familyId ?? '',
    phase: 'during_adapter_call',
  };

  try {
    if (await shouldCancel(options)) {
      throw new AdapterExecutionError('Hosted provider execution canceled before dispatch.', {
        ...diagnosticsBase,
        failureClass: ADAPTER_FAILURE_CLASSES.WORKER_CANCELED,
        phase: 'before_dispatch',
      });
    }
    const dispatch = await dispatchHostedProvider({
      provider: config.provider,
      model: config.model,
      input: prompt,
      timeoutMs: config.timeoutMs,
      secretResolver: config.secretResolver,
      fetchImpl: options.fetchImpl ?? globalThis.fetch,
      metadata: diagnosticsBase,
    }, diagnosticsBase);
    const usage = normalizeUsage(dispatch.rawResponseMetadata?.usage);
    const outputText = dispatch.outputText;
    if (!outputText) {
      throw new AdapterExecutionError('Hosted provider returned an invalid response.', {
        ...diagnosticsBase,
        responseTimestamp: new Date().toISOString(),
        latencyMs: Date.now() - startedAt,
        failureClass: ADAPTER_FAILURE_CLASSES.HOSTED_PROVIDER_RESPONSE_INVALID,
        rawErrorMessage: 'Hosted provider returned an invalid response.',
        phase: 'during_parsing',
      });
    }
    const diagnostics = normalizeAdapterDiagnostics({}, {
      ...diagnosticsBase,
      responseTimestamp: new Date().toISOString(),
      latencyMs: Date.now() - startedAt,
      phase: 'completion',
      httpStatus: dispatch.diagnostics.httpStatus,
      usage: {
        provider: config.provider,
        model: config.model,
        ...usage,
      },
    });
    return {
      id: `${variant.id}:hosted-provider`,
      variantId: variant.id,
      familyId: variant.familyId,
      tier: variant.tier,
      scenarioId: scenario.id ?? '',
      inputPrompt: prompt,
      outputText,
      toolCalls: [],
      toolResults: [],
      structuredOutput: null,
      citations: [],
      sources: [],
      latencyMs: diagnostics.latencyMs,
      tokenUsage: { input: usage.promptTokens, output: usage.completionTokens },
      modelMetadata: { provider: config.provider, model: config.model },
      diagnostics,
      error: null,
      passed: true,
      score: 100,
      notes: `Hosted provider ${config.provider} returned text for ${config.model}.`,
      source: 'observed',
      metadata: {
        adapterType: 'hosted_provider',
        provider: config.provider,
        model: config.model,
        secretRef: config.secretRef,
        diagnostics,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const diagnostics = normalizeAdapterDiagnostics(error?.diagnostics, {
      ...diagnosticsBase,
      responseTimestamp: new Date().toISOString(),
      latencyMs: Date.now() - startedAt,
      failureClass: error?.failureClass ?? classifyHostedProviderError(error),
      rawErrorMessage: message,
    });
    return {
      id: `${variant.id}:hosted-provider:error`,
      variantId: variant.id,
      familyId: variant.familyId,
      tier: variant.tier,
      scenarioId: scenario.id ?? '',
      inputPrompt: prompt,
      outputText: '',
      toolCalls: [],
      toolResults: [],
      structuredOutput: null,
      citations: [],
      sources: [],
      latencyMs: diagnostics.latencyMs,
      tokenUsage: { input: null, output: null },
      modelMetadata: { provider: config.provider, model: config.model },
      diagnostics,
      error: message,
      passed: false,
      score: 0,
      notes: `Hosted provider error: ${message}`,
      source: 'observed',
      metadata: {
        adapterType: 'hosted_provider',
        provider: config.provider,
        model: config.model,
        secretRef: config.secretRef,
        failureClass: diagnostics.failureClass,
        diagnostics,
      },
    };
  }
}

export async function dispatchHostedProvider({
  provider,
  model,
  input = '',
  messages = null,
  system = '',
  tools = null,
  timeoutMs = 30000,
  secretResolver,
  fetchImpl = globalThis.fetch,
  metadata = {},
}) {
  if (!PROVIDER_ENDPOINTS[provider]) {
    throw new AdapterExecutionError(`Unsupported hosted provider: ${provider}`, {
      ...metadata,
      failureClass: ADAPTER_FAILURE_CLASSES.EXECUTION_TARGET_UNSUPPORTED,
      phase: 'before_dispatch',
    });
  }
  if (!EXECUTABLE_PROVIDERS.has(provider)) {
    throw new AdapterExecutionError(`Hosted provider execution is not implemented for ${provider}.`, {
      ...metadata,
      failureClass: ADAPTER_FAILURE_CLASSES.EXECUTION_TARGET_UNSUPPORTED,
      phase: 'before_dispatch',
    });
  }
  if (!model) {
    throw new AdapterExecutionError('Hosted provider model is missing.', {
      ...metadata,
      failureClass: ADAPTER_FAILURE_CLASSES.HOSTED_PROVIDER_MODEL_MISSING,
      phase: 'before_dispatch',
    });
  }
  if (typeof secretResolver !== 'function') {
    throw new AdapterExecutionError('Hosted provider secret resolver is missing.', {
      ...metadata,
      failureClass: ADAPTER_FAILURE_CLASSES.HOSTED_PROVIDER_MISSING_SECRET,
      phase: 'before_dispatch',
    });
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1, Number(timeoutMs) || 30000));
  const startedAt = Date.now();
  let apiKey = '';
  try {
    apiKey = await secretResolver({ provider, model });
    if (!apiKey) {
      throw new AdapterExecutionError('Hosted provider secret is missing.', {
        ...metadata,
        failureClass: ADAPTER_FAILURE_CLASSES.HOSTED_PROVIDER_MISSING_SECRET,
        phase: 'before_dispatch',
      });
    }
    const response = await fetchImpl(PROVIDER_ENDPOINTS[provider], {
      method: 'POST',
      signal: controller.signal,
      headers: providerHeaders(provider, apiKey),
      body: JSON.stringify(providerRequestBody(provider, model, input, messages, system, tools)),
    });
    const text = await response.text();
    const payload = text ? safeJson(text) : {};
    if (!response.ok) {
      const failureClass = classifyHostedHttpStatus(response.status);
      throw new AdapterExecutionError(providerErrorMessage(payload, response.status), {
        ...metadata,
        responseTimestamp: new Date().toISOString(),
        httpStatus: response.status,
        failureClass,
        rawErrorMessage: providerErrorMessage(payload, response.status),
        phase: 'during_adapter_call',
      });
    }
    const outputText = extractOutputText(provider, payload);
    if (!outputText) {
      throw new AdapterExecutionError('Hosted provider returned an invalid response.', {
        ...metadata,
        responseTimestamp: new Date().toISOString(),
        httpStatus: response.status,
        failureClass: ADAPTER_FAILURE_CLASSES.HOSTED_PROVIDER_RESPONSE_INVALID,
        rawErrorMessage: 'Hosted provider returned an invalid response.',
        phase: 'during_parsing',
      });
    }
    return {
      ok: true,
      outputText,
      rawResponseMetadata: {
        id: payload.id ?? null,
        model: payload.model ?? model,
        usage: payload.usage ?? {},
        stopReason: payload.stop_reason ?? payload.choices?.[0]?.finish_reason ?? null,
      },
      diagnostics: normalizeAdapterDiagnostics({}, {
        ...metadata,
        adapterType: 'hosted_provider',
        responseTimestamp: new Date().toISOString(),
        latencyMs: Date.now() - startedAt,
        httpStatus: response.status,
        phase: 'completion',
        modelMetadata: { provider, model },
      }),
    };
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new AdapterExecutionError(`Hosted provider timed out after ${timeoutMs}ms.`, {
        ...metadata,
        responseTimestamp: new Date().toISOString(),
        timedOut: true,
        failureClass: ADAPTER_FAILURE_CLASSES.HOSTED_PROVIDER_TIMEOUT,
        rawErrorMessage: `Hosted provider timed out after ${timeoutMs}ms.`,
      });
    }
    if (error instanceof AdapterExecutionError) throw error;
    throw new AdapterExecutionError('Hosted provider network error.', {
      ...metadata,
      responseTimestamp: new Date().toISOString(),
      failureClass: ADAPTER_FAILURE_CLASSES.HOSTED_PROVIDER_NETWORK_ERROR,
      rawErrorMessage: error instanceof Error ? error.message : String(error),
      phase: 'during_adapter_call',
    });
  } finally {
    apiKey = '';
    clearTimeout(timeout);
  }
}

async function callHostedProvider({ provider, model, apiKey, prompt, timeoutMs = 30000, fetchImpl }, diagnosticsBase) {
  try {
    return await dispatchHostedProvider({
      provider,
      model,
      input: prompt,
      timeoutMs,
      fetchImpl,
      secretResolver: async () => apiKey,
      metadata: diagnosticsBase,
    });
  } catch (error) {
    throw error;
  }
}

function providerHeaders(provider, apiKey) {
  if (provider === 'anthropic') {
    return {
      'content-type': 'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key': apiKey,
    };
  }
  return {
    'content-type': 'application/json',
    authorization: `Bearer ${apiKey}`,
  };
}

function providerRequestBody(provider, model, prompt, messages, system, tools) {
  const normalizedMessages = Array.isArray(messages) && messages.length
    ? messages.map((message) => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: String(message.content ?? ''),
    }))
    : [{ role: 'user', content: prompt }];
  if (provider === 'anthropic') {
    return {
      model,
      max_tokens: 512,
      ...(system ? { system } : {}),
      ...(tools ? { tools } : {}),
      messages: normalizedMessages,
    };
  }
  return {
    model,
    ...(tools ? { tools } : {}),
    messages: [
      ...(system ? [{ role: 'system', content: system }] : []),
      ...normalizedMessages,
    ],
  };
}

function extractOutputText(provider, payload) {
  if (provider === 'anthropic') {
    return (Array.isArray(payload.content) ? payload.content : [])
      .map((item) => item?.text ?? '')
      .join('')
      .trim();
  }
  return String(payload.choices?.[0]?.message?.content ?? payload.output_text ?? '').trim();
}

function normalizeUsage(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const promptTokens = numberOrNull(source.prompt_tokens ?? source.input_tokens);
  const completionTokens = numberOrNull(source.completion_tokens ?? source.output_tokens);
  return {
    promptTokens,
    completionTokens,
    totalTokens: numberOrNull(source.total_tokens) ?? ((promptTokens ?? 0) + (completionTokens ?? 0) || null),
  };
}

function classifyHostedHttpStatus(status) {
  if (status === 401 || status === 403) return ADAPTER_FAILURE_CLASSES.HOSTED_PROVIDER_AUTH_FAILED;
  if (status === 429) return ADAPTER_FAILURE_CLASSES.HOSTED_PROVIDER_RATE_LIMITED;
  if (status === 400 || status === 404 || status === 422) return ADAPTER_FAILURE_CLASSES.HOSTED_PROVIDER_INVALID_REQUEST;
  return ADAPTER_FAILURE_CLASSES.HOSTED_PROVIDER_UNKNOWN;
}

function classifyHostedProviderError(error) {
  const failure = classifyAdapterError(error);
  if (failure === ADAPTER_FAILURE_CLASSES.TIMEOUT) return ADAPTER_FAILURE_CLASSES.HOSTED_PROVIDER_TIMEOUT;
  if (failure === ADAPTER_FAILURE_CLASSES.AUTH_ERROR) return ADAPTER_FAILURE_CLASSES.HOSTED_PROVIDER_AUTH_FAILED;
  if (failure === ADAPTER_FAILURE_CLASSES.RATE_LIMITED) return ADAPTER_FAILURE_CLASSES.HOSTED_PROVIDER_RATE_LIMITED;
  return error?.failureClass ?? ADAPTER_FAILURE_CLASSES.HOSTED_PROVIDER_UNKNOWN;
}

function providerErrorMessage(payload, status) {
  return sanitizeDebugPayload(payload?.error?.message ?? payload?.message ?? `Hosted provider returned HTTP ${status}`);
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function selectVariants(variants, mode) {
  const list = Array.isArray(variants) ? variants : [];
  if (mode === 'full') return list;
  const visible = list.filter((variant) => variant.tier === 'visible');
  return visible.length ? visible : list.slice(0, 2);
}

async function shouldCancel(options) {
  return typeof options.shouldCancel === 'function' ? Boolean(await options.shouldCancel()) : false;
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}
