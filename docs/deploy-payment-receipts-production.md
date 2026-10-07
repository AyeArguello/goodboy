# Despliegue a producción: flujo de comprobantes de seña

Estado de referencia: rama `codex/netlify-deploy-preview` en el commit
`8c3b2b0` (CI verde: quality, 68 integración y 26 E2E sin omitidos).
Hosting de la aplicación: **Netlify Free**.
Proyecto Supabase de producción: `rmfnrvidepyirtvjumgy` (plan Free).

## Estado operativo actualizado (2026-10-06)

Esta sección reemplaza los estados históricos de preflight que se conservan
más abajo como trazabilidad:

- Supabase CLI está autenticada y vinculada; 12 migraciones están alineadas.
  Solo `20261005153527_confirm_cancellation_and_refund_policy.sql` queda local.
- `payment_receipts_flow` y el hardening de `enforce_rate_limit` ya están
  aplicados. La base de negocio sigue vacía: 0 turnos, pagos, comprobantes y
  objetos de Storage.
- `pg_cron`, `pg_net` y Vault están configurados. El cron diario de purga está
  activo a las 06:15 UTC.
- `purge-payment-receipts` está ACTIVE, versión 2. La prueba posterior al
  despliegue dio 405/401/401 y una ejecución autenticada exitosa vía Vault,
  sin candidatos ni errores.
- Netlify tiene las 12 variables obligatorias y Supabase Auth incluye las URLs
  de callback del sitio. El Deploy Preview del PR 1 compiló correctamente con
  `publish = ".next"`, pero está protegido por Netlify Team Protection; la
  sesión de navegador actual no pertenece al equipo y todavía no permite los
  smoke tests HTTP.
- El dump previo a la migración pendiente está bloqueado: la CLI confirmó que
  necesita Docker o Podman y ninguno está instalado. El archivo `schema.sql`
  creado por el intento mide 0 bytes y **no es un respaldo válido**. No aplicar
  la migración hasta obtener el dump real.
- `goodboy.com.ar` sigue sin comprar; Resend usa temporalmente
  `onboarding@resend.dev`. Las páginas legales siguen como borrador `noindex`.

> **Este documento es un procedimiento, no una autorización.** Nada de lo que
> sigue se ejecuta hasta que haya una autorización explícita y por escrito para
> cada fase (ver la checklist final). Ningún valor de secreto aparece acá ni
> debe aparecer en la consola, el historial de la shell, el repositorio ni los
> logs.

Convenciones:

- Los comandos son para **Git Bash** y se ejecutan desde la raíz del repo. Si
  la CLI no está instalada globalmente, reemplazar `supabase` por
  `npx supabase` (se probó la 2.119.0).
- `BACKUP_DIR` es una carpeta **fuera del repositorio**, por ejemplo
  `"$HOME/backups/good-boy/$(date +%Y%m%d-%H%M)"`.
- `<TOKEN>` y `<SECRETO>` nunca se escriben en un comando: se leen con
  `read -rs` o se pasan por archivo temporal fuera del repo (ver 6 y 8).

---

## 0. Estado verificado en el preflight (solo lectura)

| Verificación                                   | Resultado                                                                                                                      |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Árbol de trabajo                               | limpio, rama `main`, commit `b3013c2`                                                                                          |
| Proyecto remoto consultado                     | `https://rmfnrvidepyirtvjumgy.supabase.co` (coincide)                                                                          |
| CLI de Supabase                                | no instalada globalmente; `npx supabase` 2.119.0 funciona                                                                      |
| CLI autenticada / vinculada                    | **No**: `supabase/.temp/project-ref` no existe y no hay `SUPABASE_ACCESS_TOKEN`                                                |
| `supabase migration list`, `db push --dry-run` | **No ejecutables todavía** (requieren `login` + `link`)                                                                        |
| Base remota                                    | **vacía**: 0 turnos, 0 pagos, 0 horarios, 0 administradores, 0 buckets; ninguna de las tablas, columnas ni tipos nuevos existe |
| Extensiones remotas                            | instaladas: `pgcrypto`, `uuid-ossp`, `pg_stat_statements`, `supabase_vault`. **No instaladas**: `pg_cron`, `pg_net`            |

### Historial de migraciones: hallazgo bloqueante

El historial remoto fue creado aplicando las migraciones con la integración
de Supabase, que les asignó otras versiones (timestamps) que los nombres de
archivo locales:

| Nombre                                  | Versión remota | Archivo local  |
| --------------------------------------- | -------------- | -------------- |
| extensions                              | 20261001184904 | 20260101000001 |
| schema                                  | 20261001184922 | 20260101000002 |
| rls                                     | 20261001184935 | 20260101000003 |
| rpc_public                              | 20261001185002 | 20260101000004 |
| rpc_admin                               | 20261001185050 | 20260101000005 |
| v3_hardening                            | 20261001190524 | 20260101000006 |
| fix_function_search_path                | 20261001190842 | 20260101000007 |
| fix_set_updated_at_search_path          | 20261001191022 | 20260101000008 |
| fix_request_appointment_pgcrypto        | 20261002011740 | 20261001194349 |
| fix_admin_cancel_appointment_event_type | 20261002011751 | 20261002005759 |
| payment_receipts_flow                   | — (pendiente)  | 20261002123846 |

Por nombre, la única migración pendiente es `payment_receipts_flow`. Pero la
CLI compara **por versión**: `supabase db push` vería diez versiones remotas
sin archivo local y once locales sin registro remoto, y se negaría a
continuar (o intentaría reaplicar el esquema completo). **No ejecutar
`db push` sin resolver esto antes** (paso 2).

---

## 1. Preflight y vínculo (no modifica el remoto)

```bash
git status --short                 # debe estar vacío
git rev-parse --short HEAD         # debe ser b3013c2
git branch --show-current          # main

supabase --version
supabase login                     # abre el navegador; no pega el token en la consola
supabase link --project-ref rmfnrvidepyirtvjumgy   # pide la contraseña de la base: tipearla, no pasarla por argumento
cat supabase/.temp/project-ref ; echo   # debe imprimir rmfnrvidepyirtvjumgy
```

`link` solo escribe en `supabase/.temp/` (ignorado por Git). **Detener** si el
ref impreso no es `rmfnrvidepyirtvjumgy`.

```bash
supabase migration list            # solo lectura
supabase db push --dry-run         # solo lectura
```

Criterio de continuación: el `--dry-run` debe listar **únicamente**
`20261002123846_payment_receipts_flow.sql`. Con el historial sin reparar va a
fallar o a listar más cosas: es esperado, ver paso 2. **Detener** ante
cualquier otra migración inesperada.

## 2. Backup previo (Supabase Free no incluye backups descargables)

El plan Free no ofrece backups diarios ni PITR. El backup se hace con
`supabase db dump`, que requiere Docker en la máquina local (usa `pg_dump`
dentro de un contenedor). Si no hay Docker, usar `pg_dump` directo con la
cadena de conexión del proyecto, ingresada con `read -rs`, nunca como
argumento visible.

```bash
BACKUP_DIR="$HOME/backups/good-boy/$(date +%Y%m%d-%H%M)"
mkdir -p "$BACKUP_DIR" && chmod 700 "$BACKUP_DIR"

supabase db dump --linked -f "$BACKUP_DIR/schema.sql"
supabase db dump --linked --data-only -f "$BACKUP_DIR/data.sql"
supabase db dump --linked --role-only -f "$BACKUP_DIR/roles.sql"
supabase migration list > "$BACKUP_DIR/migration-list-before.txt"

ls -l "$BACKUP_DIR"   # los tres .sql deben existir y no estar vacíos
```

- Guardar `BACKUP_DIR` **fuera del repo** y no commitearlo. Los archivos
  pueden contener datos personales (en este momento la base está vacía).
- **Los objetos de Storage no forman parte del dump de Postgres.** Hoy no
  hay buckets ni objetos. Después del lanzamiento, un backup de comprobantes
  requiere copiar el bucket aparte (`supabase storage cp -r --experimental
ss:///payment-receipts "$BACKUP_DIR/storage"`), y hay que decidir si eso es
  deseable: los comprobantes tienen una retención corta a propósito.
- **Detener** si algún dump falla o queda vacío.

## 3. Reparar el historial de migraciones (modifica solo la tabla de historial)

`supabase migration repair` solo escribe en `supabase_migrations.schema_migrations`;
no toca el esquema ni los datos. Requiere autorización explícita porque es una
escritura en el remoto.

```bash
# 1) Marcar como revertidas las versiones remotas que no existen como archivo
supabase migration repair --status reverted \
  20261001184904 20261001184922 20261001184935 20261001185002 20261001185050 \
  20261001190524 20261001190842 20261001191022 20261002011740 20261002011751

# 2) Marcar como aplicadas las versiones locales equivalentes (mismo contenido)
supabase migration repair --status applied \
  20260101000001 20260101000002 20260101000003 20260101000004 20260101000005 \
  20260101000006 20260101000007 20260101000008 20261001194349 20261002005759

supabase migration list
```

Verificación: `migration list` debe mostrar las diez migraciones con **Local y
Remote iguales** y `20261002123846` solo en Local.

Alternativa descartada: renombrar los archivos locales a las versiones
remotas. Obliga a un commit que reescribe nombres de migraciones ya
integradas y rompería el historial de CI.

**Detener** si después de la reparación `migration list` no es exactamente
lo descrito.

## 4. Dry-run y aplicación de la migración

```bash
supabase db push --dry-run
```

Debe listar solo `20261002123846_payment_receipts_flow.sql`. Con la
autorización explícita:

```bash
supabase db push
supabase migration list     # las once, Local = Remote
```

Seguridad de la migración sobre los datos actuales (revisada línea por línea):

- No hay `drop`, `truncate` ni cambios de tipo de columna. Los únicos `delete`
  están dentro del cuerpo de funciones de mantenimiento (no se ejecutan al
  aplicar).
- Las columnas nuevas de `appointments` y `payments` son `add column if not
exists`, nulas o con default; el `update` de relleno solo completa
  `closed_at`/`completed_at` en turnos ya terminados (hoy hay 0).
- La exigencia de email es un trigger `BEFORE INSERT`: no invalida filas
  existentes.
- El índice único `payments_one_verified_deposit_idx` puede fallar si hay
  depósitos verificados duplicados: hoy hay 0 pagos.
- El bucket `payment-receipts` se crea privado, con límite de 5 MB y solo
  JPEG/PNG/WebP (`insert ... on conflict`).
- Reemplaza las funciones `public_availability`, `expire_overdue_deposits`,
  `admin_record_deposit_payment`, `request_appointment`,
  `get_appointment_status` y `enforce_rate_limit`. **Cambio de comportamiento:**
  `request_appointment` ahora **rechaza solicitudes sin email**. Una versión
  anterior del sitio que no envíe email dejaría de poder reservar (ver el
  orden en el paso 10).
- El archivo se ejecuta como una sola transacción: si falla, no queda nada a
  medias.

Verificaciones posteriores (SQL de solo lectura, en el editor SQL del
Dashboard o con `supabase db query --linked`):

```sql
select count(*) from information_schema.tables
 where table_schema='public'
   and table_name in ('payment_receipts','payment_upload_tokens','email_outbox','receipt_purge_runs');
-- esperado: 4

select id, public, file_size_limit, allowed_mime_types
  from storage.buckets where id = 'payment-receipts';
-- esperado: 1 fila, public = false, 5242880, {image/jpeg,image/png,image/webp}

select tablename, rowsecurity from pg_tables
 where schemaname='public'
   and tablename in ('payment_receipts','payment_upload_tokens','email_outbox','receipt_purge_runs');
-- esperado: rowsecurity = true en las cuatro

select p.proname,
       has_function_privilege('anon', p.oid, 'execute') as anon,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
       has_function_privilege('service_role', p.oid, 'execute') as service_role
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('get_upload_context','register_payment_receipts','purge_candidates',
                     'mark_receipt_deleted','mark_receipt_deletion_failed',
                     'purge_operational_records','record_purge_run',
                     'email_outbox_claim','email_outbox_complete');
-- esperado: anon = false y authenticated = false en todas; service_role = true

select count(*) from pg_policies
 where schemaname='storage' and tablename='objects'
   and qual ilike '%payment-receipts%';
-- esperado: 0 (ninguna policy sobre el bucket: solo la service role lo toca)
```

Además, correr los advisors de seguridad del proyecto (Dashboard >
Advisors > Security) y revisar que no aparezcan hallazgos nuevos sobre las
tablas o funciones de este flujo.

**Detener** y no continuar si cualquiera de estas verificaciones difiere.

## 5. Extensiones para el cron

```sql
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net  with schema extensions;
```

(o Dashboard > Database > Extensions). Verificar con
`select extname from pg_extension where extname in ('pg_cron','pg_net','supabase_vault');`
→ tres filas.

## 6. Secreto de la función y despliegue de la Edge Function

`PURGE_CRON_SECRET` aún **no está generado**. Cuando se autorice, generarlo
sin mostrarlo y fuera del repo:

```bash
SECRETS_FILE="$BACKUP_DIR/purge.secrets.env"
umask 077
printf 'PURGE_CRON_SECRET=%s\n' "$(openssl rand -base64 48 | tr -d '\n')" > "$SECRETS_FILE"
wc -c "$SECRETS_FILE"       # solo el tamaño; NO usar cat

supabase secrets set --env-file "$SECRETS_FILE"
supabase secrets list       # muestra nombres y digest, no el valor: debe aparecer PURGE_CRON_SECRET
```

`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` los inyecta la plataforma en la
función: **no se configuran**.

```bash
supabase functions deploy purge-payment-receipts --project-ref rmfnrvidepyirtvjumgy
supabase functions list     # purge-payment-receipts ACTIVE
```

`verify_jwt = false` viene de `supabase/config.toml`; la función se protege
con el secreto compartido y, si no está configurado, se niega a ejecutar
(responde 500 `not_configured`).

## 7. Prueba manual segura de la función (no modifica datos)

Con la base recién migrada no hay candidatos, así que la llamada correcta
devuelve un resumen con `candidates: 0` y solo registra una corrida en
`receipt_purge_runs`.

```bash
FN_URL="https://rmfnrvidepyirtvjumgy.supabase.co/functions/v1/purge-payment-receipts"
read -rs -p "PURGE_CRON_SECRET: " SECRETO; echo     # se pega desde el gestor de secretos; no queda en el historial

# a) método incorrecto → 405
curl -s -o /dev/null -w "GET: %{http_code}\n" "$FN_URL"

# b) POST sin secreto → 401
curl -s -o /dev/null -w "sin secreto: %{http_code}\n" -X POST "$FN_URL"

# c) POST con secreto incorrecto → 401
printf 'header = "Authorization: Bearer incorrecto"\n' | \
  curl -s -o /dev/null -w "secreto incorrecto: %{http_code}\n" -K - -X POST "$FN_URL"

# d) POST con el secreto correcto → 200 (el secreto va por stdin, no por argumentos)
printf 'header = "Authorization: Bearer %s"\n' "$SECRETO" | \
  curl -s -w "\ncorrecto: %{http_code}\n" -K - -X POST "$FN_URL" -H "Content-Type: application/json" -d '{}'
unset SECRETO
```

Esperado: `405`, `401`, `401`, y `200` con
`{"source":"cron", ..., "candidates":0,"deleted":0,"failed":0,"error":null}`.

Verificar la corrida: `select source, candidates, deleted, failed, error from receipt_purge_runs order by started_at desc limit 1;`
→ una fila con `failed = 0` y `error` nulo. Revisar los logs de la función
(Dashboard > Edge Functions > Logs): no debe aparecer ningún valor de secreto.

**Detener** si algún código difiere, en particular si el caso (b) o (c)
devuelve 200 (la función estaría abierta): borrar la función y no
programar el cron.

## 8. Vault y cron diario

El valor del secreto debe ser el **mismo** en la función y en Vault. El
editor SQL del Dashboard guarda historial de consultas: **no pegar el
secreto ahí**. Usar un archivo SQL temporal fuera del repo y ejecutarlo con
`psql`/`supabase db query --linked -f`, y borrarlo al terminar.

```bash
SQL_FILE="$BACKUP_DIR/vault.sql"; umask 077
{
  printf "select vault.create_secret('%s', 'purge_project_url');\n" "https://rmfnrvidepyirtvjumgy.supabase.co"
  printf "select vault.create_secret('%s', 'purge_cron_secret');\n" "$(sed -n 's/^PURGE_CRON_SECRET=//p' "$SECRETS_FILE")"
} > "$SQL_FILE"
supabase db query --linked -f "$SQL_FILE"   # si la versión de la CLI no tiene `db query`, usar psql -f con la cadena de conexión leída con read -rs
shred -u "$SQL_FILE" 2>/dev/null || rm -f "$SQL_FILE"
```

Verificación (nombres, sin valores):
`select name from vault.decrypted_secrets where name in ('purge_project_url','purge_cron_secret');`
→ dos filas.

Programar el cron ejecutando `supabase/schedule-purge-payment-receipts.sql`
tal cual está en el repo (no contiene secretos; lee de Vault):

```bash
supabase db query --linked -f supabase/schedule-purge-payment-receipts.sql
```

Verificar:

```sql
select jobname, schedule, active from cron.job where jobname = 'purge-payment-receipts-daily';
-- esperado: '15 6 * * *' (06:15 UTC = 03:15 en Córdoba), active = true
```

Primera ejecución: esperar a la corrida de las 06:15 UTC o forzar una prueba
manual con el paso 7(d). Después de la corrida programada revisar
`select * from cron.job_run_details order by start_time desc limit 3;` y
`receipt_purge_runs`. Recordar que un proyecto Free **se pausa tras 7 días
sin actividad**; con el proyecto pausado el cron no corre.

Para desprogramar: `select cron.unschedule('purge-payment-receipts-daily');`.

## 9. Hosting: Netlify Free

El hosting de la aplicación Next.js es **Netlify (plan Free)**, no Vercel. No
hay `vercel.json`, paquetes `@vercel/*` ni código específico de Vercel en el
repositorio; las únicas menciones eran de documentación y ya se reemplazaron.

### Qué cambia en el repositorio (verificado con un build local de Netlify)

Se probó `netlify build --offline` (Netlify CLI, adaptador automático de
Next.js, v5.16.1) sobre una copia limpia del commit, con valores falsos solo
en el proceso:

| Prueba                                             | Resultado                                                                                                  |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `proxy.ts` (runtime Node.js de Next 16), Turbopack | **Falla**: `Cannot find module './chunks/[turbopack]_runtime.js'` al empaquetar la Edge Function del proxy |
| `proxy.ts` con `next build --webpack`              | **Falla**: `Cannot find module './webpack-runtime.js'`                                                     |
| `middleware.ts` (runtime edge), Turbopack          | **Pasa**: `Netlify Build Complete`, edge function `___netlify-edge-handler-middleware`                     |

La primera falla coincide con el issue abierto
[opennextjs/opennextjs-netlify#3575](https://github.com/opennextjs/opennextjs-netlify/issues/3575)
(sin arreglo publicado al momento de escribir esto). Por eso:

- `proxy.ts` pasó a **`middleware.ts`** (misma lógica, función `middleware`).
  `next build` imprime un aviso de deprecación esperado. Cuando Netlify
  arregle el issue se puede volver a `proxy.ts` (renombrar y cambiar el nombre
  de la función).
- `middleware.ts` corre en el runtime **edge**: usa solo `@supabase/ssr`, zod y
  `next/server`, y compiló. Su comportamiento en ejecución (redirección a
  `/admin/login` sin sesión, refresco de cookies) **solo se confirma en un
  Deploy Preview**: está en los smoke tests de la sección 10.
- `lib/security/clientKey.ts`: con `NETLIFY=true` usa **solo**
  `x-nf-client-connection-ip`, que Netlify fija por su cuenta y el cliente no
  puede falsificar. Si falta, **no** se confía en `x-forwarded-for` (cualquier
  cliente puede enviarlo): todas esas solicitudes comparten una clave
  "unknown". Fuera de Netlify (desarrollo, CI, tests) siguen disponibles
  `x-forwarded-for` y `x-real-ip`. Hay que confirmar en el Deploy Preview que
  `NETLIFY` llega al runtime de las funciones y que el límite de reservas se
  aplica por visitante (sección 10).
- Se agregó `netlify.toml` (`pnpm build`, `publish = ".next"` y
  `NODE_VERSION = "22"`, sin secretos, plugin ni redirecciones) y `.netlify` en
  `.gitignore`. **No** se instaló `@netlify/plugin-nextjs`: el adaptador se
  aplica solo y la prueba local lo demostró.

### Compatibilidad revisada

| Aspecto                                                             | Estado en Netlify                                                                                                                      |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Next.js 16 App Router, SSR, rutas dinámicas (`/turnos`, `/admin/*`) | Soportado por el adaptador. Pasó el build local                                                                                        |
| Server Actions (reserva, comprobante, panel)                        | Soportado sin configuración. Cuerpos pequeños: el archivo va directo a Storage                                                         |
| ISR `revalidate = 60` (portada) y `revalidatePath`                  | Soportado (revalidación por tiempo y bajo demanda)                                                                                     |
| `next/image`                                                        | Soportado: usa el Netlify Image CDN. Todas las imágenes son locales (`remotePatterns` vacío)                                           |
| Middleware del panel                                                | Solo como `middleware.ts` (edge); ver tabla de pruebas                                                                                 |
| Subida directa a Supabase Storage                                   | No pasa por Netlify (URL firmada del navegador a Supabase); no afecta el límite de cuerpo de las funciones                             |
| Cookies de Supabase Auth y callback del magic link                  | Sin cambios de código; confirmar en el Deploy Preview y agregar las URLs de Netlify en Supabase Auth                                   |
| CSP y cabeceras (`next.config.ts` `headers()`)                      | El adaptador las aplica; la CSP usa la URL de Supabase del build. Verificar con `curl -I` en el preview                                |
| Variables privadas (service role, Resend, HMAC)                     | Solo se leen en código de servidor (`server-only`); el CI verifica que no lleguen al bundle                                            |
| Puerta de producción (`next.config.ts`)                             | Se ejecuta en **cualquier** `next build`, también en Deploy Preview: todas las variables obligatorias deben existir en ambos contextos |

Dos observaciones de la prueba local:

- Durante el build la portada consulta `public_availability`; sin un Supabase
  alcanzable el build lo registra y sigue (la página se regenera cada 60 s).
  Con las variables reales se obtiene el dato real.
- En Windows, el empaquetado del adaptador necesita `node-linker=hoisted` o
  permiso de symlinks; en el build remoto de Netlify (Linux) no aplica.

### Plan Free: límites que hay que conocer

- Netlify Free **permite proyectos comerciales**.
- **300 créditos por mes** y un tope duro de créditos, sin recarga automática.
- Al agotar los créditos **el sitio se pausa** hasta el siguiente ciclo
  mensual. El plan Free **no genera cargos automáticos**.
- Consumo (tabla de créditos de Netlify): **15 créditos por despliegue a
  producción** (unos 20 despliegues al mes si no hubiera otro gasto), 10
  créditos por GB-hora de funciones (SSR, Server Actions, middleware), 2
  créditos cada 10 000 pedidos web y 20 créditos por GB de transferencia.
- Conviene no desplegar a producción en cada commit y revisar el consumo en el
  panel de Netlify (Billing > Usage) después del lanzamiento.
- Las variables de entorno de las funciones no pueden superar **4 KB en
  total**: mantener `NEXT_PUBLIC_BUSINESS_CANCELLATION_POLICY_TEXT` corto.

### Variables obligatorias (exactamente las que exige la puerta de producción)

Salen de `lib/config/productionGate.ts` y `lib/config/business.ts`. Si falta
alguna, el build falla nombrándola, sin mostrar valores.

| Variable                                        | Tipo        | Valor                                                                                                            | Contexto Netlify            | Se usa en                                    |
| ----------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------- | -------------------------------------------- |
| `NEXT_PUBLIC_SITE_URL`                          | pública     | Pendiente: `https://goodboy.com.ar` mientras no esté registrado, usar la URL `*.netlify.app` (https obligatorio) | Production y Deploy Preview | build (se incrusta) y runtime                |
| `NEXT_PUBLIC_SUPABASE_URL`                      | pública     | Confirmado: `https://rmfnrvidepyirtvjumgy.supabase.co`                                                           | ambos                       | build (CSP, bundle) y runtime                |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`                 | pública     | Configurada con la clave nueva `sb_publishable_...` (el nombre de la variable se conserva por compatibilidad)    | ambos                       | build y runtime                              |
| `SUPABASE_SERVICE_ROLE_KEY`                     | **secreta** | Configurada con la clave nueva `sb_secret_...`; nunca imprimir ni enviar al navegador                            | ambos                       | solo runtime (servidor) y la puerta de build |
| `ADMIN_EMAIL_ALLOWLIST`                         | privada     | Confirmado: `ayelearguello.aa@gmail.com` (agregar el correo de quien administre)                                 | ambos                       | runtime y la puerta de build                 |
| `RATE_LIMIT_HMAC_SECRET`                        | **secreta** | Configurada en Netlify con 48 bytes aleatorios criptográficos                                                    | ambos                       | runtime y la puerta de build                 |
| `RESEND_API_KEY`                                | **secreta** | Configurada en Netlify como secreto en los cuatro contextos remotos, con permiso de solo envío                   | ambos                       | runtime y la puerta de build                 |
| `RESEND_FROM_EMAIL`                             | privada     | Temporal: `onboarding@resend.dev`; cambiar a `turnos@goodboy.com.ar` después de comprar y verificar el dominio   | ambos                       | runtime y la puerta de build                 |
| `OWNER_NOTIFICATION_EMAIL`                      | privada     | Configurado: `ayelearguello.aa@gmail.com`                                                                        | ambos                       | runtime y la puerta de build                 |
| `DEPOSIT_TRANSFER_ALIAS`                        | privada     | Configurado: `ayearguello.mp`                                                                                    | ambos                       | runtime y la puerta de build                 |
| `NEXT_PUBLIC_LEGAL_ENTITY_NAME`                 | pública     | Configurado: `Ayelén Argüello` (Good Boy es el nombre comercial)                                                 | ambos                       | build (se incrusta) y la puerta              |
| `NEXT_PUBLIC_BUSINESS_CANCELLATION_POLICY_TEXT` | pública     | Configurada: reprogramación sin costo o devolución total en 24 h por transferencia                               | ambos                       | build (se incrusta) y la puerta              |

Reglas:

- Ninguna variable secreta lleva el prefijo `NEXT_PUBLIC_`:
  `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY` y `RATE_LIMIT_HMAC_SECRET` se
  llaman así y no deben renombrarse. Todo lo que lleva `NEXT_PUBLIC_` termina
  en el JavaScript del navegador.
- En Netlify, marcar las tres secretas (y, por prudencia, los correos y el
  alias) con **Contains secret values**, con alcance Builds, Functions y
  Runtime. **No** marcar como secretas las `NEXT_PUBLIC_*`: se incrustan a
  propósito en el bundle y el escaneo de secretos de Netlify haría fallar el
  build. Si el escaneo marcara la clave anon de Supabase, agregar su nombre a
  `SECRETS_SCAN_OMIT_KEYS`.
- Opcionales (no bloquean el build): `DEPOSIT_TRANSFER_HOLDER`,
  `DEPOSIT_TRANSFER_CBU`, Turnstile (apagado) y
  `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`.
- Hoy hay una sola base de datos (la de producción). Un Deploy Preview con las
  claves reales escribe en ella: usar el preview solo con los smoke tests de la
  sección 10 y borrar los datos de prueba. Si se prefiere aislar, crear un
  segundo proyecto de Supabase para los previews y cargar sus claves solo en el
  contexto Deploy Preview.

### Supabase Edge Functions (secretos de la función)

| Variable                                    | Origen                                          |
| ------------------------------------------- | ----------------------------------------------- |
| `PURGE_CRON_SECRET`                         | `supabase secrets set` (ya cargado)             |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | inyectadas por la plataforma; **no configurar** |

### Supabase Vault (lo lee el cron desde la base)

| Secreto de Vault    | Valor                                                             |
| ------------------- | ----------------------------------------------------------------- |
| `purge_project_url` | URL del proyecto (ya cargado)                                     |
| `purge_cron_secret` | el mismo valor que `PURGE_CRON_SECRET` de la función (ya cargado) |

### ¿`PURGE_CRON_SECRET` va en Netlify?

**No.** Solo en la Edge Function y en Vault. Ningún código de la aplicación
Next.js lo lee: la ejecución manual desde el panel (`/admin/mantenimiento`)
corre el mismo núcleo de purga directamente con la service role y no llama a la
función por HTTP. Cargarlo en Netlify solo ampliaría la superficie de
exposición sin ningún uso. (Las otras apariciones del nombre son el CI, que usa
un valor falso propio, y los tests.)

### Estado de la configuración en Netlify

El sitio `clinquant-pithivier-afc538` existe y tiene las doce variables de la
tabla en Production y Deploy Preview. El PR 1 genera correctamente
`https://deploy-preview-1--clinquant-pithivier-afc538.netlify.app/`; Team
Protection responde 401 fuera de una sesión autorizada.

## 10. Orden de despliegue en Netlify y criterios de detención

La base (migraciones, función, secreto, Vault y cron) ya está lista. El resto:

1. **Crear el sitio** en Netlify desde el repositorio `AyeArguello/goodboy`
   (Add new project > Import from Git, rama `main`). No cambiar el comando de
   build ni agregar directorio de publicación: salen de `netlify.toml` y del
   adaptador automático. Anotar el subdominio `*.netlify.app` asignado.
2. **Cargar las variables** (sección 9) en el sitio, sin imprimirlas: por la
   interfaz (Site configuration > Environment variables, con "Contains secret
   values" en las secretas) o con `netlify env:import` desde un archivo fuera
   del repo que se borra al terminar. Verificar con `netlify env:list` que
   cada nombre existe en el contexto correcto (los secretos no se muestran).
3. **En Supabase Auth** (Dashboard > Authentication > URL Configuration) agregar
   a las URLs de redirección el subdominio `https://<sitio>.netlify.app/**` (y
   luego el dominio propio) y fijar el Site URL. Sin esto el magic link del
   panel no vuelve al sitio.
4. **Primer despliegue = Deploy Preview**, no producción: abrir un pull request
   con un cambio mínimo (o usar `netlify deploy` sin `--prod`). Un despliegue a
   producción cuesta 15 créditos; el primero recién cuando el preview pase.
5. **Smoke tests sobre el preview** (todos deben pasar antes de promover):
   - la portada carga, con imágenes y estilos;
   - `curl -I https://<preview>/` muestra la CSP, HSTS, `X-Content-Type-Options`
     y `Referrer-Policy` de `next.config.ts`;
   - `/admin` sin sesión redirige a `/admin/login` (confirma `middleware.ts`);
   - `/turnos` lista horarios reales y `/turnos/estado` responde;
   - el login del panel con un correo de la allowlist envía el magic link, el
     enlace vuelve a `/admin/auth/callback` y deja entrar;
   - `/turnos/comprobante` sin enlace muestra "Falta el enlace";
   - ninguna credencial aparece en la respuesta de las páginas ni en el log del
     build (buscar el nombre de las variables secretas en el HTML y en
     `/_next/static`).
6. **Producción**: con el preview aprobado, publicar `main` en producción y
   repetir los smoke tests; después el recorrido real de la sección 12.
7. **Dominio propio** (`goodboy.com.ar`, una vez registrado): agregarlo en
   Domain management, crear los registros DNS que Netlify indique (CNAME/ALIAS
   o los nameservers de Netlify), esperar el certificado SSL automático,
   cambiar `NEXT_PUBLIC_SITE_URL` al dominio propio, volver a desplegar y
   actualizar las URLs de redirección de Supabase Auth.

Detener el despliegue y no seguir cuando:

- el build de Netlify falla por la puerta de producción (falta alguna
  variable) o por el escaneo de secretos;
- el empaquetado de `middleware.ts` falla en Netlify o `/admin` no redirige;
- falta alguna cabecera de seguridad en el preview;
- una credencial aparece en consola, logs, HTML o archivos del repo;
- el consumo de créditos del mes se acerca a 300 (al agotarlos el sitio se
  pausa).

## 11. Rollback

| Situación                                                      | Acción                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `db push` falla                                                | No requiere acción: la migración corre en una transacción y no deja nada aplicado. Corregir y repetir.                                                                                                                                                                                                                                                                                                                                                        |
| Migración aplicada pero hay un problema (sin tráfico real aún) | La base no tiene datos de negocio. Opción preferida: corregir hacia adelante con una migración nueva. Si hay que volver al estado anterior, restaurar el esquema con `$BACKUP_DIR/schema.sql` sobre una base limpia (`supabase db reset --linked` **destruye todos los datos: solo con autorización específica** y solo mientras la base esté vacía). Los valores nuevos de enum (`appointment_event_type`) no se pueden quitar con DDL; sin uso son inocuos. |
| Migración aplicada y ya hay datos reales                       | No revertir con DDL. Corregir hacia adelante; si hace falta, restaurar desde un dump tomado justo antes del cambio y reconciliar manualmente los datos posteriores.                                                                                                                                                                                                                                                                                           |
| La función se comporta mal                                     | `supabase functions delete purge-payment-receipts` y `select cron.unschedule('purge-payment-receipts-daily');`. Los comprobantes no se borran hasta que la purga corra, así que desprogramar no pierde datos; pasada la retención se purgan al reactivarla.                                                                                                                                                                                                   |
| Secreto expuesto                                               | Generar uno nuevo, repetir los pasos 6 y 8 (`vault.update_secret` en lugar de `create_secret`) y revocar el anterior.                                                                                                                                                                                                                                                                                                                                         |
| La aplicación nueva falla                                      | En Netlify, Deploys > elegir el deploy anterior > Publish deploy (rollback inmediato). Ojo: el sitio anterior no envía email y la base nueva lo exige, así que volver al sitio viejo corta las reservas; si es necesario, aplicar una migración que relaje temporalmente el trigger `appointments_require_email_guard` (decisión a tomar en ese momento).                                                                                                     |
| Reparación del historial equivocada                            | `supabase migration repair --status applied                                                                                                                                                                                                                                                                                                                                                                                                                   | reverted <versión>` es reversible; no toca el esquema. |

El rollback del historial (paso 3) y el de datos son procedimientos
distintos: ningún `repair` borra tablas.

## 12. Checklist del recorrido real (después de desplegar la aplicación)

Hacerlo con un correo propio y con el alias de transferencia real, y limpiar
los datos de prueba al terminar.

1. **Reserva:** elegir un horario publicado, completar el formulario con email
   propio → pantalla "Recibimos tu solicitud" con el código `GB-XXXXXXXX`.
   Llegó el email de "solicitud recibida" (y el aviso al dueño).
2. **Estado:** en `/turnos/estado` el código muestra "Pendiente de revisión".
3. **Aprobación:** entrar a `/admin` con un correo de la allowlist (la
   primera vez se crea la fila en `admin_profiles`), aprobar la solicitud →
   llega el email con el alias, el monto y el enlace `/turnos/comprobante#t=…`.
4. **Carga:** abrir el enlace, subir primero un archivo inválido (PDF o
   > 5 MB) y comprobar el mensaje claro; luego una imagen real → "Comprobante
   > recibido". Llega el aviso al dueño; el estado pasa a "Comprobante
   > recibido, pendiente de verificación". El enlace ya no sirve para subir de
   > nuevo.
5. **Verificación:** en el panel, abrir el comprobante (URL firmada de
   60 s), confirmar la seña → el turno queda "Confirmado" y llega el email de
   confirmación. Repetir el clic no genera un segundo pago.
6. **Rechazo (variante):** con otra reserva, rechazar el comprobante con un
   motivo → email con el motivo y un enlace nuevo para volver a subir.
7. **Privacidad:** el bucket sigue privado (una URL pública del objeto
   devuelve error), y las páginas de privacidad y términos mencionan la
   retención de comprobantes.
8. **Purga:** con un comprobante de prueba, adelantar `retention_until`
   (SQL controlado) y ejecutar el paso 7(d) o "Ejecutar limpieza" en
   `/admin/mantenimiento` → el objeto desaparece del bucket, la fila queda
   `deleted` y el historial de pagos se conserva. Confirmar en
   `receipt_purge_runs`.
9. **Cron:** al día siguiente de las 06:15 UTC, verificar `cron.job_run_details`
   y una fila nueva en `receipt_purge_runs` con `source = 'cron'`.
10. **Limpieza:** borrar los turnos de prueba y sus comprobantes, y confirmar
    que `storage.objects` del bucket no conserva archivos de prueba.

## 13. Checklist de autorización final

Cada ítem requiere un "sí" explícito antes de ejecutarse:

- [ ] Iniciar sesión en la CLI y vincular el proyecto (`login`, `link`).
- [ ] Tomar el backup y guardarlo en la carpeta indicada fuera del repo.
- [ ] Reparar el historial de migraciones (`migration repair`, paso 3).
- [ ] Aplicar `20261002123846_payment_receipts_flow.sql` (`db push`).
- [ ] Habilitar `pg_cron` y `pg_net`.
- [ ] Generar `PURGE_CRON_SECRET` y cargarlo como secreto de la función.
- [ ] Desplegar la Edge Function `purge-payment-receipts`.
- [ ] Ejecutar las pruebas del endpoint (405, 401, 401, 200).
- [ ] Cargar `purge_project_url` y `purge_cron_secret` en Vault.
- [ ] Programar el cron diario.
- [ ] Crear el sitio de Netlify, cargar sus variables, desplegar primero un Deploy Preview y, tras los smoke tests, producción.
- [ ] Confirmar con el dueño los datos de negocio pendientes
      (`DEPOSIT_TRANSFER_ALIAS`, razón social, política de cancelación,
      remitente y dominio de Resend verificados).
