import { turso, verifyPassword, makeSessionCookie, clearSessionCookie, readSession, uploadImage, deleteImageByUrl } from "../_lib/db.js";

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
    if (path === "admin/upload" && method === "POST") return uploadMenuImage(request, env);
    if (path === "admin/menu" && method === "GET") return getAdminMenu(request, env);
    if (path === "admin/menu" && method === "POST") return createMenuItem(request, env);
    m = /^admin\/menu\/(\d+)$/.exec(path);
    if (m && method === "PATCH") return updateMenuItem(request, env, Number(m[1]));
    if (m && method === "DELETE") return deleteMenuItem(request, env, Number(m[1]));

    // ---------- Admin: secciones del menú (categorías) ----------
    if (path === "admin/categories" && method === "GET") return getAdminCategories(request, env);
    if (path === "admin/categories" && method === "POST") return createCategory(request, env);
    m = /^admin\/categories\/(\d+)$/.exec(path);
    if (m && method === "PATCH") return updateCategory(request, env, Number(m[1]));
    if (m && method === "DELETE") return deleteCategory(request, env, Number(m[1]));

    // ---------- Admin: personalización ----------
    if (path === "admin/settings" && method === "PATCH") return updateSettings(request, env);

    // ---------- Público: pedidos (generan venta) ----------
    if (path === "orders" && method === "POST") return createOrder(request, env);

    // ---------- Admin: pedidos web (ventas) ----------
    if (path === "admin/orders" && method === "GET") return getAdminOrders(request, env);
    m = /^admin\/orders\/(\d+)$/.exec(path);
    if (m && method === "PATCH") return updateOrderStatus(request, env, Number(m[1]));
    if (m && method === "DELETE") return deleteOrder(request, env, Number(m[1]));

    // ---------- Admin: ventas de caja (en físico) ----------
    if (path === "admin/manual-sales" && method === "GET") return getManualSales(request, env);
    if (path === "admin/manual-sales" && method === "POST") return createManualSale(request, env);
    m = /^admin\/manual-sales\/(\d+)$/.exec(path);
    if (m && method === "DELETE") return deleteManualSale(request, env, Number(m[1]));

    // ---------- Admin: gastos ----------
    if (path === "admin/expenses" && method === "GET") return getExpenses(request, env);
    if (path === "admin/expenses" && method === "POST") return createExpense(request, env);
    m = /^admin\/expenses\/(\d+)$/.exec(path);
    if (m && method === "DELETE") return deleteExpense(request, env, Number(m[1]));
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
    `SELECT m.id, m.name, m.description, m.price, m.category, m.image_url
     FROM menu_items m
     LEFT JOIN menu_categories c ON c.name = m.category
     WHERE m.available = 1
     ORDER BY COALESCE(c.sort_order, 999), m.category, m.sort_order, m.id`);
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
  const { rows } = await turso(env,
    `SELECT m.* FROM menu_items m
     LEFT JOIN menu_categories c ON c.name = m.category
     ORDER BY COALESCE(c.sort_order, 999), m.category, m.sort_order, m.id`);
  return json(rows);
}

async function uploadMenuImage(request, env) {
  if (!(await requireAdmin(request, env))) return err("auth", 401);
  const form = await request.formData().catch(() => null);
  const file = form?.get("image");
  if (!file || typeof file === "string") return err("data");
  if (file.size > 5 * 1024 * 1024) return err("La imagen no puede pesar más de 5 MB.");
  try {
    const url = await uploadImage(env, file);
    return json({ url });
  } catch (e) {
    return err("No se pudo subir la imagen. Revisa la configuración de R2.", 500);
  }
}

function validMenuBody(b) {
  const name = String(b?.name || "").trim();
  const price = Number(b?.price);
  const category = String(b?.category || "").trim();
  if (!name || name.length > 80 || !Number.isFinite(price) || price < 0 || price > 2000000) return "data";
  if (!category || category.length > 40) return "Selecciona una sección del menú.";
  return null;
}

async function createMenuItem(request, env) {
  if (!(await requireAdmin(request, env))) return err("auth", 401);
  const b = await request.json().catch(() => null);
  const bad = validMenuBody(b);
  if (bad) return err(bad);
  const category = b.category.trim();
  const { rows: catRows } = await turso(env, "SELECT 1 FROM menu_categories WHERE name = ?", [category]);
  if (!catRows.length) return err("Esa sección no existe. Créala primero en la pestaña Secciones.");
  const { lastInsertRowid: id } = await turso(env,
    "INSERT INTO menu_items (name, description, price, category, sort_order, available, image_url) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [b.name.trim(), b.description || "", Number(b.price), category, Number(b.sort_order) || 0, b.available === false ? 0 : 1, b.image_url || null]);
  return json({ id });
}

async function updateMenuItem(request, env, id) {
  if (!(await requireAdmin(request, env))) return err("auth", 401);
  const b = await request.json().catch(() => null);
  const bad = validMenuBody(b);
  if (bad) return err(bad);
  const category = b.category.trim();
  const { rows: catRows } = await turso(env, "SELECT 1 FROM menu_categories WHERE name = ?", [category]);
  if (!catRows.length) return err("Esa sección no existe. Créala primero en la pestaña Secciones.");

  const { rows: current } = await turso(env, "SELECT image_url FROM menu_items WHERE id = ?", [id]);
  const oldImage = current[0]?.image_url;
  if (oldImage && oldImage !== (b.image_url || null)) await deleteImageByUrl(env, oldImage);

  await turso(env,
    "UPDATE menu_items SET name = ?, description = ?, price = ?, category = ?, sort_order = ?, available = ?, image_url = ? WHERE id = ?",
    [b.name.trim(), b.description || "", Number(b.price), category, Number(b.sort_order) || 0, b.available === false ? 0 : 1, b.image_url || null, id]);
  return json({ ok: true });
}

async function deleteMenuItem(request, env, id) {
  if (!(await requireAdmin(request, env))) return err("auth", 401);
  const { rows: current } = await turso(env, "SELECT image_url FROM menu_items WHERE id = ?", [id]);
  if (current[0]?.image_url) await deleteImageByUrl(env, current[0].image_url);
  await turso(env, "DELETE FROM menu_items WHERE id = ?", [id]);
  return json({ ok: true });
}

// =====================================================================
// ADMIN: SECCIONES DEL MENÚ (CATEGORÍAS)
// =====================================================================
async function getAdminCategories(request, env) {
  if (!(await requireAdmin(request, env))) return err("auth", 401);
  const { rows } = await turso(env, "SELECT * FROM menu_categories ORDER BY sort_order, name");
  return json(rows);
}

async function createCategory(request, env) {
  if (!(await requireAdmin(request, env))) return err("auth", 401);
  const b = await request.json().catch(() => null);
  const name = String(b?.name || "").trim();
  if (!name || name.length > 40) return err("data");
  try {
    const { lastInsertRowid: id } = await turso(env,
      "INSERT INTO menu_categories (name, sort_order) VALUES (?, ?)",
      [name, Number(b.sort_order) || 0]);
    return json({ id });
  } catch (e) {
    return err("Ya existe una sección con ese nombre.");
  }
}

async function updateCategory(request, env, id) {
  if (!(await requireAdmin(request, env))) return err("auth", 401);
  const b = await request.json().catch(() => null);
  const name = String(b?.name || "").trim();
  if (!name || name.length > 40) return err("data");

  const { rows: current } = await turso(env, "SELECT name FROM menu_categories WHERE id = ?", [id]);
  const oldName = current[0]?.name;
  if (!oldName) return err("not_found", 404);

  try {
    await turso(env, "UPDATE menu_categories SET name = ?, sort_order = ? WHERE id = ?", [name, Number(b.sort_order) || 0, id]);
  } catch (e) {
    return err("Ya existe una sección con ese nombre.");
  }
  if (oldName !== name) {
    await turso(env, "UPDATE menu_items SET category = ? WHERE category = ?", [name, oldName]);
  }
  return json({ ok: true });
}

async function deleteCategory(request, env, id) {
  if (!(await requireAdmin(request, env))) return err("auth", 401);
  const { rows: current } = await turso(env, "SELECT name FROM menu_categories WHERE id = ?", [id]);
  const name = current[0]?.name;
  if (!name) return err("not_found", 404);

  const { rows: inUse } = await turso(env, "SELECT COUNT(*) as n FROM menu_items WHERE category = ?", [name]);
  if (inUse[0]?.n > 0) return err("No puedes eliminar una sección que todavía tiene platillos. Muévelos a otra sección primero.");

  await turso(env, "DELETE FROM menu_categories WHERE id = ?", [id]);
  return json({ ok: true });
}

// =====================================================================
// PEDIDOS WEB (VENTAS)
// =====================================================================
async function createOrder(request, env) {
  const b = await request.json().catch(() => null);
  if (!b) return err("data");
  const items = Array.isArray(b.items) ? b.items : [];
  if (!items.length) return err("data");
  const cleanItems = items
    .map((it) => ({ name: String(it?.name || "").slice(0, 80), qty: Math.max(1, Number(it?.qty) || 0), price: Number(it?.price) || 0 }))
    .filter((it) => it.qty > 0);
  if (!cleanItems.length) return err("data");
  const total = cleanItems.reduce((sum, it) => sum + it.price * it.qty, 0);

  const { lastInsertRowid: id } = await turso(env,
    `INSERT INTO orders (items, customer_name, customer_phone, customer_address, payment_method, total, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'nuevo', datetime('now'))`,
    [
      JSON.stringify(cleanItems),
      String(b.customer_name || "").trim().slice(0, 60),
      String(b.customer_phone || "").trim().slice(0, 20),
      String(b.customer_address || "").trim().slice(0, 120),
      String(b.payment_method || "").trim().slice(0, 20),
      total,
    ]);
  return json({ id });
}

async function getAdminOrders(request, env) {
  if (!(await requireAdmin(request, env))) return err("auth", 401);
  const { rows } = await turso(env, "SELECT * FROM orders ORDER BY created_at DESC");
  return json(rows);
}

async function updateOrderStatus(request, env, id) {
  if (!(await requireAdmin(request, env))) return err("auth", 401);
  const { status } = await request.json().catch(() => ({}));
  if (!["nuevo", "pagado", "cancelado"].includes(status)) return err("data");
  await turso(env, "UPDATE orders SET status = ? WHERE id = ?", [status, id]);
  return json({ ok: true });
}

async function deleteOrder(request, env, id) {
  if (!(await requireAdmin(request, env))) return err("auth", 401);
  await turso(env, "DELETE FROM orders WHERE id = ?", [id]);
  return json({ ok: true });
}

// =====================================================================
// VENTAS DE CAJA (EN FÍSICO)
// =====================================================================
async function getManualSales(request, env) {
  if (!(await requireAdmin(request, env))) return err("auth", 401);
  const { rows } = await turso(env, "SELECT * FROM manual_sales ORDER BY created_at DESC");
  return json(rows);
}

async function createManualSale(request, env) {
  if (!(await requireAdmin(request, env))) return err("auth", 401);
  const b = await request.json().catch(() => ({}));
  const amount = Number(b.amount);
  if (!Number.isFinite(amount) || amount <= 0) return err("Ingresa un monto válido.");
  const note = String(b.note || "").trim().slice(0, 200);
  const { lastInsertRowid: id } = await turso(env,
    "INSERT INTO manual_sales (amount, note, created_at) VALUES (?, ?, datetime('now'))",
    [amount, note]);
  return json({ id });
}

async function deleteManualSale(request, env, id) {
  if (!(await requireAdmin(request, env))) return err("auth", 401);
  await turso(env, "DELETE FROM manual_sales WHERE id = ?", [id]);
  return json({ ok: true });
}

// =====================================================================
// GASTOS
// =====================================================================
async function getExpenses(request, env) {
  if (!(await requireAdmin(request, env))) return err("auth", 401);
  const { rows } = await turso(env, "SELECT * FROM expenses ORDER BY created_at DESC");
  return json(rows);
}

async function createExpense(request, env) {
  if (!(await requireAdmin(request, env))) return err("auth", 401);
  const b = await request.json().catch(() => ({}));
  const description = String(b.description || "").trim();
  const amount = Number(b.amount);
  if (!description || description.length > 200) return err("Escribe una descripción.");
  if (!Number.isFinite(amount) || amount <= 0) return err("Ingresa un monto válido.");
  const { lastInsertRowid: id } = await turso(env,
    "INSERT INTO expenses (description, amount, created_at) VALUES (?, ?, datetime('now'))",
    [description, amount]);
  return json({ id });
}

async function deleteExpense(request, env, id) {
  if (!(await requireAdmin(request, env))) return err("auth", 401);
  await turso(env, "DELETE FROM expenses WHERE id = ?", [id]);
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