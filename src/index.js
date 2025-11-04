// navio-auth-api/src/index.js
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const {
  readUsers,
  writeUsers,
  ensureSeedUsers,
  findUserByEmailOrName,
  findUserById,
  upsertUser,
} = require("./store");

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
const COOKIE_NAME = "token";

app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());
app.use(cors({
  origin: (origin, cb) => cb(null, true),
  credentials: true,
}));

// Helpers
function sign(user) {
  return jwt.sign(
    { id: user.id, name: user.name, role: user.role, email: user.email || null },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}
function authRequired(req, res, next) {
  try {
    const raw = req.cookies[COOKIE_NAME];
    if (!raw) return res.status(401).json({ error: "unauthorized" });
    const payload = jwt.verify(raw, JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: "unauthorized" });
  }
}
function adminOnly(req, res, next) {
  if (req.user?.role !== "admin") return res.status(403).json({ error: "forbidden" });
  next();
}

// Boot: Seed users
ensureSeedUsers().then(() => {
  console.log("Seed ok (Admin/admin, Patrick/potti)");
});

// AUTH
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, name, username, password } = req.body || {};
    const identifier = email || name || username; // flexibel
    if (!identifier || !password) return res.status(400).json({ error: "missing credentials" });

    const user = await findUserByEmailOrName(identifier);
    if (!user) return res.status(401).json({ error: "invalid credentials" });
    const ok = await bcrypt.compare(password, user.passwordHash || "");
    if (!ok) return res.status(401).json({ error: "invalid credentials" });

    const token = sign(user);
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      maxAge: 7 * 24 * 3600 * 1000,
      path: "/",
    });
    res.json({ id: user.id, name: user.name, role: user.role, email: user.email || null });
  } catch (e) {
    res.status(500).json({ error: "login failed" });
  }
});

app.post("/api/auth/logout", (req, res) => {
  res.clearCookie(COOKIE_NAME, { path: "/" });
  res.json({ ok: true });
});

app.get("/api/auth/me", authRequired, async (req, res) => {
  const u = await findUserById(req.user.id);
  if (!u) return res.status(401).json({ error: "unauthorized" });
  res.json({ id: u.id, name: u.name, role: u.role, email: u.email || null });
});

// ADMIN: Users abrufen + Rolle setzen
app.get("/api/users", authRequired, adminOnly, async (req, res) => {
  const users = await readUsers();
  const safe = users.map(u => ({ id: u.id, name: u.name, email: u.email || null, role: u.role }));
  res.json(safe);
});

app.patch("/api/users/:id/role", authRequired, adminOnly, async (req, res) => {
  const { id } = req.params;
  const { role } = req.body || {};
  if (!["admin", "dispo", "lager"].includes(role)) {
    return res.status(400).json({ error: "invalid role" });
  }
  const u = await findUserById(id);
  if (!u) return res.status(404).json({ error: "not found" });
  u.role = role;
  await upsertUser(u);
  res.json({ id: u.id, name: u.name, email: u.email || null, role: u.role });
});

app.listen(PORT, () => {
  console.log(`Auth API running on http://localhost:${PORT}`);
});
