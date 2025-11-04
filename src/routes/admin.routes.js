// src/routes/admin.routes.js
import express from 'express';
import { prisma } from '../lib/prisma.js';
import { logAudit } from '../lib/audit.js';

const router = express.Router();

function redact(u) {
  return {
    id: u.id, username: u.username, email: u.email, role: u.role,
    emailVerified: !!u.emailVerifiedAt, deletedAt: u.deletedAt,
    createdAt: u.createdAt, updatedAt: u.updatedAt
  };
}

// --- Stats ---
router.get('/stats', async (_req, res) => {
  const [total, active, inactive, verified] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { deletedAt: null } }),
    prisma.user.count({ where: { deletedAt: { not: null } } }),
    prisma.user.count({ where: { emailVerifiedAt: { not: null } } }),
  ]);
  res.json({ total, active, inactive, verified });
});

// --- List Users ---
router.get('/users', async (req, res) => {
  const q = (req.query.q || '').toString().trim();
  const state = (req.query.state || '').toString(); // '', 'active', 'inactive'
  const limit = Math.min(Math.max(parseInt(req.query.limit || '24', 10), 1), 100);
  const cursor = req.query.cursor ? { id: String(req.query.cursor) } : null;

  const where = {
    ...(q ? { OR: [{ username: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }] } : {}),
    ...(state === 'active' ? { deletedAt: null } : {}),
    ...(state === 'inactive' ? { deletedAt: { not: null } } : {}),
  };

  const rows = await prisma.user.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(cursor ? { cursor, skip: 1 } : {}),
  });

  let nextCursor = null;
  if (rows.length > limit) {
    const next = rows.pop();
    nextCursor = next?.id || null;
  }

  res.json({ items: rows.map(redact), nextCursor });
});

// --- Get User ---
router.get('/users/:id', async (req, res) => {
  const u = await prisma.user.findUnique({ where: { id: String(req.params.id) } });
  if (!u) return res.status(404).json({ error: 'Not found' });
  res.json(redact(u));
});

// --- Patch User ---
router.patch('/users/:id', async (req, res) => {
  const id = String(req.params.id);
  const { username, email, role, active, verifyNow } = req.body || {};

  const data = {};
  if (typeof username === 'string' && username.trim()) data.username = username.trim();
  if (typeof email === 'string' && email.trim()) data.email = email.trim();
  if (role === 'USER' || role === 'ADMIN') data.role = role;
  if (verifyNow === true) data.emailVerifiedAt = new Date();
  if (active === true) data.deletedAt = null;
  if (active === false) data.deletedAt = new Date();

  try {
    const u = await prisma.user.update({ where: { id }, data });
    await logAudit({ actorId: req.user?.id, targetUserId: id, action: 'ADMIN_USER_UPDATE', meta: { username, email, role, active, verifyNow } });
    res.json(redact(u));
  } catch (e) {
    if (String(e?.code) === 'P2002') {
      return res.status(409).json({ error: 'Username oder E-Mail bereits vergeben.' });
    }
    return res.status(400).json({ error: 'Update fehlgeschlagen.' });
  }
});

// --- Deactivate / Reactivate ---
router.post('/users/:id/deactivate', async (req, res) => {
  const id = String(req.params.id);
  const u = await prisma.user.update({ where: { id }, data: { deletedAt: new Date() } });
  await logAudit({ actorId: req.user?.id, targetUserId: id, action: 'ADMIN_USER_DEACTIVATE' });
  res.json(redact(u));
});
router.post('/users/:id/reactivate', async (req, res) => {
  const id = String(req.params.id);
  const u = await prisma.user.update({ where: { id }, data: { deletedAt: null } });
  await logAudit({ actorId: req.user?.id, targetUserId: id, action: 'ADMIN_USER_REACTIVATE' });
  res.json(redact(u));
});

// --- Delete (soft/hard) ---
router.delete('/users/:id', async (req, res) => {
  const id = String(req.params.id);
  const hard = req.query.hard === '1';
  if (hard) {
    try {
      await prisma.user.delete({ where: { id } });
      await logAudit({ actorId: req.user?.id, targetUserId: id, action: 'ADMIN_USER_DELETE', meta: { hard: true } });
      return res.json({ ok: true, hardDeleted: true });
    } catch {
      return res.status(404).json({ error: 'Not found' });
    }
  } else {
    const u = await prisma.user.update({ where: { id }, data: { deletedAt: new Date() } });
    await logAudit({ actorId: req.user?.id, targetUserId: id, action: 'ADMIN_USER_DELETE', meta: { hard: false } });
    return res.json({ ok: true, hardDeleted: false, user: redact(u) });
  }
});

// --- Audit list ---
router.get('/audit', async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit || '50', 10), 1), 200);
  const cursor = req.query.cursor ? { id: String(req.query.cursor) } : null;
  const action = (req.query.action || '').toString().trim();

  const where = action ? { action: action.toUpperCase() } : {};

  const rows = await prisma.auditLog.findMany({
    where,
    include: {
      actor: true, user: true, targetUser: true
    },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(cursor ? { cursor, skip: 1 } : {}),
  });

  let nextCursor = null;
  if (rows.length > limit) {
    const next = rows.pop();
    nextCursor = next?.id || null;
  }

  const items = rows.map(r => ({
    id: r.id,
    action: r.action,
    createdAt: r.createdAt,
    actor: r.actor ? { id: r.actor.id, username: r.actor.username, email: r.actor.email } : null,
    user: r.user ? { id: r.user.id, username: r.user.username, email: r.user.email } : null,
    targetUser: r.targetUser ? { id: r.targetUser.id, username: r.targetUser.username, email: r.targetUser.email } : null,
    meta: r.meta || null
  }));

  res.json({ items, nextCursor });
});

export default router;
