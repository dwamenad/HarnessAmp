import crypto from 'node:crypto';

export function readWorkerServiceContext(request) {
  const expected = normalizeToken(process.env.WORKER_SERVICE_TOKEN);
  if (!expected) return null;

  const authorization = request?.headers?.authorization ?? request?.headers?.Authorization;
  const actual = parseBearerToken(authorization);
  if (!actual) return null;

  if (!constantTimeEqual(actual, expected)) return null;
  return { service: 'worker' };
}

function parseBearerToken(value) {
  if (typeof value !== 'string') return null;
  const match = value.match(/^Bearer\s+(.+)$/iu);
  return normalizeToken(match?.[1]);
}

function normalizeToken(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function constantTimeEqual(actual, expected) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}
