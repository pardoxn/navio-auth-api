import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), "../local_data");
const FILE = path.join(DATA_DIR, "tours2.json");

async function ensureFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(FILE);
  } catch {
    await fs.writeFile(FILE, JSON.stringify({ active: [], archive: [] }, null, 2), "utf8");
  }
}

export async function readTours2() {
  await ensureFile();
  const raw = await fs.readFile(FILE, "utf8");
  try {
    const parsed = JSON.parse(raw);
    return {
      active: Array.isArray(parsed?.active) ? parsed.active : [],
      archive: Array.isArray(parsed?.archive) ? parsed.archive : [],
    };
  } catch {
    return { active: [], archive: [] };
  }
}

async function writeTours2(data) {
  await ensureFile();
  await fs.writeFile(FILE, JSON.stringify(data, null, 2), "utf8");
}

function normalizeTour(tour, idx = 0) {
  const fallbackId = () => `tour-${idx}-${randomUUID()}`;
  const idCandidate = tour?.id ?? tour?.uuid ?? tour?._id ?? tour?.rowId ?? fallbackId();
  const nameCandidate = tour?.name || tour?.title || tour?.label || `Tour ${idx + 1}`;
  const orders = Array.isArray(tour?.orders) ? tour.orders : [];
  return {
    ...tour,
    id: String(idCandidate),
    name: nameCandidate,
    orders,
  };
}

export async function writeActive2(active = []) {
  const current = await readTours2();
  const filtered = (Array.isArray(active) ? active : []).filter(
    (tour) => Array.isArray(tour?.orders) && tour.orders.length > 0
  );
  const normalized = filtered.map((tour, idx) => normalizeTour(tour, idx));
  const next = {
    active: normalized,
    archive: Array.isArray(current.archive) ? current.archive : [],
  };
  await writeTours2(next);
  return next;
}

export async function markLoaded2(tourId, payload = {}) {
  const current = await readTours2();
  const idx = current.active.findIndex((tour) => String(tour?.id) === String(tourId));
  if (idx === -1) {
    return current;
  }

  const tour = current.active[idx];
  const now = new Date().toISOString();
  const loadImage = payload?.loadImage?.url
    ? {
        url: payload.loadImage.url,
        timestamp: payload.loadImage.timestamp || now,
      }
    : tour.loadImage || null;

  const moved = {
    ...tour,
    status: "archived",
    loadedAt: now,
    loadedBy: payload?.user?.name || payload?.user?.id || "unknown",
    loadImage,
    loadNote: payload?.note || null,
  };

  current.active.splice(idx, 1);
  current.archive = [moved, ...(Array.isArray(current.archive) ? current.archive : [])];
  await writeTours2(current);
  return current;
}

export async function markUnloaded2(tourId, payload = {}) {
  const current = await readTours2();
  const idx = current.archive.findIndex((tour) => String(tour?.id) === String(tourId));
  if (idx === -1) {
    return current;
  }

  const tour = current.archive[idx];
  const now = new Date().toISOString();
  const restored = {
    ...tour,
    status: "active",
    unloadedAt: now,
    unloadedBy: payload?.user?.name || payload?.user?.id || "unknown",
  };

  current.archive.splice(idx, 1);
  current.active = [restored, ...(Array.isArray(current.active) ? current.active : [])];
  await writeTours2(current);
  return current;
}
