import { verifySession } from '../lib/jwt.js';

export function requireAuth(req, res, next) {
  const token = req.cookies?.[process.env.COOKIE_NAME];
  const secret = process.env.JWT_SECRET;
  if (!token || !secret) return res.status(401).json({ error: 'Unauthorized' });
  const payload = verifySession(token, secret);
  if (!payload) return res.status(401).json({ error: 'Unauthorized' });
  req.user = payload;
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}
