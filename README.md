# La Parrilla del Valle — sitio + panel admin, sin npm install

Misma arquitectura que el ejemplo que compartiste: `functions/_lib/db.js` habla
con Turso por su **API HTTP** (`fetch`), así que no hay ninguna librería que
instalar — no hace falta `package.json` ni `npm install`. Por eso en este
proyecto no aparece ese archivo.

## 1. Crear la base en Turso

```bash
curl -sSfL https://get.tur.so/install.sh | bash
turso auth login
turso db create parrilla-del-valle
turso db shell parrilla-del-valle < schema.sql

turso db show parrilla-del-valle --url     # → TURSO_URL
turso db tokens create parrilla-del-valle  # → TURSO_TOKEN
```

## 2. Variables de entorno (Cloudflare Pages → Settings → Environment variables)

| Variable          | Valor                                   |
|--------------------|-------------------------------------------|
| `TURSO_URL`         | la URL de `turso db show`                |
| `TURSO_TOKEN`        | el token de `turso db tokens create`     |
| `SESSION_SECRET`     | cualquier texto largo e inventado        |

## 3. Crear el primer administrador

Las contraseñas nunca se guardan en texto plano. Genera el hash localmente
con Node (usa el mismo algoritmo que `functions/_lib/db.js`):

```js
// hash.js — ejecútalo una vez con `node hash.js`, copia el resultado y bórralo
const enc = new TextEncoder();
async function derive(password, salt) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }, key, 256);
  return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, "0")).join("");
}
(async () => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltHex = [...salt].map(b => b.toString(16).padStart(2, "0")).join("");
  console.log(saltHex + ":" + await derive("TU_CONTRASEÑA_AQUI", salt));
})();
```

Luego inserta el admin en Turso:

```bash
turso db shell parrilla-del-valle \
  "INSERT INTO admins (email, password_hash, name) VALUES ('tu@correo.com', 'EL_HASH_GENERADO', 'Tu nombre')"
```

## 4. Desarrollo local y despliegue

```bash
npx wrangler pages dev .      # local, en http://localhost:8788
npx wrangler pages deploy .   # producción
```

(`npx` descarga `wrangler` solo para ese comando — no deja nada instalado en
el proyecto, por eso tampoco hace falta `package.json` para esto.)

## Estructura

```
index.html              ← portada pública
admin.html               ← panel administrativo
Styles/index.css
Styles/admin.css
Scripts/config.js        ← nombre del negocio, WhatsApp
Scripts/site.js          ← helpers compartidos (fetch a /api, settings)
Scripts/index.js         ← menú + formulario de reservas
Scripts/admin.js         ← login, CRUD de menú, gestión de reservas
functions/_lib/db.js     ← Turso vía HTTP, contraseñas, sesión firmada
functions/api/[[path]].js ← toda la API en un solo router
schema.sql                ← tablas + menú de ejemplo
```
