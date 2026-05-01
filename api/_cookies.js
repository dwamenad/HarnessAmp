const ONE_DAY_SECONDS = 60 * 60 * 24;

export function parseCookies(header = '') {
  return String(header)
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((accumulator, part) => {
      const [name, ...rest] = part.split('=');
      accumulator[name] = decodeURIComponent(rest.join('='));
      return accumulator;
    }, {});
}

export function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${options.path ?? '/'}`);
  if (options.httpOnly !== false) parts.push('HttpOnly');
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  if (options.secure) parts.push('Secure');
  if (options.maxAge != null) parts.push(`Max-Age=${options.maxAge}`);
  return parts.join('; ');
}

export function appendSetCookie(response, cookie) {
  const previous = response.getHeader ? response.getHeader('set-cookie') : undefined;
  if (!previous) {
    response.setHeader('set-cookie', cookie);
    return;
  }
  const next = Array.isArray(previous) ? [...previous, cookie] : [previous, cookie];
  response.setHeader('set-cookie', next);
}

export function sessionCookieOptions(request, maxAge = ONE_DAY_SECONDS * 7) {
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
    secure: isSecureRequest(request),
    maxAge,
  };
}

function isSecureRequest(request) {
  const protocol = request?.headers?.['x-forwarded-proto'] ?? '';
  return protocol === 'https' || process.env.NODE_ENV === 'production';
}
