import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { v4 as uuidv4 } from "uuid";
import fs from "fs/promises";
import fssync from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_DIR = path.join(__dirname, "..", ".."); // .../Navio Software
const DATA_ROOT = path.join(BASE_DIR, "local_data");
const AUTH_DIR = path.join(DATA_ROOT, "auth");
const USERS_FILE = path.join(AUTH_DIR, "users.json");

const app = express();
const PORT = process.env.PORT || 3001;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`[auth] Auth API running on http://localhost:${PORT}`);
});


app.use(express.json());
app.use(cookieParser());
app.use(cors({
  origin: ["http://localhost:5173","http://127.0.0.1:5173","http://192.168.15.41:5173"],
  credentials: true
}));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});



async function ensureDir(p){ await fs.mkdir(p,{recursive:true}); }
async function readJsonSafe(fp){ try{ return JSON.parse(await fs.readFile(fp,"utf8")); } catch { return null; } }
async function writeJson(fp, data){ await ensureDir(path.dirname(fp)); await fs.writeFile(fp, JSON.stringify(data,null,2)); }

const sessions = new Map();

async function loadUsers(){
  let users = await readJsonSafe(USERS_FILE);
  if(!users){
    users = [
      { username:"admin",   password:"admin123", roles:["admin","dispo","lager"] },
      { username:"dispo",   password:"dispo123", roles:["dispo"] },
      { username:"patrick", password:"potti",    roles:["lager"] } // <- dein Lager-User
    ];
    await writeJson(USERS_FILE, users);
  }
  return users;
}
async function saveUsers(users){ await writeJson(USERS_FILE, users); }
let USERS = await loadUsers();

function setAuthCookie(res, token){
  res.cookie("navio_token", token, {
    httpOnly: true, sameSite: "lax", secure: false, path: "/", maxAge: 1000*60*60*8
  });
}
function clearAuthCookie(res){ res.clearCookie("navio_token", { path: "/" }); }
function getUserFromReq(req){ const t=req.cookies?.navio_token; return t ? (sessions.get(t)||null) : null; }
function requireRole(role){
  return (req,res,next)=>{
    const u = getUserFromReq(req);
    if(!u || !u.roles?.includes(role)) return res.status(403).json({error:"forbidden"});
    next();
  };
}

app.get("/health", (_req,res)=>res.json({ ok:true, usersFile: USERS_FILE }));

app.post("/api/auth/login", (req,res)=>{
  const { username, password } = req.body || {};
  const u = USERS.find(x => x.username===username && x.password===password);
  if(!u) return res.status(401).json({ error:"invalid_credentials" });
  const token = uuidv4();
  sessions.set(token, { username: u.username, roles: u.roles });
  setAuthCookie(res, token);
  res.json({ ok:true, user:{ username:u.username, roles:u.roles } });
});

app.get("/api/auth/me", (req,res)=>{
  const u = getUserFromReq(req);
  if(!u) return res.status(401).json({ error:"unauthorized" });
  res.json({ user: u });
});

app.post("/api/auth/logout", (req,res)=>{
  const token = req.cookies?.navio_token;
  if(token) sessions.delete(token);
  clearAuthCookie(res);
  res.json({ ok:true });
});

// Admin – Benutzer verwalten
const respondUsers = (_req,res)=>{
  res.json({ users: USERS.map(({password, ...rest})=>rest) });
};
const upsertUser = async (req,res)=>{
  try{
    const { username, password, roles } = req.body || {};
    if(!username || !Array.isArray(roles)) return res.status(400).json({ error:"username_and_roles_required" });
    const idx = USERS.findIndex(u=>u.username===username);
    if(idx>=0){
      if(password) USERS[idx].password = password;
      USERS[idx].roles = roles;
    } else {
      USERS.push({ username, password: password||"changeme", roles });
    }
    await saveUsers(USERS);
    res.json({ ok:true });
  }catch(e){
    console.error("users save error", e);
    res.status(500).json({ error:"users_save_failed" });
  }
};
app.get("/api/users", requireRole("admin"), respondUsers);
app.get("/api/auth/users", requireRole("admin"), respondUsers);
app.post("/api/users", requireRole("admin"), upsertUser);
app.post("/api/auth/users", requireRole("admin"), upsertUser);

app.listen(PORT, ()=>{
  console.log(`[auth] Auth API running on http://localhost:${PORT}`);
  console.log(`[auth] Users DB: ${USERS_FILE}`);
});
