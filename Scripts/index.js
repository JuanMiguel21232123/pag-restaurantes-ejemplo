// Portada: menú real desde Turso + formulario de reservas conectado a /api/reservations.
 
async function renderMenu() {
  const list = $("#menu-list");
  const { data, error } = await api("public/menu");
  if (error || !Array.isArray(data) || !data.length) {
    list.innerHTML = '<li class="menu-empty">Estamos actualizando el menú. Vuelve pronto.</li>';
    return;
  }
  const groups = {};
  data.forEach((item) => (groups[item.category || "General"] ||= []).push(item));
  list.innerHTML = Object.entries(groups).map(([cat, items]) => `
    <div class="menu-group">
      <h4>${esc(cat)}</h4>
      ${items.map((it) => `
        <div class="menu-item">
          <div>
            <span class="name">${esc(it.name)}</span>
            ${it.description ? `<span class="desc">${esc(it.description)}</span>` : ""}
          </div>
          <span class="price">${money(it.price)}</span>
        </div>`).join("")}
    </div>`).join("");
}
 
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
  document.querySelectorAll(".tab-panel").forEach((p) => (p.hidden = p.id !== "tab-" + tab));
  window.scrollTo({ top: 0, behavior: "smooth" });
}
 
function setupTabs() {
  document.querySelectorAll(".nav-tab").forEach((btn) => btn.addEventListener("click", () => switchTab(btn.dataset.tab)));
  document.querySelectorAll("[data-goto]").forEach((btn) => btn.addEventListener("click", () => switchTab(btn.dataset.goto)));
}
 
setupTabs();
loadSettings();
renderMenu();
setupReservationForm();
 