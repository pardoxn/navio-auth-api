// src/routes/auth.routes.js
import express from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import { sendMail } from '../lib/mailer.js';
import { addHours, makeHashedOneTimeToken, makeVerifyLink, makeResetLink } from '../lib/util.js';
import { signSession, setAuthCookie, clearAuthCookie } from '../lib/jwt.js';
import { logAudit } from '../lib/audit.js';

const router = express.Router();
const TOKEN_TTL_H = 24;

// Register
router.post('/register', async (req, res) => {
  const { username, email, password } = req.body || {};
  if (!username || !email || !password) return res.status(400).json({ error: 'Missing fields' });

  const exists = await prisma.user.findFirst({ where: { OR: [{ email }, { username }] } });
  if (exists) return res.status(409).json({ error: 'Benutzername oder E-Mail existiert bereits.' });

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({ data: { username, email, passwordHash } });

  const { plain, hashed } = await makeHashedOneTimeToken();
  const tok = await prisma.token.create({
    data: { userId: user.id, type: 'EMAIL_VERIFY', hashedToken: hashed, expiresAt: addHours(new Date(), TOKEN_TTL_H) }
  });

  const url = makeVerifyLink(tok.id, plain);
  await sendMail({
    to: email, subject: 'Bitte E-Mail bestätigen',
    html: `<p>Hallo ${user.username},</p><p>Bitte bestätige deine E-Mail-Adresse:</p><p><a href="${url}">E-Mail bestätigen</a></p>`
  });

  await logAudit({ userId: user.id, action: 'USER_REGISTER', meta: { username, email } });

  res.json({ ok: true });
});

// Verify
router.get('/verify', async (req, res) => {
  const { tid, t } = req.query || {};
  const token = await prisma.token.findUnique({ where: { id: String(tid) } });
  if (!token || token.type !== 'EMAIL_VERIFY') return res.status(400).send('Invalid token');
  if (token.usedAt || token.expiresAt < new Date()) return res.status(400).send('Expired or used');

  const ok = await bcrypt.compare(String(t || ''), token.hashedToken);
  if (!ok) return res.status(400).send('Invalid token');

  await prisma.$transaction([
    prisma.user.update({ where: { id: token.userId }, data: { emailVerifiedAt: new Date() } }),
    prisma.token.update({ where: { id: token.id }, data: { usedAt: new Date() } })
  ]);

  await logAudit({ userId: token.userId, action: 'USER_VERIFY' });

  res.redirect((process.env.APP_ORIGIN || 'http://localhost:5173') + '/?verified=1');
});

// Login
router.post('/login', async (req, res) => {
  const { usernameOrEmail, username, email, password } = req.body || {};
  const handle = (usernameOrEmail || username || email || '').toString().trim();
  if (!handle || !password) return res.status(400).json({ error: 'Fehlende Zugangsdaten' });

  const user = await prisma.user.findFirst({ where: { OR: [{ username: handle }, { email: handle }] } });
  if (!user) return res.status(401).json({ error: 'Ungültig' });
  if (user.deletedAt) return res.status(403).json({ error: 'Account deaktiviert' });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Ungültig' });
  if (!user.emailVerifiedAt) return res.status(403).json({ error: 'Bitte E-Mail verifizieren' });

  const token = signSession({ id: user.id, role: user.role, username: user.username }, process.env.JWT_SECRET);
  setAuthCookie(res, process.env.COOKIE_NAME, token, {
    secure: process.env.COOKIE_SECURE === 'true',
    domain: process.env.COOKIE_DOMAIN || undefined
  });

  await logAudit({ userId: user.id, action: 'USER_LOGIN' });

  res.json({ ok: true });
});

// Me
router.get('/me', async (req, res) => {
  const cookieName = process.env.COOKIE_NAME;
  const secret = process.env.JWT_SECRET;
  const token = req.cookies?.[cookieName];
  if (!token || !secret) return res.status(401).json({ error: 'Unauthorized' });

  const { verifySession } = await import('../lib/jwt.js');
  const payload = verifySession(token, secret);
  if (!payload) return res.status(401).json({ error: 'Unauthorized' });

  const user = await prisma.user.findUnique({ where: { id: payload.id } });
  if (!user || user.deletedAt) return res.status(401).json({ error: 'Unauthorized' });

  res.json({ id: user.id, username: user.username, email: user.email, role: user.role, emailVerified: !!user.emailVerifiedAt });
});

// Logout
router.post('/logout', async (req, res) => {
  const cookieName = process.env.COOKIE_NAME;
  const token = req.cookies?.[cookieName];
  // Wir können hier (optional) den Actor aus /me ziehen; für Einfachheit erst mal ohne
  clearAuthCookie(res, process.env.COOKIE_NAME, {
    secure: process.env.COOKIE_SECURE === 'true',
    domain: process.env.COOKIE_DOMAIN || undefined
  });
  // logout loggen ist möglich, wenn du /me vorher abfragst; hier lassen wir es neutral
  res.json({ ok: true });
});

// Forgot
router.post('/password/forgot', async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Missing email' });

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.deletedAt) return res.json({ ok: true });

  const { plain, hashed } = await makeHashedOneTimeToken();
  const tok = await prisma.token.create({
    data: { userId: user.id, type: 'PASSWORD_RESET', hashedToken: hashed, expiresAt: addHours(new Date(), 2) }
  });

  const url = makeResetLink(tok.id, plain);
  await sendMail({
    to: email, subject: 'Passwort zurücksetzen',
    html: `<p>Hallo ${user.username},</p><p>Du kannst dein Passwort hier zurücksetzen:</p><p><a href="${url}">Passwort zurücksetzen</a></p>`
  });

  await logAudit({ userId: user.id, action: 'PASSWORD_FORGOT' });

  res.json({ ok: true });
});

// Reset
router.post('/password/reset', async (req, res) => {
  const { tid, t, newPassword } = req.body || {};
  if (!tid || !t || !newPassword) return res.status(400).json({ error: 'Missing fields' });

  const token = await prisma.token.findUnique({ where: { id: String(tid) } });
  if (!token || token.type !== 'PASSWORD_RESET') return res.status(400).json({ error: 'Invalid token' });
  if (token.usedAt || token.expiresAt < new Date()) return res.status(400).json({ error: 'Expired or used' });

  const ok = await import('bcryptjs').then(m => m.compare(String(t), token.hashedToken));
  if (!ok) return res.status(400).json({ error: 'Invalid token' });

  const passwordHash = await import('bcryptjs').then(m => m.hash(newPassword, 12));
  await prisma.$transaction([
    prisma.user.update({ where: { id: token.userId }, data: { passwordHash } }),
    prisma.token.update({ where: { id: token.id }, data: { usedAt: new Date() } })
  ]);

  await logAudit({ userId: token.userId, action: 'PASSWORD_RESET' });

  res.json({ ok: true });
});

export default router;
