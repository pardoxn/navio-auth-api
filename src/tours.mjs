import fs from "fs/promises";
import path from "path";
const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), "../local_data");
const FILE = path.join(DATA_DIR, "tours.json");
async function ensureFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try { await fs.access(FILE); }
  catch { await fs.writeFile(FILE, JSON.stringify({ active: [], archive: [] }, null, 2), "utf8"); }
}
export async function readTours() {
  await ensureFile();
  const raw = await fs.readFile(FILE, "utf8");
  try { return JSON.parse(raw); } catch { return { active: [], archive: [] }; }
}
async function writeTours(data) {
  await ensureFile();
  await fs.writeFile(FILE, JSON.stringify(data, null, 2), "utf8");
}
export async function setActiveTours(active = []) {
  const cur = await readTours();
  cur.active = Array.isArray(active) ? active : [];
  await writeTours(cur);
  return cur;
}
export async function markTourLoaded(tourId, payload = {}) {
  const cur = await readTours();
  const idx = cur.active.findIndex(t => String(t.id) === String(tourId));
  if (idx === -1) return cur;
  const tour = cur.active[idx];
  const stamped = { ...tour, loadedAt: new Date().toISOString(), loadMeta: { note: payload?.note || null, photo: payload?.photo || null } };
  cur.active.splice(idx, 1);
  cur.archive.unshift(stamped);
  await writeTours(cur);
  return cur;
}
