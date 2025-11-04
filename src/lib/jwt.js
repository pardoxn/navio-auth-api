import jwt from 'jsonwebtoken';
const ttlSec = 60 * 60 * 24 * 7; // 7 Tage

export function signSession(payload, secret) {
  return jwt.sign(payload, secret, { expiresIn: ttlSec });
}
export function verifySession(token, secret) {
  try { return jwt.verify(token, secret); } catch { return null; }
}
export function setAuthCookie(res, name, token, { secure, domain } = {}) {
  res.cookie(name, token, {
    httpOnly: true, sameSite: 'lax', secure: !!secure,
    domain: domain || undefined, path: '/', maxAge: ttlSec * 1000
  });
}
export function clearAuthCookie(res, name, { secure, domain } = {}) {
  res.cookie(name, '', {
    httpOnly: true, sameSite: 'lax', secure: !!secure,
    domain: domain || undefined, path: '/', maxAge: 0
  });
}
