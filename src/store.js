// navio-auth-api/src/store.js
const path = require("path");
const fs = require("fs-extra");
const bcrypt = require("bcryptjs");

const DATA_DIR = path.join(__dirname, "..", "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");

async function ensureDataDir() {
  await fs.ensureDir(DATA_DIR);
}

async function readUsers() {
  await ensureDataDir();
  if (!(await fs.pathExists(USERS_FILE))) return [];
  const raw = await fs.readFile(USERS_FILE, "utf8");
  try { return JSON.parse(raw) || []; } catch { return []; }
}

async function writeUsers(users) {
  await ensureDataDir();
  await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2), "utf8");
}

async function findUserByEmailOrName(identifier) {
  const users = await readUsers();
  return users.find(u =>
    (u.email && u.email.toLowerCase() === String(identifier || "").toLowerCase()) ||
    (u.name && u.name.toLowerCase() === String(identifier || "").toLowerCase())
  );
}

async function findUserById(id) {
  const users = await readUsers();
  return users.find(u => u.id === id);
}

async function upsertUser(user) {
  const users = await readUsers();
  const idx = users.findIndex(u => u.id === user.id);
  if (idx >= 0) users[idx] = user; else users.push(user);
  await writeUsers(users);
  return user;
}

async function ensureSeedUsers() {
  await ensureDataDir();
  const users = await readUsers();
  let changed = false;

  // Admin (falls nicht vorhanden)
  if (!users.some(u => u.role === "admin")) {
    const hash = await bcrypt.hash("admin", 10);
    users.push({
      id: "u_admin",
      name: "Admin",
      email: "admin@example.com",
      passwordHash: hash,
      role: "admin",
      createdAt: new Date().toISOString(),
    });
    changed = true;
  }

  // Patrick (lager)
  if (!users.some(u => u.name?.toLowerCase() === "patrick")) {
    const hash = await bcrypt.hash("potti", 10);
    users.push({
      id: "u_patrick",
      name: "Patrick",
      email: "patrick@example.com",
      passwordHash: hash,
      role: "lager",
      createdAt: new Date().toISOString(),
    });
    changed = true;
  }

  if (changed) await writeUsers(users);
  return users;
}

module.exports = {
  readUsers,
  writeUsers,
  findUserByEmailOrName,
  findUserById,
  upsertUser,
  ensureSeedUsers,
};
