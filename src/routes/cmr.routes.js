// navio-auth-api/src/routes/cmr.routes.js
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const STORAGE_DIR = path.join(__dirname, '../../storage');
const LAYOUT_FILE = path.join(STORAGE_DIR, 'cmr-layout.json');

async function ensureStorage() {
  await fs.mkdir(STORAGE_DIR, { recursive: true });
  try { await fs.access(LAYOUT_FILE); }
  catch { await fs.writeFile(LAYOUT_FILE, JSON.stringify({ version: 1, fields: {} }, null, 2)); }
}

router.get('/layout', async (_req, res) => {
  try {
    await ensureStorage();
    const raw = await fs.readFile(LAYOUT_FILE, 'utf8');
    res.json(JSON.parse(raw));
  } catch (e) {
    console.error('CMR GET error', e);
    res.status(500).json({ error: 'Layout konnte nicht geladen werden.' });
  }
});

router.put('/layout', express.json({ limit: '1mb' }), async (req, res) => {
  try {
    await ensureStorage();
    const payload = req.body || {};
    await fs.writeFile(LAYOUT_FILE, JSON.stringify(payload, null, 2));
    res.json({ ok: true });
  } catch (e) {
    console.error('CMR PUT error', e);
    res.status(500).json({ error: 'Layout konnte nicht gespeichert werden.' });
  }
});

export default router;
