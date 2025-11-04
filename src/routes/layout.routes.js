// navio-auth-api/src/routes/layout.routes.js
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const STORAGE_DIR = path.join(__dirname, '../../storage');
const CMR_FILE = path.join(STORAGE_DIR, 'cmr-layout.json');

async function ensureStorage() {
  await fs.mkdir(STORAGE_DIR, { recursive: true });
  try { await fs.access(CMR_FILE); }
  catch {
    await fs.writeFile(
      CMR_FILE,
      JSON.stringify({ pageWidth: 595.28, pageHeight: 841.89, backgroundPdfBase64: "", calibration:{offsetX:0,offsetY:0,scaleX:1,scaleY:1,rotationDeg:0}, fields:{} }, null, 2)
    );
  }
}

// GET /api/layout/cmr
router.get('/cmr', async (_req, res) => {
  try {
    await ensureStorage();
    const raw = await fs.readFile(CMR_FILE, 'utf8');
    res.json(JSON.parse(raw));
  } catch (e) {
    console.error('CMR layout GET error', e);
    res.status(500).json({ error: 'Layout konnte nicht geladen werden.' });
  }
});

// PUT /api/layout/cmr
router.put('/cmr', express.json({ limit: '5mb' }), async (req, res) => {
  try {
    await ensureStorage();
    const payload = req.body || {};
    await fs.writeFile(CMR_FILE, JSON.stringify(payload, null, 2), 'utf8');
    res.json({ ok: true });
  } catch (e) {
    console.error('CMR layout PUT error', e);
    res.status(500).json({ error: 'Layout konnte nicht gespeichert werden.' });
  }
});

export default router;
