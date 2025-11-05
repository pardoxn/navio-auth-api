// navio-auth-api/src/routes/layout.routes.js
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const STORAGE_DIR = path.join(__dirname, "../../storage");
const CMR_FILE = path.join(STORAGE_DIR, "cmr-layout.json");

const PROJECT_ROOT = path.join(__dirname, "../../..");
const NAVIOAI_DIR = path.join(PROJECT_ROOT, "NavioAI");
const DATA_LAYOUT_FILE = path.join(NAVIOAI_DIR, "data", "cmr-layout.json");
const PUBLIC_LAYOUT_FILE = path.join(NAVIOAI_DIR, "public", "cmr-layout.json");

async function fileExists(fp) {
  try {
    await fs.access(fp);
    return true;
  } catch {
    return false;
  }
}

function hasFieldDefinitions(layout) {
  if (!layout || typeof layout !== "object") return false;
  const { fields } = layout;
  if (Array.isArray(fields)) return fields.length > 0;
  if (fields && typeof fields === "object") return Object.keys(fields).length > 0;
  return false;
}

async function readJsonIfExists(fp) {
  if (!(await fileExists(fp))) return null;
  try {
    const raw = await fs.readFile(fp, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function ensureStorage() {
  await fs.mkdir(STORAGE_DIR, { recursive: true });
  if (await fileExists(CMR_FILE)) return;

  const seed =
    (await readJsonIfExists(DATA_LAYOUT_FILE)) ||
    (await readJsonIfExists(PUBLIC_LAYOUT_FILE)) ||
    {
      pageWidth: 595.28,
      pageHeight: 841.89,
      backgroundPdfBase64: "",
      calibration: { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1, rotationDeg: 0 },
      fields: {},
    };

  await fs.writeFile(CMR_FILE, JSON.stringify(seed, null, 2), "utf8");
}

async function readLayout() {
  await ensureStorage();
  let layout = await readJsonIfExists(CMR_FILE);
  if (!hasFieldDefinitions(layout)) {
    const fallback =
      (await readJsonIfExists(DATA_LAYOUT_FILE)) ||
      (await readJsonIfExists(PUBLIC_LAYOUT_FILE));
    if (fallback && hasFieldDefinitions(fallback)) {
      layout = fallback;
      await fs.writeFile(CMR_FILE, JSON.stringify(layout, null, 2), "utf8");
    }
  }
  return layout;
}

router.get("/cmr", async (_req, res) => {
  try {
    const layout = await readLayout();
    res.json(layout);
  } catch (e) {
    console.error("CMR layout GET error", e);
    res.status(500).json({ error: "Layout konnte nicht geladen werden." });
  }
});

router.put("/cmr", express.json({ limit: "6mb" }), async (req, res) => {
  try {
    await ensureStorage();
    const payload = req.body || {};
    await fs.writeFile(CMR_FILE, JSON.stringify(payload, null, 2), "utf8");
    try {
      await fs.mkdir(path.dirname(DATA_LAYOUT_FILE), { recursive: true });
      await fs.writeFile(DATA_LAYOUT_FILE, JSON.stringify(payload, null, 2), "utf8");
    } catch (err) {
      console.warn("CMR layout PUT: could not update NavioAI/data copy", err);
    }
    res.json({ ok: true });
  } catch (e) {
    console.error("CMR layout PUT error", e);
    res.status(500).json({ error: "Layout konnte nicht gespeichert werden." });
  }
});

export default router;
