import { turso, verifyPassword, makeSessionCookie, clearSessionCookie, readSession } from "../_lib/db.js";

const json = (data, init = {}) => new Response(JSON.stringify(data), { ...init, headers: { "Content-Type": "application/json", ...(init.headers || {}) } });
const err = (message, status = 400) => json({ error: message }, { status });

// Un solo archivo decide la ruta leyendo params.path (todo lo que viene después de /api/).
export async function onRequest({ request, env, params }) {
  const path = (params.path || []).join("/");
  const method = request.method;
  try {
    // ---------- Público ----------
    if (path === "public/menu" && method === "GET") return getMenu(env);
    if (path === "public/settings" && method === "GET") return getSettings(env);
    if (path === "reservations" && method === "POST") return createReservation(request, env);
    if (path === "login" && method === "POST") return login(request, env);
    if (path === "session" && method === "GET") return getSession(request, env);
    if (path === "session" && method === "DELETE") return json(null, { headers: { "Set-Cookie": clearSessionCookie() } });

    // ---------- Admin: reservas ----------
    if (path === "admin/reservations" && method === "GET") return getAdminReservations(request, env);
    let m = /^admin\/reservations\/(\d+)$/.exec(path);
    if (m && method === "PATCH") return updateReservation(request, env, Number(m[1]));
    if (m && method === "DELETE") return deleteReservation(request, env, Number(m[1]));

    // ---------- Admin: menú ----------
    if (path === "admin/menu" && method === "GET") return getAdminMenu(request, env);
    if (path === "admin/menu" && method === "POST") return createMenuItem(request, env);
    m = /^admin\/menu\/(\d+)$/.exec(path);
    if (m && method === "PATCH") return updateMenuItem(request, env, Number(m[1]));
    if (m && method === "DELETE") return deleteMenuItem(request, env, Number(m[1]));

    // ---------- Admin: personalización ----------
    if (path === "admin/settings" && method === "PATCH") return updateSettings(request, env);
  } catch (e) {
    return err("server", 500);
  }
  return err("not_found", 404);
}

async function requireAdmin(request, env) {
  return await readSession(env, request.headers.get("Cookie"));
}

// =====================================================================
// PÚBLICO
// =====================================================================
async function getMenu(env) {
  const { rows } = await turso(env,
    "SELECT id, name, description, price, category FROM menu_items WHERE available = 1 ORDER BY category, sort_order, id");
  return json(rows);
}

async function getSettings(env) {
  const { rows } = await turso(env, "SELECT key, value FROM site_settings");
  return json(Object.fromEntries(rows.map((r) => [r.key, r.value])));
}

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin O/0/I/1
const genCode = () => Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");

async function uniqueCode(env) {
  let code = genCode();
  for (let i = 0; i < 5; i++) {
    const { rows } = await turso(env, "SELECT 1 FROM reservations WHERE code = ?", [code]);
    if (!rows.length) break;
    code = genCode();
  }
  return code;
}

async function createReservation(request, env) {
  const b = await request.json().catch(() => null);
  if (!b) return err("data");
  const name = String(b.name || "").trim();
  const date = String(b.date || "").trim();
  const time = String(b.time || "").trim();
  const guests = Math.max(1, Math.min(15, Number(b.guests) || 1));
  const email = String(b.email || "").trim();
  const today = new Date().toISOString().slice(0, 10);
  if (name.length < 2 || name.length > 60 || !date || date < today || !time) return err("data");

  const code = await uniqueCode(env);
  await turso(env,
    `INSERT INTO reservations (code, name, email, date, time, guests, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', datetime('now'))`,
    [code, name, email, date, time, guests]);
  return json({ code });
}

// =====================================================================
// LOGIN / SESIÓN
// =====================================================================
async function login(request, env) {
  const { email, password } = await request.json().catch(() => ({}));
  const { rows } = await turso(env, "SELECT id, name, password_hash FROM admins WHERE email = ?", [String(email || "").trim().toLowerCase()]);
  const admin = rows[0];
  if (!admin || !(await verifyPassword(password || "", admin.password_hash))) return err("Correo o contraseña incorrectos.", 401);
  return json({ name: admin.name }, { headers: { "Set-Cookie": await makeSessionCookie(env, admin.id) } });
}

async function getSession(request, env) {
  const adminId = await readSession(env, request.headers.get("Cookie"));
  if (!adminId) return json({ name: null });
  const { rows } = await turso(env, "SELECT name FROM admins WHERE id = ?", [adminId]);
  return json({ name: rows[0]?.name || null });
}

// =====================================================================
// ADMIN: RESERVAS
// =====================================================================
async function getAdminReservations(request, env) {
  if (!(await requireAdmin(request, env))) return err("auth", 401);
  const { rows } = await turso(env, "SELECT * FROM reservations ORDER BY date DESC, time DESC");
  return json(rows);
}

async function updateReservation(request, env, id) {
  if (!(await requireAdmin(request, env))) return err("auth", 401);
  const { status } = await request.json().catch(() => ({}));
  if (!["pending", "confirmed", "cancelled"].includes(status)) return err("data");
  await turso(env, "UPDATE reservations SET status = ? WHERE id = ?", [status, id]);
  return json({ ok: true });
}

async function deleteReservation(request, env, id) {
  if (!(await requireAdmin(request, env))) return err("auth", 401);
  await turso(env, "DELETE FROM reservations WHERE id = ?", [id]);
  return json({ ok: true });
}

// =====================================================================
// ADMIN: MENÚ
// =====================================================================
async function getAdminMenu(request, env) {
  if (!(await requireAdmin(request, env))) return err("auth", 401);
  const { rows } = await turso(env, "SELECT * FROM menu_items ORDER BY category, sort_order, id");
  return json(rows);
}

function validMenuBody(b) {
  const name = String(b?.name || "").trim();
  const price = Number(b?.price);
  if (!name || name.length > 80 || !Number.isFinite(price) || price < 0 || price > 2000000) return "data";
  return null;
}

async function createMenuItem(request, env) {
  if (!(await requireAdmin(request, env))) return err("auth", 401);
  const b = await request.json().catch(() => null);
  const bad = validMenuBody(b);
  if (bad) return err(bad);
  const { lastInsertRowid: id } = await turso(env,
    "INSERT INTO menu_items (name, description, price, category, sort_order, available) VALUES (?, ?, ?, ?, ?, ?)",
    [b.name.trim(), b.description || "", Number(b.price), b.category || "General", Number(b.sort_order) || 0, b.available === false ? 0 : 1]);
  return json({ id });
}

async function updateMenuItem(request, env, id) {
  if (!(await requireAdmin(request, env))) return err("auth", 401);
  const b = await request.json().catch(() => null);
  const bad = validMenuBody(b);
  if (bad) return err(bad);
  await turso(env,
    "UPDATE menu_items SET name = ?, description = ?, price = ?, category = ?, sort_order = ?, available = ? WHERE id = ?",
    [b.name.trim(), b.description || "", Number(b.price), b.category || "General", Number(b.sort_order) || 0, b.available === false ? 0 : 1, id]);
  return json({ ok: true });
}

async function deleteMenuItem(request, env, id) {
  if (!(await requireAdmin(request, env))) return err("auth", 401);
  await turso(env, "DELETE FROM menu_items WHERE id = ?", [id]);
  return json({ ok: true });
}

// =====================================================================
// ADMIN: PERSONALIZACIÓN
// =====================================================================
async function updateSettings(request, env) {
  if (!(await requireAdmin(request, env))) return err("auth", 401);
  const { set } = await request.json().catch(() => ({}));
  for (const [key, value] of Object.entries(set || {})) {
    await turso(env, "INSERT INTO site_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [key, String(value)]);
  }
  return json({ ok: true });
}
