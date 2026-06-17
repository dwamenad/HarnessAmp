import { validateVercelAiSdkAdapterConfig } from './vercel-ai-sdk.js';

const HOSTED_PROVIDER_TYPES = new Set(['openai', 'anthropic', 'google', 'mistral', 'groq', 'together']);
const SECRET_KEY_PATTERN = /api[_-]?key|secret|token|authorization|password|credential/i;

export function normalizeExecutionTarget(input = {}, legacy = {}) {
  const source = coalesceExecutionTarget(input, legacy);
  if (!source) {
    throw new Error('Execution target is required.');
  }

  const type = normalizeTargetType(source.type ?? source.kind ?? source.adapter);
  if (type === 'registered_runner') {
    const runnerId = stringOr(source.runnerId ?? source.runner_id ?? legacy.runnerId, '');
    if (!runnerId) throw new Error('registered_runner execution target requires runnerId.');
    return {
      type,
      runnerId,
      safeMetadata: {
        type,
        runnerId,
      },
    };
  }

  if (type === 'vercel_ai_sdk') {
    const routeUrl = stringOr(source.routeUrl ?? source.route_url ?? source.target ?? source.targetRoute ?? source.handlerPath ?? legacy.adapter?.target, '');
    if (!routeUrl && typeof source.handler !== 'function' && typeof legacy.adapter?.handler !== 'function') {
      throw new Error('vercel_ai_sdk execution target requires target, routeUrl, or route target.');
    }
    const adapter = validateVercelAiSdkAdapterConfig({
      ...legacy.adapter,
      ...source,
      type: 'vercel-ai-sdk',
      target: routeUrl || source.target,
      routeUrl,
    });
    return {
      type,
      routeUrl: adapter.target,
      adapter,
      safeMetadata: {
        type,
        routeUrl: adapter.target,
        modelLabel: adapter.modelLabel,
        mode: adapter.mode,
        streamingMode: adapter.streamingMode,
      },
    };
  }

  if (type === 'hosted_provider') {
    if (process.env.HARNESSAMP_ENABLE_HOSTED_BYOK !== '1') {
      throw new Error('Unsupported execution target type: hosted_provider. Encrypted project secret storage is not enabled.');
    }
    rejectInlineSecrets(source);
    const provider = stringOr(source.provider, '');
    const model = stringOr(source.model, '');
    const secretRef = stringOr(source.secretRef ?? source.secret_ref, '');
    if (!HOSTED_PROVIDER_TYPES.has(provider)) throw new Error(`Unsupported hosted provider: ${provider || 'missing'}`);
    if (!model) throw new Error('hosted_provider execution target requires model.');
    if (!secretRef) throw new Error('hosted_provider execution target requires secretRef.');
    return {
      type,
      provider,
      model,
      secretRef,
      safeMetadata: {
        type,
        provider,
        model,
        secretRef,
        enabled: true,
      },
    };
  }

  throw new Error(`Unsupported execution target type: ${type || 'missing'}`);
}

export function adapterConfigForExecutionTarget(target) {
  if (!target) return null;
  if (target.type === 'vercel_ai_sdk') return target.adapter ?? validateVercelAiSdkAdapterConfig({ type: 'vercel-ai-sdk', target: target.routeUrl });
  return null;
}

export function executionTargetRunnerId(target) {
  return target?.type === 'registered_runner' ? target.runnerId : null;
}

export function executionTargetSafeMetadata(target) {
  if (!target) return null;
  return target.safeMetadata ?? {
    type: target.type,
    runnerId: target.runnerId ?? null,
    routeUrl: target.routeUrl ?? null,
    provider: target.provider ?? null,
    model: target.model ?? null,
    secretRef: target.secretRef ?? null,
  };
}

function coalesceExecutionTarget(input, legacy) {
  if (input && typeof input === 'object' && (input.type || input.kind)) return input;
  if (legacy.executionTarget && typeof legacy.executionTarget === 'object') return legacy.executionTarget;
  if (legacy.runnerId) return { type: 'registered_runner', runnerId: legacy.runnerId };
  if (legacy.adapter?.type) return { type: legacy.adapter.type, ...legacy.adapter };
  return null;
}

function normalizeTargetType(value) {
  const text = stringOr(value, '').replaceAll('-', '_');
  if (text === 'runner' || text === 'registered_http_runner' || text === 'registered_runner') return 'registered_runner';
  if (text === 'vercel_ai_sdk') return 'vercel_ai_sdk';
  if (text === 'vercel_ai_sdk_route') return 'vercel_ai_sdk';
  if (text === 'hosted_provider') return 'hosted_provider';
  return text;
}

function rejectInlineSecrets(source) {
  for (const key of Object.keys(source && typeof source === 'object' ? source : {})) {
    if (SECRET_KEY_PATTERN.test(key) && key !== 'secretRef' && key !== 'secret_ref') {
      throw new Error('Execution target does not accept raw provider API keys in this build.');
    }
  }
}

function stringOr(value, fallback) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}
