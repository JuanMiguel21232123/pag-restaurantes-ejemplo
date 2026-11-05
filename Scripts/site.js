// Lógica compartida: llamadas a /api/..., formato de dinero y personalización.
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (n) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

async function api(path, opts = {}) {
  const res = await fetch("/api/" + path, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    credentials: "same-origin",
  });
  let data = null;
  try { data = await res.json(); } catch (e) {}
  if (!res.ok) return { data: null, error: { message: data?.error || "error" } };
  return { data, error: null };
}

let whatsapp = typeof WHATSAPP !== "undefined" ? WHATSAPP : "";
const waLink = (text) => `https://wa.me/${whatsapp}${text ? "?text=" + encodeURIComponent(text) : ""}`;

async function loadSettings() {
  const { data } = await api("public/settings");
  if (!data) return;
  document.querySelectorAll("[data-s]").forEach((el) => { if (data[el.dataset.s]) el.textContent = data[el.dataset.s]; });
  if (/^[0-9]{10,15}$/.test(data.whatsapp || "")) whatsapp = data.whatsapp;
  return data;
}

const yearEl = $("#year");
if (yearEl) yearEl.textContent = new Date().getFullYear();
