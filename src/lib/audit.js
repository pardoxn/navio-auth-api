// src/lib/audit.js
import { prisma } from './prisma.js';

export async function logAudit({ actorId = null, userId = null, targetUserId = null, action, meta = null }) {
  try {
    await prisma.auditLog.create({
      data: { actorId, userId, targetUserId, action, meta }
    });
  } catch (e) {
    // bewusst still – Audit darf App-Flow nicht brechen
    console.warn('[audit] failed:', e?.message || e);
  }
}
