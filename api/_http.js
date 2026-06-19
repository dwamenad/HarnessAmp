export async function readJsonBody(request) {
  if (!request?.body) return {};
  if (typeof request.body === 'object') return request.body;
  if (typeof request.body === 'string' && request.body.trim()) {
    return JSON.parse(request.body);
  }
  return {};
}

export function methodNotAllowed(response, methods) {
  response.setHeader('allow', Array.isArray(methods) ? methods.join(', ') : String(methods));
  response.status(405).json({ error: 'Method not allowed' });
}

export function unauthorized(response, error = 'Unauthorized') {
  response.status(401).json({ error });
}

export function forbidden(response, error = 'Forbidden') {
  response.status(403).json({ error });
}

export function badRequest(response, error = 'Bad request') {
  response.status(400).json({ error });
}

export function serverError(response, error) {
  response.status(500).json({ error: redactErrorText(error instanceof Error ? error.message : String(error)) });
}

export function redirect(response, location, statusCode = 302) {
  response.statusCode = statusCode;
  response.setHeader('location', location);
  response.end();
}

function redactErrorText(value) {
  return String(value ?? '')
    .replace(/sk-ant-[A-Za-z0-9_-]{8,}/g, 'sk-ant-[redacted]')
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, 'sk-[redacted]')
    .replace(/AIza[A-Za-z0-9_-]{20,}/g, 'AIza[redacted]')
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [redacted]')
    .replace(/(authorization|x-api-key|api-key)\s*:\s*[^,\n\r}]+/gi, '$1: [redacted]')
    .replace(/(authorization|token|secret|key|password|credential|api[_-]?key)=([^&\s]+)/gi, '$1=[redacted]');
}
