// Panel admin: login por sesión (cookie firmada), gestión de menú y reservas.
let menuItems = [];

async function checkSession() {
  const { data } = await api("session");
  if (data?.name) showPanel(data.name);
}

function showPanel(name) {
  $("#login-view").hidden = true;
  $("#panel-view").hidden = false;
  $("#admin-name").textContent = name;
  loadMenu();
  loadReservations();
  loadSettingsForm();
}

$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = Object.fromEntries(new FormData(e.target).entries());
  const msg = $("#login-msg");
  msg.textContent = "";
  const { data, error } = await api("login", { method: "POST", body: JSON.stringify(payload) });
  if (error) { msg.textContent = error.message || "No se pudo entrar."; return; }
  showPanel(data.name);
});

$("#logout").addEventListener("click", async () => {
  await api("session", { method: "DELETE" });
  location.reload();
});

// ---------- Tabs ----------
document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((b) => b.setAttribute("aria-pressed", b === btn));
    document.querySelectorAll(".tab-panel").forEach((p) => (p.hidden = p.id !== "tab-" + btn.dataset.tab));
  });
});

// ---------- Menú ----------
async function loadMenu() {
  const { data } = await api("admin/menu");
  menuItems = data || [];
  renderMenuTable();
}

function renderMenuTable() {
  $("#menu-table tbody").innerHTML = menuItems.map((it) => `
    <tr>
      <td>${esc(it.name)}</td>
      <td>${esc(it.category || "")}</td>
      <td>${money(it.price)}</td>
      <td>${it.available ? "Sí" : "No"}</td>
      <td>
        <button data-edit="${it.id}">Editar</button>
        <button data-del="${it.id}">Eliminar</button>
      </td>
    </tr>`).join("") || `<tr><td colspan="5">Sin platillos todavía.</td></tr>`;
}

$("#menu-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const payload = Object.fromEntries(new FormData(form).entries());
  const id = payload.id;
  delete payload.id;
  const { error } = id
    ? await api("admin/menu/" + id, { method: "PATCH", body: JSON.stringify(payload) })
    : await api("admin/menu", { method: "POST", body: JSON.stringify(payload) });
  if (error) return;
  form.reset();
  $("#menu-cancel").hidden = true;
  await loadMenu();
});

$("#menu-cancel").addEventListener("click", () => {
  $("#menu-form").reset();
  $("#menu-cancel").hidden = true;
});

$("#menu-table").addEventListener("click", async (e) => {
  const editId = e.target.dataset.edit;
  const delId = e.target.dataset.del;
  if (editId) {
    const it = menuItems.find((x) => String(x.id) === editId);
    if (!it) return;
    const form = $("#menu-form");
    form.id.value = it.id;
    form.name.value = it.name;
    form.category.value = it.category || "";
    form.price.value = it.price;
    form.description.value = it.description || "";
    $("#menu-cancel").hidden = false;
  }
  if (delId) {
    if (!confirm("¿Eliminar este platillo?")) return;
    await api("admin/menu/" + delId, { method: "DELETE" });
    await loadMenu();
  }
});

// ---------- Reservas ----------
async function loadReservations() {
  const { data } = await api("admin/reservations");
  renderReservations(data || []);
}

function renderReservations(rows) {
  $("#reservations-table tbody").innerHTML = rows.map((r) => `
    <tr>
      <td>${esc(r.code)}</td>
      <td>${esc(r.name)}</td>
      <td>${esc(r.date)}</td>
      <td>${esc(r.time)}</td>
      <td>${esc(r.guests)}</td>
      <td>
        <select class="status-select" data-id="${r.id}">
          <option value="pending" ${r.status === "pending" ? "selected" : ""}>Pendiente</option>
          <option value="confirmed" ${r.status === "confirmed" ? "selected" : ""}>Confirmada</option>
          <option value="cancelled" ${r.status === "cancelled" ? "selected" : ""}>Cancelada</option>
        </select>
      </td>
      <td><button data-del-res="${r.id}">Eliminar</button></td>
    </tr>`).join("") || `<tr><td colspan="7">Sin reservas todavía.</td></tr>`;
}

$("#reservations-table").addEventListener("change", async (e) => {
  const sel = e.target.closest(".status-select");
  if (!sel) return;
  await api("admin/reservations/" + sel.dataset.id, { method: "PATCH", body: JSON.stringify({ status: sel.value }) });
});

$("#reservations-table").addEventListener("click", async (e) => {
  const id = e.target.dataset.delRes;
  if (!id) return;
  if (!confirm("¿Eliminar esta reserva?")) return;
  await api("admin/reservations/" + id, { method: "DELETE" });
  await loadReservations();
});

// ---------- Configuración general ----------
async function loadSettingsForm() {
  const { data } = await api("public/settings");
  if (!data) return;
  const form = $("#settings-form");
  if (data.hero_title) form.hero_title.value = data.hero_title;
  if (data.hero_text) form.hero_text.value = data.hero_text;
  if (data.whatsapp) form.whatsapp.value = data.whatsapp;
}

$("#settings-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = $("#settings-msg");
  const payload = Object.fromEntries(new FormData(e.target).entries());
  const set = {};
  Object.entries(payload).forEach(([k, v]) => { if (String(v).trim()) set[k] = String(v).trim(); });

  msg.textContent = "Guardando…";
  msg.className = "msg";
  const { error } = await api("admin/settings", { method: "PATCH", body: JSON.stringify({ set }) });
  if (error) {
    msg.textContent = "No se pudo guardar. Intenta de nuevo.";
    msg.className = "msg error";
    return;
  }
  msg.textContent = "Cambios guardados. Recarga el sitio público para verlos.";
  msg.className = "msg ok";
});

checkSession();
