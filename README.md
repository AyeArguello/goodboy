# Good Boy — Peluquería Canina

Landing + turnero (reserva de turnos) + panel admin para una peluquería canina. Ver
[`docs/assumptions.md`](docs/assumptions.md) para los datos de negocio confirmados, los que todavía faltan
(bloquean el lanzamiento) y las decisiones de arquitectura tomadas.

## Stack (versiones exactas)

| Paquete               | Versión                                    |
| --------------------- | ------------------------------------------ |
| Next.js               | 16.3.6 (App Router, Turbopack)             |
| React / React DOM     | 19.2.8                                     |
| TypeScript            | 5.9.3 (estricto)                           |
| Tailwind CSS          | 4.3.3                                      |
| Node.js               | 22.x (mínimo soportado por Next 16: 20.9+) |
| pnpm                  | 10.15.1                                    |
| @supabase/supabase-js | 2.117.1                                    |
| @supabase/ssr         | 0.12.7                                     |
| Vitest                | 5.0.1                                      |
| @playwright/test      | 1.63.0                                     |
| Resend                | 6.28.1 (opcional)                          |

> Este proyecto corre sobre Next.js 16, que tiene cambios importantes respecto a versiones anteriores
> (Turbopack por defecto, `params`/`searchParams` asíncronos, `middleware.ts` renombrado a `proxy.ts` — aquí se mantiene
> `middleware.ts` por Netlify, ver "Deploy"; `fetch` sin cache por defecto). Ver `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md`
> antes de tocar convenciones de rutas/caching.

## Desarrollo

```bash
pnpm install
cp .env.example .env.local   # completar según docs/assumptions.md
pnpm supabase:start          # levanta Postgres + Auth local (requiere Docker)
pnpm dev
```

La landing (`/`) funciona sin Supabase configurado. El turnero (`/turnos`) y el panel (`/admin`) necesitan
`NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY` apuntando a una
instancia real (local o cloud).

## Comandos

```bash
pnpm typecheck        # tsc --noEmit
pnpm lint             # eslint (flat config)
pnpm format / format:check
pnpm test             # vitest — unidad (reglas de negocio, dominio, UI)
pnpm test:integration # RLS + RPC transaccional + concurrencia, contra Supabase local
pnpm test:e2e         # Playwright — flujos completos
pnpm build            # next build — en producción falla si faltan NAP/WhatsApp/horario/dominio (lib/config/business.ts)
                      # o Supabase URL/claves, dominio https, allowlist admin y secreto HMAC (lib/config/productionGate.ts)
```

## Migraciones y seed

```bash
pnpm supabase:start   # primera vez: crea el proyecto local y aplica supabase/migrations/*
pnpm supabase:reset   # reaplica migraciones + supabase/seed.sql desde cero (dev/preview únicamente)
```

`supabase/seed.sql` **nunca** se corre contra producción — son datos de ejemplo para desarrollo/preview
(los mismos horarios/solicitudes de ejemplo que aparecen en el diseño: Luna, Toby, Mora, etc.).

Para apuntar a un proyecto Supabase real: crear el proyecto en supabase.com, copiar `Project URL`/`anon
key`/`service_role key` a las variables de entorno del hosting, y correr `supabase link` +
`supabase db push` para aplicar las migraciones versionadas en `supabase/migrations/`.

## Comprobantes de seña y limpieza automática

La seña (ARS 20.000) se paga **solo por transferencia manual**; no hay Mercado Pago, tarjetas ni
recargos. Flujo: la solicitud queda `pending_review` → la dueña aprueba (`awaiting_deposit`) → el cliente
recibe un email con los datos y un enlace secreto (`/turnos/comprobante#t=…`, 256 bits, solo se guarda su
hash) → sube una imagen JPG/PNG/WebP (máx. 5 MB, 1–2 archivos) a un bucket **privado** → la dueña ve el
comprobante con una URL firmada de 60 s y confirma o rechaza → email de confirmación (y botón opcional
para abrir WhatsApp con el mensaje prearmado; nunca se envía solo).

- **Retención:** rechazado +7 días · solicitud vencida +7 días · turno completado/cancelado/cerrado +30
  días tras el cierre · `retention_hold` suspende la eliminación · reclamo resuelto +180 días.
- **Purga diaria:** Edge Function `supabase/functions/purge-payment-receipts` (idempotente, borra por la API
  de Storage, nunca por SQL). Programarla **una vez por proyecto** con
  `supabase/schedule-purge-payment-receipts.sql` (necesita `PURGE_CRON_SECRET` como secreto de la función
  y en Vault). También se puede correr a mano desde **Admin → Mantenimiento**.
- **Emails:** cada envío pasa por `email_outbox` con clave de idempotencia; si Resend falla, la transición
  no se revierte y se puede reintentar sin duplicar (Admin → Mantenimiento o Historial de la ficha).

## Variables de entorno

Ver [`.env.example`](.env.example) — están agrupadas por: sitio/dominio, Supabase, datos de negocio
pendientes (bloquean el build de producción si faltan), notificaciones (opcional) y feature flags (seña y
Turnstile, ambas apagadas).

## Deploy

Hosting: **Netlify (plan Free)** con el adaptador automático de Next.js (no hay plugin ni directorio de
publicación en `netlify.toml`). El procedimiento completo, el inventario de variables y los límites del
plan están en [`docs/deploy-payment-receipts-production.md`](docs/deploy-payment-receipts-production.md).

- Netlify Free: 300 créditos por mes (15 por despliegue a producción), sin cargos automáticos; al agotarlos
  el sitio se pausa hasta el siguiente ciclo. Netlify Free permite proyectos comerciales. No desplegar a producción en cada commit.
- El middleware del panel es `middleware.ts` (runtime edge) y no `proxy.ts`: el adaptador de Netlify aún
  no puede empaquetar el proxy de Node.js (opennextjs/opennextjs-netlify#3575). El aviso de deprecación en
  `next build` es esperado.
- Todas las variables obligatorias (`.env.example`, y el detalle en la guía de deploy) deben existir en los
  contextos Production **y** Deploy Preview de Netlify: la puerta de producción corre en cualquier build.
- Hay un único proyecto de Supabase (producción). Un Deploy Preview con sus claves escribe en esa base: usarlo
  solo para los smoke tests y limpiar los datos de prueba, o crear un segundo proyecto para previews.
- Aplicar migraciones explícitamente (`supabase db push`) antes de cada release, nunca automáticamente
  contra producción sin revisión.
- Seed solo en preview.
- Después de cada deploy: correr el smoke test (`pnpm test:e2e --grep smoke`) contra la URL real.
- Rollback: revertir el deploy en el hosting; las migraciones de Supabase son aditivas (no destructivas) —
  si una migración rompe algo, se corrige con una migración nueva, nunca editando una ya aplicada.

## Panel admin — operación

Manual de una página para la dueña: [`docs/manual-operacion.md`](docs/manual-operacion.md) (entrar, Hoy,
confirmar, reprogramar, cancelar, publicar horarios, WhatsApp). Pensado para imprimir o guardar en el
celular.

## Testing — qué corre dónde

| Comando                 | Qué prueba                                                                    | Requiere                            |
| ----------------------- | ----------------------------------------------------------------------------- | ----------------------------------- |
| `pnpm test`             | Reglas de negocio (24 h, 3/día, código, teléfono, WhatsApp, zona horaria), UI | Nada                                |
| `pnpm test:integration` | RLS, RPC, concurrencia, comprobantes + Storage real, purga, emails            | `pnpm supabase:start` (Docker)      |
| `pnpm test:e2e`         | Flujos completos, teclado, mobile, redirect de `/admin` sin sesión            | Nada (levanta su propio `next dev`) |
| `pnpm build` (prod env) | Que el build falle si faltan datos de negocio, claves Supabase o secretos     | Variables de entorno de producción  |

## Limitaciones conocidas de este entorno de desarrollo

- Este sandbox no tiene Docker/Supabase CLI instalados, así que `pnpm test:integration` está escrito y
  listo pero **no se ejecutó acá** — sí corre en CI (`.github/workflows/ci.yml`, job `db-and-e2e`, que usa
  Docker) y en cualquier máquina de desarrollo con Docker Desktop.
- El resto (`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm test:e2e`) se ejecutó y pasa en
  este entorno.
