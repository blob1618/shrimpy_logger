# Render Log Monitor — Cloudflare Worker

Cloudflare Worker que monitorea los logs del servicio **luka** en Render y envía notificaciones a Discord.

## Qué notifica

| Notificación | Condición |
|---|---|
| 🔴 **Error en producción** | Log de nivel `error` en runtime de la app |
| ✅ **Deploy exitoso** | Build finalizado con mensaje de "deploy live" |
| ❌ **Deploy fallido** | Error durante el proceso de build |

El worker corre **cada 60 segundos** vía Cron Trigger de Cloudflare. El estado (cursor del último log procesado) persiste en **Cloudflare KV** para no enviar duplicados.

---

## Setup inicial

### 1. Instalar dependencias

```bash
npm install
```

### 2. Autenticarse en Cloudflare

```bash
npx wrangler login
```

### 3. Crear el namespace de KV

```bash
npx wrangler kv namespace create LOG_STATE
# → Copia el ID que devuelve

npx wrangler kv namespace create LOG_STATE --preview
# → Copia el preview_id
```

Editá `wrangler.jsonc` y reemplazá `<KV_NAMESPACE_ID>` y `<KV_NAMESPACE_PREVIEW_ID>` con los valores obtenidos.

### 4. Configurar los secrets

Ejecutá cada comando y pegá el valor cuando lo pida:

```bash
npx wrangler secret put RENDER_API_KEY
npx wrangler secret put RENDER_OWNER_ID
npx wrangler secret put RENDER_SERVICE_ID
npx wrangler secret put DISCORD_BOT_TOKEN
npx wrangler secret put DISCORD_CHANNEL_ID
```

#### Dónde encontrar cada valor

| Secret | Dónde encontrarlo |
|---|---|
| `RENDER_API_KEY` | Render Dashboard → Account Settings → API Keys |
| `RENDER_OWNER_ID` | Render Dashboard → URL del workspace: `render.com/teams/tea-XXXXXXXX` |
| `RENDER_SERVICE_ID` | URL del servicio luka: `render.com/web/srv-XXXXXXXX` |
| `DISCORD_BOT_TOKEN` | Discord Developer Portal → Tu aplicación → Bot → Token |
| `DISCORD_CHANNEL_ID` | Discord → Click derecho en el canal → Copy Channel ID |

> **Nota sobre el bot de Discord:** Asegurate de que el bot tenga el permiso `Send Messages` en el canal destino. En el Developer Portal → OAuth2 → Bot Permissions → `Send Messages`.

---

## Desarrollo local

```bash
npm run dev
```

Esto levanta el worker localmente con `wrangler dev --test-scheduled`. Para disparar el cron manualmente:

```bash
curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"
```

Los logs del worker aparecerán en la terminal. Verificá que en Discord aparezcan los mensajes de prueba.

---

## Deploy a producción

```bash
npm run deploy
```

Verificá en el [Cloudflare Dashboard](https://dash.cloudflare.com) → Workers & Pages → `render-log-monitor` → **Triggers** → Cron Triggers que figure `* * * * *`.

---

## Estructura del proyecto

```
render_logger/
├── src/
│   ├── index.ts           # Entrypoint — handler scheduled()
│   ├── renderClient.ts    # Cliente Render API (fetch + paginación)
│   ├── discordNotifier.ts # Envía embeds vía Discord REST API
│   └── logFilter.ts       # Clasificación de logs en eventos tipados
├── wrangler.jsonc          # Config Cloudflare Workers + KV + cron
├── package.json
├── tsconfig.json
└── .env.example            # Plantilla de secrets
```

---

## Personalización

### Agregar patrones de deploy exitoso

Editá `src/logFilter.ts` → `DEPLOY_SUCCESS_PATTERNS`:

```typescript
const DEPLOY_SUCCESS_PATTERNS = [
  /deploy\s+live/i,
  /build\s+successful/i,
  /mi-patron-custom/i,  // ← agregá el tuyo
];
```

### Agregar más servicios

En `wrangler.jsonc`, no hay nada que cambiar. En `src/renderClient.ts`, la función `fetchLogs` acepta un solo `RENDER_SERVICE_ID`. Para múltiples servicios, podés extender `Env` con `RENDER_SERVICE_IDS` (separados por coma) e iterar.

### Silenciar errores específicos

Editá `IGNORED_PATTERNS` en `src/logFilter.ts`:

```typescript
const IGNORED_PATTERNS = [
  /health\s+check/i,
  /keep.alive/i,
];
```
