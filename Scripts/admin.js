// Panel admin: login por sesión (cookie firmada), gestión de menú, secciones y reservas.
let menuItems = [];
let categoryItems = [];

async function checkSession() {
  const { data } = await api("session");
  if (data?.name) showPanel(data.name);
}

function showPanel(name) {
  $("#login-view").hidden = true;
  $("#panel-view").hidden = false;
  $("#admin-name").textContent = name;
  loadCategories().then(loadMenu);
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

// ---------- Sub-pestañas de Menú: Agregar / Ver ----------
function goToSubtab(name) {
  document.querySelectorAll(".subtab").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.subtab === name)));
  document.querySelectorAll(".subtab-panel").forEach((p) => (p.hidden = p.id !== "submenu-" + name));
}

document.querySelectorAll(".subtab").forEach((btn) => {
  btn.addEventListener("click", () => goToSubtab(btn.dataset.subtab));
});

// ---------- Secciones (categorías) ----------
async function loadCategories() {
  const { data } = await api("admin/categories");
  categoryItems = data || [];
  renderCategorySelect();
  renderCategoriesTable();
}

function renderCategorySelect() {
  const select = $("#menu-form select[name=category]");
  if (!select) return;
  const current = select.value;
  select.innerHTML = '<option value="" disabled>Sección</option>' +
    categoryItems.map((c) => `<option value="${esc(c.name)}">${esc(c.name)}</option>`).join("");
  if (current && categoryItems.some((c) => c.name === current)) {
    select.value = current;
  } else {
    select.querySelector('option[value=""]').selected = true;
  }
}

function renderCategoriesTable() {
  $("#categories-table tbody").innerHTML = categoryItems.map((c) => `
    <tr>
      <td>${esc(c.name)}</td>
      <td>${esc(c.sort_order ?? 0)}</td>
      <td>
        <button data-edit-cat="${c.id}">Editar</button>
        <button data-del-cat="${c.id}">Eliminar</button>
      </td>
    </tr>`).join("") || `<tr><td colspan="3">Sin secciones todavía. Crea la primera arriba (ej. Fuertes, Bebidas, Postres).</td></tr>`;
}

$("#category-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const msg = $("#category-msg");
  const payload = Object.fromEntries(new FormData(form).entries());
  const id = payload.id;
  delete payload.id;

  const { error } = id
    ? await api("admin/categories/" + id, { method: "PATCH", body: JSON.stringify(payload) })
    : await api("admin/categories", { method: "POST", body: JSON.stringify(payload) });

  if (error) { if (msg) { msg.textContent = error.message || "No se pudo guardar."; msg.className = "msg error"; } return; }

  form.reset();
  $("#category-cancel").hidden = true;
  if (msg) msg.textContent = "";
  await loadCategories();
  await loadMenu();
});

$("#category-cancel").addEventListener("click", () => {
  $("#category-form").reset();
  $("#category-cancel").hidden = true;
});

$("#categories-table").addEventListener("click", async (e) => {
  const editId = e.target.dataset.editCat;
  const delId = e.target.dataset.delCat;
  if (editId) {
    const c = categoryItems.find((x) => String(x.id) === editId);
    if (!c) return;
    const form = $("#category-form");
    form.id.value = c.id;
    form.name.value = c.name;
    form.sort_order.value = c.sort_order ?? 0;
    $("#category-cancel").hidden = false;
  }
  if (delId) {
    if (!confirm("¿Eliminar esta sección?")) return;
    const { error } = await api("admin/categories/" + delId, { method: "DELETE" });
    if (error) { alert(error.message || "No se pudo eliminar."); return; }
    await loadCategories();
  }
});

// ---------- Menú ----------
async function loadMenu() {
  const { data } = await api("admin/menu");
  menuItems = data || [];
  renderMenuTable();
}

function renderMenuTable() {
  const container = $("#menu-table-container");
  if (!menuItems.length) {
    container.innerHTML = '<p class="menu-empty">Sin platillos todavía.</p>';
    return;
  }
  const groups = {};
  menuItems.forEach((it) => (groups[it.category || "Sin sección"] ||= []).push(it));
  container.innerHTML = Object.entries(groups).map(([cat, items]) => `
    <div class="menu-section">
      <h3>${esc(cat)}</h3>
      <div class="data-table-wrap">
      <table class="data-table">
        <thead><tr><th></th><th>Nombre</th><th>Precio</th><th>Disponible</th><th></th></tr></thead>
        <tbody>
          ${items.map((it) => `
            <tr>
              <td>${it.image_url ? `<img class="thumb" src="${esc(it.image_url)}" alt="">` : ""}</td>
              <td>${esc(it.name)}</td>
              <td>${money(it.price)}</td>
              <td>${it.available ? "Sí" : "No"}</td>
              <td>
                <button data-edit="${it.id}">Editar</button>
                <button data-del="${it.id}">Eliminar</button>
              </td>
            </tr>`).join("")}
        </tbody>
      </table>
      </div>
    </div>`).join("");
}

let selectedImageBlob = null;

async function convertToWebp(file, maxDim = 1600, quality = 0.82) {
  try {
    const bitmap = await createImageBitmap(file);
    let { width, height } = bitmap;
    if (width > maxDim || height > maxDim) {
      const scale = maxDim / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", quality));
    return blob && blob.type === "image/webp" ? blob : file; // si el navegador no soporta WebP, se sube el original
  } catch (e) {
    return file;
  }
}

$("#menu-image-input").addEventListener("change", async () => {
  const file = $("#menu-image-input").files[0];
  const preview = $("#menu-image-preview");
  const msg = $("#menu-msg");
  if (!file) { selectedImageBlob = null; return; }

  preview.src = URL.createObjectURL(file);
  preview.hidden = false;
  if (msg) { msg.textContent = "Optimizando imagen…"; msg.className = "msg"; }

  selectedImageBlob = await convertToWebp(file);
  preview.src = URL.createObjectURL(selectedImageBlob);
  if (msg) msg.textContent = "";
});

async function uploadSelectedImage() {
  if (!selectedImageBlob) return null;
  const fd = new FormData();
  fd.append("image", selectedImageBlob, "foto.webp");
  const res = await fetch("/api/admin/upload", { method: "POST", body: fd, credentials: "same-origin" });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || "No se pudo subir la imagen.");
  return data.url;
}

$("#menu-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const msg = $("#menu-msg");
  const submitBtn = form.querySelector('button[type="submit"]');

  if (!form.category.value) {
    if (msg) { msg.textContent = "Selecciona una sección."; msg.className = "msg error"; }
    return;
  }

  let imageUrl = form.image_url.value || null;
  if (selectedImageBlob) {
    submitBtn.disabled = true;
    if (msg) { msg.textContent = "Subiendo foto…"; msg.className = "msg"; }
    try {
      imageUrl = await uploadSelectedImage();
    } catch (err) {
      submitBtn.disabled = false;
      if (msg) { msg.textContent = err.message; msg.className = "msg error"; }
      return;
    }
  }

  const payload = Object.fromEntries(new FormData(form).entries());
  payload.image_url = imageUrl;
  const id = payload.id;
  delete payload.id;

  const { error } = id
    ? await api("admin/menu/" + id, { method: "PATCH", body: JSON.stringify(payload) })
    : await api("admin/menu", { method: "POST", body: JSON.stringify(payload) });

  submitBtn.disabled = false;
  if (error) { if (msg) { msg.textContent = (typeof error.message === "string" && error.message.length > 6) ? error.message : "No se pudo guardar."; msg.className = "msg error"; } return; }

  form.reset();
  $("#menu-image-preview").hidden = true;
  $("#menu-cancel").hidden = true;
  selectedImageBlob = null;
  if (msg) msg.textContent = "";
  await loadMenu();
  goToSubtab("list");
});

$("#menu-cancel").addEventListener("click", () => {
  $("#menu-form").reset();
  $("#menu-image-preview").hidden = true;
  $("#menu-cancel").hidden = true;
  selectedImageBlob = null;
});

$("#menu-table-container").addEventListener("click", async (e) => {
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
    form.image_url.value = it.image_url || "";
    $("#menu-image-input").value = "";
    selectedImageBlob = null;
    const preview = $("#menu-image-preview");
    if (it.image_url) { preview.src = it.image_url; preview.hidden = false; } else { preview.hidden = true; }
    $("#menu-cancel").hidden = false;
    goToSubtab("add");
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