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
> (Turbopack por defecto, `params`/`searchParams` asíncronos, `middleware.ts` renombrado a `proxy.ts`,
> `fetch` sin cache por defecto). Ver `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md`
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

## Variables de entorno

Ver [`.env.example`](.env.example) — están agrupadas por: sitio/dominio, Supabase, datos de negocio
pendientes (bloquean el build de producción si faltan), notificaciones (opcional) y feature flags (seña y
Turnstile, ambas apagadas).

## Deploy

- Crear **dos** proyectos separados (preview y producción) tanto en el hosting como en Supabase — nunca
  compartir base de datos entre ambos.
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
| `pnpm test:integration` | RLS, RPC transaccional, concurrencia (dos reservas al mismo slot)             | `pnpm supabase:start` (Docker)      |
| `pnpm test:e2e`         | Flujos completos, teclado, mobile, redirect de `/admin` sin sesión            | Nada (levanta su propio `next dev`) |
| `pnpm build` (prod env) | Que el build falle si faltan datos de negocio, claves Supabase o secretos     | Variables de entorno de producción  |

## Limitaciones conocidas de este entorno de desarrollo

- Este sandbox no tiene Docker/Supabase CLI instalados, así que `pnpm test:integration` está escrito y
  listo pero **no se ejecutó acá** — sí corre en CI (`.github/workflows/ci.yml`, job `db-and-e2e`, que usa
  Docker) y en cualquier máquina de desarrollo con Docker Desktop.
- El resto (`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm test:e2e`) se ejecutó y pasa en
  este entorno.
