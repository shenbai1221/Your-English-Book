/* 纸页单词本 - Cloudflare Worker 后端（账号 / 云同步 / 学习计划） */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  username TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sync_items (
  user_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  item_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, kind, item_id)
);
CREATE TABLE IF NOT EXISTS plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  book_id TEXT NOT NULL,
  daily_goal INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS picks (
  plan_id INTEGER NOT NULL,
  day TEXT NOT NULL,
  word TEXT NOT NULL,
  PRIMARY KEY (plan_id, day, word)
);
`;

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64urlEncode(str) {
  const bytes = enc.encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function hex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function unhex(s) {
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
}
function randBytes(n) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return a;
}
function constEq(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt, iterations: iterations, hash: 'SHA-256' },
    key,
    256
  );
  return hex(new Uint8Array(bits));
}
async function hashPassword(password) {
  const salt = randBytes(16);
  /* Workers 免费版 CPU 限制 10ms，PBKDF2 迭代数需控制在预算内 */
  const iterations = 10000;
  return 'pbkdf2$' + iterations + '$' + hex(salt) + '$' + (await pbkdf2(password, salt, iterations));
}
async function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iterations = Math.max(1000, Math.min(100000, parseInt(parts[1], 10) || 10000));
  try {
    const salt = unhex(parts[2]);
    const expect = parts[3];
    const got = await pbkdf2(password, salt, iterations);
    return constEq(expect, got);
  } catch (e) {
    return false;
  }
}

async function sha256Hex(s) {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(s));
  return hex(new Uint8Array(digest));
}
async function createSession(db, user) {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const token = b64urlEncode(String.fromCharCode.apply(null, bytes));
  const hash = await sha256Hex(token);
  await db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(Date.now()).run();
  await db.prepare('INSERT INTO sessions (token_hash, user_id, username, created_at, expires_at) VALUES (?,?,?,?,?)')
    .bind(hash, user.id, user.username, Date.now(), Date.now() + 30 * 24 * 3600 * 1000).run();
  return token;
}

let schemaPromise = null;
function ensureSchema(env) {
  if (!schemaPromise) {
    schemaPromise = env.DB.exec(SCHEMA).catch((e) => {
      schemaPromise = null;
      throw e;
    });
  }
  return schemaPromise;
}

const authHits = new Map();
function rateLimit(ip, key, max, windowMs) {
  const k = ip + '|' + key;
  const now = Date.now();
  const arr = (authHits.get(k) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) return false;
  arr.push(now);
  authHits.set(k, arr);
  if (authHits.size > 5000) {
    for (const [kk, v] of authHits) {
      if (now - v[v.length - 1] > 3600000) authHits.delete(kk);
    }
  }
  return true;
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type',
    'Access-Control-Max-Age': '86400'
  };
}
function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: Object.assign(
      { 'Content-Type': 'application/json; charset=utf-8', 'X-Api-Version': '2' },
      corsHeaders()
    )
  });
}
function err(message, status) {
  return json({ error: message }, status || 400);
}

function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

async function authUser(request, env) {
  const h = request.headers.get('Authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return null;
  const hash = await sha256Hex(token);
  const row = env.DB.prepare('SELECT user_id, username FROM sessions WHERE token_hash=? AND expires_at>?')
    .bind(hash, Date.now()).first();
  return row ? { id: Number(row.user_id), username: row.username } : null;
}

function getSync(db, uid, kind, id) {
  return db.prepare('SELECT payload, updated_at FROM sync_items WHERE user_id=? AND kind=? AND item_id=?').bind(uid, kind, id).first();
}
function upsertSyncStmt(db, uid, kind, id, payload, ts) {
  return db.prepare(
    'INSERT INTO sync_items (user_id, kind, item_id, payload, updated_at) VALUES (?,?,?,?,?) ' +
    'ON CONFLICT(user_id, kind, item_id) DO UPDATE SET payload=excluded.payload, updated_at=excluded.updated_at ' +
    'WHERE excluded.updated_at >= sync_items.updated_at'
  ).bind(uid, kind, id, payload, ts);
}
function setSync(db, uid, kind, id, payload, ts) {
  return upsertSyncStmt(db, uid, kind, id, payload, ts).run();
}
function allSync(db, uid, kind) {
  return db.prepare('SELECT payload FROM sync_items WHERE user_id=? AND kind=? ORDER BY item_id').bind(uid, kind).all()
    .results.map((r) => JSON.parse(r.payload));
}
function mergedSettings(db, uid, incoming) {
  const row = getSync(db, uid, 'settings', 'main');
  const cur = row ? JSON.parse(row.payload) : {};
  const next = Object.assign({}, cur);
  if (incoming && typeof incoming === 'object') {
    for (const k of ['accent', 'defMode', 'readSize', 'theme', 'switchStyle', 'switchSpeed']) {
      if (incoming[k] !== undefined && incoming[k] !== null) next[k] = incoming[k];
    }
  }
  next.updatedAt = Math.max(Number(next.updatedAt) || 0, Number((incoming && incoming.updatedAt) || 0));
  setSync(db, uid, 'settings', 'main', JSON.stringify(next), next.updatedAt || Date.now());
  return next;
}

async function handleApi(request, env, url) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const path = url.pathname;
  const method = request.method;

  if (method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders() });

  if (path === '/api/health') return json({ ok: true, time: Date.now() });

  if (path === '/api/auth/register' && method === 'POST') {
    if (!rateLimit(ip, 'auth', 20, 15 * 60 * 1000)) return err('尝试过于频繁，请稍后再试', 429);
    const body = await request.json().catch(() => ({}));
    const username = String(body.username || '').trim();
    const password = String(body.password || '');
    if (!/^[a-zA-Z0-9_\u4e00-\u9fa5]{2,20}$/.test(username)) return err('用户名需为 2-20 位字母、数字、下划线或中文');
    if (password.length < 6) return err('密码至少 6 位');
    await ensureSchema(env);
    const exists = env.DB.prepare('SELECT id FROM users WHERE username=?').bind(username).first();
    if (exists) return err('用户名已存在', 409);
    const hash = await hashPassword(password);
    const info = await env.DB.prepare('INSERT INTO users (username, password_hash, created_at) VALUES (?,?,?)')
      .bind(username, hash, Date.now()).run();
    const user = { id: Number(info.meta.last_row_id), username: username };
    const token = await createSession(env.DB, user);
    return json({ token: token, user: user });
  }

  if (path === '/api/auth/login' && method === 'POST') {
    if (!rateLimit(ip, 'auth', 20, 15 * 60 * 1000)) return err('尝试过于频繁，请稍后再试', 429);
    const body = await request.json().catch(() => ({}));
    const username = String(body.username || '').trim();
    const password = String(body.password || '');
    await ensureSchema(env);
    const row = env.DB.prepare('SELECT * FROM users WHERE username=?').bind(username).first();
    if (!row || !(await verifyPassword(password, row.password_hash))) return err('用户名或密码错误', 401);
    const user = { id: Number(row.id), username: row.username };
    const token = await createSession(env.DB, user);
    return json({ token: token, user: user });
  }

  const user = await authUser(request, env);
  if (!user) return err('未登录', 401);
  const uid = Number(user.id);

  if (path === '/api/user/me' && method === 'GET') {
    return json({ user: { id: user.id, username: user.username } });
  }

  if (path === '/api/sync' && method === 'GET') {
    await ensureSchema(env);
    const row = getSync(env.DB, uid, 'settings', 'main');
    return json({
      mastery: allSync(env.DB, uid, 'mastery'),
      customBooks: allSync(env.DB, uid, 'book'),
      settings: row ? JSON.parse(row.payload) : {}
    });
  }

  if (path === '/api/sync' && method === 'PUT') {
    await ensureSchema(env);
    const body = await request.json().catch(() => ({}));
    const mastery = Array.isArray(body.mastery) ? body.mastery : [];
    const customBooks = Array.isArray(body.customBooks) ? body.customBooks : [];
    const stmts = [];
    for (const rec of mastery) {
      if (!rec || typeof rec.id !== 'string') continue;
      stmts.push(upsertSyncStmt(env.DB, uid, 'mastery', rec.id, JSON.stringify(rec), Number(rec.updatedAt) || 0));
    }
    for (const b of customBooks) {
      if (!b || typeof b.id !== 'string') continue;
      stmts.push(upsertSyncStmt(env.DB, uid, 'book', b.id, JSON.stringify(b), Number(b.updatedAt) || 0));
    }
    if (stmts.length) await env.DB.batch(stmts);
    const settings = mergedSettings(env.DB, uid, body.settings);
    return json({
      mastery: allSync(env.DB, uid, 'mastery'),
      customBooks: allSync(env.DB, uid, 'book'),
      settings: settings
    });
  }

  if (path === '/api/plans' && method === 'GET') {
    await ensureSchema(env);
    const plans = env.DB.prepare('SELECT * FROM plans WHERE user_id=? ORDER BY created_at').bind(uid).all()
      .results.map((p) => ({ id: p.id, bookId: p.book_id, dailyGoal: p.daily_goal, createdAt: p.created_at }));
    return json({ plans: plans });
  }

  if (path === '/api/plans' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const bookId = String(body.bookId || '').trim();
    const dailyGoal = Math.max(1, Math.min(200, parseInt(body.dailyGoal, 10) || 10));
    if (!bookId) return err('缺少词本');
    await ensureSchema(env);
    const info = await env.DB.prepare('INSERT INTO plans (user_id, book_id, daily_goal, created_at) VALUES (?,?,?,?)')
      .bind(uid, bookId, dailyGoal, Date.now()).run();
    return json({ plan: { id: Number(info.meta.last_row_id), bookId: bookId, dailyGoal: dailyGoal, createdAt: Date.now() } });
  }

  const planMatch = path.match(/^\/api\/plans\/(\d+)(\/today)?$/);
  if (planMatch) {
    const planId = Number(planMatch[1]);
    const isToday = !!planMatch[2];
    await ensureSchema(env);
    const p = env.DB.prepare('SELECT * FROM plans WHERE id=? AND user_id=?').bind(planId, uid).first();
    if (!p) return err('计划不存在', 404);

    if (isToday) {
      if (method === 'GET') {
        const day = String(url.searchParams.get('day') || today());
        const rows = env.DB.prepare('SELECT word FROM picks WHERE plan_id=? AND day=? ORDER BY rowid').bind(planId, day).all();
        return json({ day: day, words: rows.results.map((r) => r.word) });
      }
      if (method === 'PUT') {
        const body = await request.json().catch(() => ({}));
        const day = String(body.day || today());
        const words = Array.isArray(body.words) ? body.words.filter((w) => typeof w === 'string').slice(0, 300) : [];
        await env.DB.prepare('DELETE FROM picks WHERE plan_id=? AND day=?').bind(planId, day).run();
        const ins = env.DB.prepare('INSERT OR IGNORE INTO picks (plan_id, day, word) VALUES (?,?,?)');
        const pickStmts = [];
        for (const w of words) pickStmts.push(ins.bind(planId, day, w));
        if (pickStmts.length) await env.DB.batch(pickStmts);
        return json({ day: day, words: words });
      }
    } else {
      if (method === 'PUT') {
        const body = await request.json().catch(() => ({}));
        const dailyGoal = Math.max(1, Math.min(200, parseInt(body.dailyGoal, 10) || 10));
        const info = await env.DB.prepare('UPDATE plans SET daily_goal=? WHERE id=? AND user_id=?').bind(dailyGoal, planId, uid).run();
        if (info.meta.changes === 0) return err('计划不存在', 404);
        const updated = env.DB.prepare('SELECT * FROM plans WHERE id=?').bind(planId).first();
        return json({ plan: { id: updated.id, bookId: updated.book_id, dailyGoal: updated.daily_goal, createdAt: updated.created_at } });
      }
      if (method === 'DELETE') {
        await env.DB.prepare('DELETE FROM picks WHERE plan_id=?').bind(planId).run();
        await env.DB.prepare('DELETE FROM plans WHERE id=? AND user_id=?').bind(planId, uid).run();
        return json({ ok: true });
      }
    }
  }

  return err('接口不存在', 404);
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (url.pathname.startsWith('/api/')) return handleApi(request, env, url);
      return env.ASSETS.fetch(request);
    } catch (e) {
      return json({ error: '服务器内部错误', detail: String((e && e.message) || e) }, 500);
    }
  }
};
