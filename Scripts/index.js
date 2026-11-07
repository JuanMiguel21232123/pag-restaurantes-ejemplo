// Portada: menú real desde Turso + formulario de reservas + "Tu pedido" (selección de platillos por WhatsApp).

let menuData = [];
let order = loadOrder(); // { "<id>": cantidad }
let orderCustomer = loadOrderCustomer(); // { name, phone, address, payment }

// ---------- Persistencia del pedido (localStorage del cliente) ----------
function loadOrder() {
  try {
    const raw = localStorage.getItem("parrilla_pedido");
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (e) {
    return {};
  }
}

function saveOrder() {
  try { localStorage.setItem("parrilla_pedido", JSON.stringify(order)); } catch (e) {}
}

function loadOrderCustomer() {
  const fallback = { name: "", phone: "", address: "", payment: "efectivo" };
  try {
    const raw = localStorage.getItem("parrilla_pedido_datos");
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? { ...fallback, ...parsed } : fallback;
  } catch (e) {
    return fallback;
  }
}

function saveOrderCustomer() {
  try { localStorage.setItem("parrilla_pedido_datos", JSON.stringify(orderCustomer)); } catch (e) {}
}

function orderCount() {
  return Object.values(order).reduce((sum, qty) => sum + qty, 0);
}

function orderTotal() {
  return Object.entries(order).reduce((sum, [id, qty]) => {
    const it = menuData.find((x) => String(x.id) === String(id));
    return sum + (it ? it.price * qty : 0);
  }, 0);
}

function changeOrderQty(id, delta) {
  const it = menuData.find((x) => String(x.id) === String(id));
  if (!it) return;
  const next = Math.max(0, (order[id] || 0) + delta);
  if (next === 0) delete order[id]; else order[id] = next;
  saveOrder();
  refreshCardActions(id);
  refreshOrderUI();
}

// ---------- Menú ----------
function dishImage(it, cls) {
  return it.image_url
    ? `<img src="${esc(it.image_url)}" alt="${esc(it.name)}" loading="lazy">`
    : `<span class="${cls}-placeholder">${esc((it.name || "?").trim().slice(0, 1).toUpperCase())}</span>`;
}

function cardActionsHTML(id) {
  const qty = order[id] || 0;
  if (!qty) {
    return `<button class="btn-add" type="button" data-add="${id}">Agregar al pedido</button>`;
  }
  return `
    <div class="qty-stepper">
      <button type="button" data-dec="${id}" aria-label="Quitar uno">−</button>
      <span>${qty}</span>
      <button type="button" data-inc="${id}" aria-label="Agregar uno">+</button>
    </div>`;
}

function refreshCardActions(id) {
  const el = document.querySelector(`[data-actions="${CSS.escape(String(id))}"]`);
  if (el) el.innerHTML = cardActionsHTML(id);
  const modalTitle = $("#dish-modal-title");
  if (modalTitle && !$("#dish-modal").hidden && modalTitle.dataset.id === String(id)) {
    $("#dish-modal-actions").innerHTML = cardActionsHTML(id);
  }
}

async function renderMenu() {
  const grid = $("#menu-grid");
  const { data, error } = await api("public/menu");
  if (error || !Array.isArray(data) || !data.length) {
    grid.innerHTML = '<p class="menu-empty">Estamos actualizando el menú. Vuelve pronto.</p>';
    renderHomeFeatured();
    return;
  }
  menuData = data;
  renderMenuGrid();
  renderHomeFeatured();
}

// ---------- Platillos destacados (portada) ----------
// Toma los primeros platillos disponibles del menú real como "destacados".
function renderHomeFeatured() {
  const el = $("#home-featured-grid");
  if (!el) return;
  if (!menuData.length) {
    el.innerHTML = '<p class="menu-empty">Estamos actualizando el menú. Vuelve pronto.</p>';
    return;
  }
  const picks = menuData.slice(0, 4);
  el.innerHTML = picks.map((it) => `
    <div class="home-featured-card">
      <button class="menu-card-view" type="button" data-view="${it.id}">
        <div class="menu-card-img">${dishImage(it, "menu-card")}</div>
        <div class="menu-card-body">
          <span class="name">${esc(it.name)}</span>
          <span class="price">${money(it.price)}</span>
        </div>
      </button>
    </div>`).join("");
}

// ---------- Horario / ubicación / contacto (portada) ----------
function renderHomeInfo() {
  const cityEl = document.querySelector("[data-city]");
  if (cityEl && typeof CITY !== "undefined") cityEl.textContent = CITY;
  const waInfo = $("#info-wa-link");
  const business = typeof BUSINESS !== "undefined" ? BUSINESS : "";
  if (waInfo) waInfo.href = waLink(`Hola, quiero más información sobre ${business}.`);
}

function renderMenuGrid() {
  const grid = $("#menu-grid");
  const groups = {};
  menuData.forEach((item) => (groups[item.category || "General"] ||= []).push(item));
  grid.innerHTML = Object.entries(groups).map(([cat, items]) => `
    <div class="menu-group">
      <h4>${esc(cat)}</h4>
      <div class="menu-cards">
        ${items.map((it) => `
          <div class="menu-card">
            <button class="menu-card-view" type="button" data-view="${it.id}">
              <div class="menu-card-img">${dishImage(it, "menu-card")}</div>
              <div class="menu-card-body">
                <span class="name">${esc(it.name)}</span>
                <span class="price">${money(it.price)}</span>
              </div>
            </button>
            <div class="menu-card-actions" data-actions="${it.id}">${cardActionsHTML(it.id)}</div>
          </div>`).join("")}
      </div>
    </div>`).join("");
}

function openDishModal(id) {
  const it = menuData.find((x) => String(x.id) === String(id));
  if (!it) return;
  $("#dish-modal-title").textContent = it.name;
  $("#dish-modal-title").dataset.id = String(it.id);
  $("#dish-modal-desc").textContent = it.description || "Sin descripción adicional.";
  $("#dish-modal-price").textContent = money(it.price);
  $("#dish-modal-image").innerHTML = dishImage(it, "modal");
  $("#dish-modal-actions").innerHTML = cardActionsHTML(it.id);
  $("#dish-modal").hidden = false;
}

function closeDishModal() { $("#dish-modal").hidden = true; }

function setupMenuModal() {
  $("#dish-modal-close").addEventListener("click", closeDishModal);
  $("#dish-modal").addEventListener("click", (e) => { if (e.target.id === "dish-modal") closeDishModal(); });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    closeDishModal();
    closeOrderModal();
  });
}

// ---------- Tu pedido ----------
function buildOrderText() {
  const business = typeof BUSINESS !== "undefined" ? BUSINESS : "";
  const lines = Object.entries(order).map(([id, qty]) => {
    const it = menuData.find((x) => String(x.id) === String(id));
    if (!it) return null;
    return `${qty} x ${it.name} — ${money(it.price * qty)}`;
  }).filter(Boolean);
  if (!lines.length) return "";

  const paymentLabel = orderCustomer.payment === "nequi" ? "Nequi" : "Efectivo";
  const customerLines = [
    `Nombre: ${orderCustomer.name.trim()}`,
    `Teléfono: ${orderCustomer.phone.trim()}`,
    `Dirección: ${orderCustomer.address.trim()}`,
    `Pago: ${paymentLabel}`,
  ];

  return [
    `Hola, quiero hacer este pedido en ${business}:`,
    "",
    ...customerLines,
    "",
    ...lines,
    "",
    `Total: ${money(orderTotal())}`,
  ].join("\n");
}

function renderOrderModal() {
  const entries = Object.entries(order);
  const container = $("#order-items");
  if (!entries.length) {
    container.innerHTML = '<p class="order-empty">Todavía no has agregado platillos a tu pedido.</p>';
  } else {
    container.innerHTML = entries.map(([id, qty]) => {
      const it = menuData.find((x) => String(x.id) === String(id));
      if (!it) return "";
      return `
        <div class="order-item">
          <div class="order-item-info">
            <span class="name">${esc(it.name)}</span>
            <span class="price">${money(it.price)} c/u</span>
          </div>
          <div class="qty-stepper">
            <button type="button" data-dec="${id}" aria-label="Quitar uno">−</button>
            <span>${qty}</span>
            <button type="button" data-inc="${id}" aria-label="Agregar uno">+</button>
          </div>
        </div>`;
    }).join("");
  }
  $("#order-total").textContent = money(orderTotal());
  const hasItems = entries.length > 0;
  $("#order-customer-form").hidden = !hasItems;
  $("#order-send").hidden = !hasItems;
  $("#order-clear").hidden = !hasItems;
}

function fillCustomerForm() {
  const form = $("#order-customer-form");
  form.name.value = orderCustomer.name;
  form.phone.value = orderCustomer.phone;
  form.address.value = orderCustomer.address;
  const radio = form.querySelector(`input[name=payment][value="${orderCustomer.payment}"]`);
  if (radio) radio.checked = true;
}

function openOrderModal() {
  fillCustomerForm();
  renderOrderModal();
  $("#order-msg").textContent = "";
  $("#order-modal").hidden = false;
}

function closeOrderModal() { $("#order-modal").hidden = true; }

function refreshOrderUI() {
  const count = orderCount();
  $("#order-fab").hidden = count === 0;
  $("#order-fab-count").textContent = count;
  if (!$("#order-modal").hidden) renderOrderModal();
}

function setupOrder() {
  $("#order-fab").addEventListener("click", openOrderModal);
  $("#order-modal-close").addEventListener("click", closeOrderModal);
  $("#order-modal").addEventListener("click", (e) => { if (e.target.id === "order-modal") closeOrderModal(); });

  const customerForm = $("#order-customer-form");
  customerForm.addEventListener("input", () => {
    orderCustomer.name = customerForm.name.value;
    orderCustomer.phone = customerForm.phone.value;
    orderCustomer.address = customerForm.address.value;
    saveOrderCustomer();
  });
  customerForm.addEventListener("change", (e) => {
    if (e.target.name === "payment") {
      orderCustomer.payment = customerForm.payment.value;
      saveOrderCustomer();
    }
  });

  $("#order-send").addEventListener("click", async () => {
    const msg = $("#order-msg");
    if (!orderCustomer.name.trim() || !orderCustomer.phone.trim() || !orderCustomer.address.trim()) {
      msg.textContent = "Completa tu nombre, teléfono y dirección para enviar el pedido.";
      msg.className = "form-status error";
      return;
    }
    msg.textContent = "";
    const sendBtn = $("#order-send");
    sendBtn.disabled = true;

    const items = Object.entries(order).map(([id, qty]) => {
      const it = menuData.find((x) => String(x.id) === String(id));
      return it ? { name: it.name, qty, price: it.price } : null;
    }).filter(Boolean);

    // Se guarda el pedido como venta (estado "nuevo"); si falla el guardado,
    // igual se deja enviar el mensaje por WhatsApp para no bloquear al cliente.
    await api("orders", {
      method: "POST",
      body: JSON.stringify({
        items,
        customer_name: orderCustomer.name,
        customer_phone: orderCustomer.phone,
        customer_address: orderCustomer.address,
        payment_method: orderCustomer.payment,
      }),
    });

    sendBtn.disabled = false;
    window.open(waLink(buildOrderText()), "_blank", "noopener");
  });

  $("#order-clear").addEventListener("click", () => {
    if (!Object.keys(order).length) return;
    if (!confirm("¿Vaciar tu pedido?")) return;
    order = {};
    saveOrder();
    renderMenuGrid();
    refreshOrderUI();
  });

  // Delegación global: agregar / quitar / abrir detalle, tanto en las tarjetas del menú como en los modales.
  document.addEventListener("click", (e) => {
    const addBtn = e.target.closest("[data-add]");
    if (addBtn) { changeOrderQty(addBtn.dataset.add, 1); return; }
    const incBtn = e.target.closest("[data-inc]");
    if (incBtn) { changeOrderQty(incBtn.dataset.inc, 1); return; }
    const decBtn = e.target.closest("[data-dec]");
    if (decBtn) { changeOrderQty(decBtn.dataset.dec, -1); return; }
    const viewBtn = e.target.closest("[data-view]");
    if (viewBtn) { openDishModal(viewBtn.dataset.view); return; }
  });

  refreshOrderUI();
}

// ---------- Reservas ----------
function setupReservationForm() {
  const dateInput = $("#r-date");
  if (dateInput) dateInput.min = new Date().toISOString().slice(0, 10);

  const form = $("#reservation-form");
  const status = $("#form-status");
  const done = $("#reservation-done");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = Object.fromEntries(new FormData(form).entries());
    const guests = Number(payload.guests);
    if (!payload.name || !payload.date || !payload.time) {
      status.textContent = "Completa nombre, fecha y hora.";
      status.className = "form-status error";
      return;
    }
    if (!Number.isInteger(guests) || guests < 1 || guests > 15) {
      status.textContent = "El número de personas debe ser entre 1 y 15.";
      status.className = "form-status error";
      return;
    }
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    status.textContent = "Guardando tu reserva…";
    status.className = "form-status";

    const { data, error } = await api("reservations", { method: "POST", body: JSON.stringify(payload) });
    btn.disabled = false;
    if (error) {
      status.textContent = "No se pudo guardar la reserva. Intenta de nuevo.";
      status.className = "form-status error";
      return;
    }

    const text = [
      `Hola, acabo de hacer la reserva ${data.code} en ${BUSINESS}:`,
      `Nombre: ${payload.name}`,
      `Fecha: ${payload.date} a las ${payload.time}`,
      `Personas: ${payload.guests}`,
      payload.email ? `Correo: ${payload.email}` : "",
    ].filter(Boolean).join("\n");

    $("#done-code").textContent = "Código " + data.code;
    $("#done-wa").href = waLink(text);
    form.hidden = true;
    done.hidden = false;
  });

  $("#done-close").addEventListener("click", () => {
    form.reset();
    status.textContent = "";
    form.hidden = false;
    done.hidden = true;
  });
}

function switchTab(tab) {
  document.querySelectorAll(".nav-tab").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tab === tab)));
  document.querySelectorAll(".tab-panel").forEach((p) => (p.hidden = p.dataset.tab !== tab));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function setupTabs() {
  document.querySelectorAll(".nav-tab").forEach((btn) => btn.addEventListener("click", () => switchTab(btn.dataset.tab)));
  document.querySelectorAll("[data-goto]").forEach((btn) => btn.addEventListener("click", () => switchTab(btn.dataset.goto)));
}

setupTabs();
setupMenuModal();
setupOrder();
loadSettings().then(renderHomeInfo);
renderMenu();
setupReservationForm();