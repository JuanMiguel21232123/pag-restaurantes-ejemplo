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
  const form = $("#reservation-form");
  const status = $("#form-status");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = Object.fromEntries(new FormData(form).entries());
    if (!payload.name || !payload.date || !payload.time) {
      status.textContent = "Completa nombre, fecha y hora.";
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
    status.textContent = `¡Reserva guardada! Código ${data.code}. Te confirmamos pronto.`;
    status.className = "form-status ok";
    form.reset();
  });
}

loadSettings();
renderMenu();
setupReservationForm();
