# Good Boy — Peluquería Canina · Supuestos, datos y decisiones

Fuente original del diseño: `E:\Descargas\Good Boy Delivery Entrega-handoff\good-boy-delivery-entrega\project\`
(bundle de handoff de Claude Design). **Actualización v2 (2026-09-23):** el cliente envió un documento de
producto más completo (`Info.txt` + audios + logo, resumidos en un plan de producto/SEO/turnero) que
confirma datos de negocio que antes estaban pendientes y agrega un requisito nuevo — **seña obligatoria con
verificación manual** — que cambia la máquina de estados de las citas. **Actualización v3 (2026-09-29):**
llegaron `docs/plan-web-good-boy.md` (confirma dominio, correo admin y una grilla de sábado separada de la
de lunes a viernes) y `docs/auditoria-seguridad-y-cumplimiento-good-boy.md` (auditoría legal/técnica con
bloqueos P0, incluido un bug real de cancelación). **Actualización v4 (2026-10-01):** ronda de cierre técnico
(proyecto Supabase remoto creado con las migraciones aplicadas, build gate de secretos, CI corregido,
auditoría de secretos); los textos legales **no** se tocaron. La sección 6 explica v1→v2; la sección 7
explica puntualmente qué cambió en v3 y por qué; la sección 8, v4.

Mientras un dato siga en la sección 2 como pendiente, el código lo usa como placeholder tipado (ver
`lib/config/business.ts`) y el build de producción falla si falta al momento del deploy. La lista de
verificación de salida antes de publicar de verdad vive en
`docs/auditoria-seguridad-y-cumplimiento-good-boy.md` ("Checklist de salida") — esta sección 2 es la vista
técnica (qué bloquea el build); esa es la vista legal/operativa completa.

## 1. Datos confirmados

- **Nombre del negocio:** Good Boy — Peluquería Canina.
- **Dirección:** Manuel Toro 4047, Córdoba Capital, Córdoba, Argentina, CP 5010.
- **WhatsApp:** +54 9 3512 72-2097 → `+5493512722097` para enlaces `wa.me`.
- **Instagram:** [@goodboy.peluca](https://www.instagram.com/goodboy.peluca/).
- **Dominio confirmado:** `goodboy.com.ar` (disponible, verificado según
  `docs/plan-web-good-boy.md`) — falta **registrarlo** de verdad antes del lanzamiento; sigue viniendo de
  `NEXT_PUBLIC_SITE_URL`, nunca hardcodeado.
- **Correo admin confirmado:** `ayelearguello.aa@gmail.com` (allowlist única por ahora).
- **Días y horarios — grilla por día, no una sola grilla plana:**
  - Lunes a viernes: horarios de inicio publicables **09:00, 11:30 y 13:30**; cierre 16:00; máximo **3**
    turnos activos por día.
  - **Sábado: un único horario, 11:00, y máximo 1 turno activo.** No es una versión reducida de la grilla
    semanal — cualquier otro horario de sábado, o un segundo turno sabatino, se rechaza en servidor y en
    base de datos (trigger sobre `availability_slots`, no solo el RPC).
  - Domingo: cerrado, sin horarios.
  - Ver `lib/config/business.ts` (`weeklySchedule`) y `lib/domain/schedule.ts` (helpers que leen esa
    config) para la única fuente de verdad de este punto en el código TypeScript, y
    `is_allowed_slot_time`/`max_active_per_day_for` en
    `supabase/migrations/20260101000006_v3_hardening.sql` para el espejo en SQL.
- **Separación 11:30 → 13:30 = 120 min (lunes a viernes):** es una excepción **ya aprobada** por el
  negocio, no un error. El sistema debe seguir mostrando la advertencia informativa (< `warn_gap_minutes`)
  pero nunca bloquear esa combinación específica.
- **Objetivo diario:** hasta 3 perros de lunes a viernes (hoy suele atender 2), 1 los sábados. Duración real
  por perro: 2 h 30 min a 3 h 30 min.
- **Anticipación mínima:** 24 h (no se toman turnos para el mismo día).
- **Cancelación:** con **menos de 48 h** de anticipación, el cliente pierde la seña.
- **Agenda:** abierta a futuro sin límite de "una semana por vez".
- **Logo:** `assets/logo-good-boy.jpeg` (JPEG fondo blanco; no vectorizar/redibujar hasta tener SVG/PNG
  transparente).
- **Paleta de marca** (verificada con contraste sobre el diseño de alta fidelidad ya construido — ver §6
  sobre la ligera discrepancia con los tonos semánticos sugeridos en el documento v2):
  | Token                                                                                                                      | Hex       | Uso                                               |
  | -------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------- |
  | `color.lavender`                                                                                                           | `#C4B2D8` | superficies, CTA sobre fondo oscuro (nunca texto) |
  | `color.lavender-100`                                                                                                       | `#E9E2F0` | bandas, notas, estado seleccionado                |
  | `color.purple`                                                                                                             | `#684E7A` | botones, links, foco, eyebrows                    |
  | `color.purple-700`                                                                                                         | `#563F66` | hover/pressed del primario (derivado)             |
  | `color.charcoal`                                                                                                           | `#25282C` | texto, líneas, anillo de foco                     |
  | `color.ink-soft`                                                                                                           | `#55515B` | texto secundario, bordes de campo                 |
  | `color.canvas`                                                                                                             | `#FBF8FC` | fondo de página                                   |
  | `color.white`                                                                                                              | `#FFFFFF` | superficies, header, tarjetas                     |
  | error `#9E2F2A`/`#FBEAE8` · advertencia `#5E450C`/`#FBF1DD` · éxito `#1F5A3A`/`#E4F1E9` · reprogramado `#4F3A5E`/`#E9E2F0` |
- **Tipografía:** Montserrat 500/600/700 (títulos/botones/eyebrows) + Nunito Sans 400/600/700 (cuerpo),
  self-host vía `next/font/google`.
- **Servicios (dos paquetes, reemplazan la lista genérica v1):**
  1. **Mantos cortos y doble capa:** baño, deslanado, limpieza de oídos, corte de uñas, limpieza de zona de
     pulpejos, vaciado de glándulas perianales, terminación final con tijeras.
  2. **Mantos de crecimiento continuo:** baño, corte de pelo, corte higiénico, corte de uñas, limpieza y
     depilado de oídos, limpieza de zona de pulpejos, terminación final.
- **Precios orientativos (ARS):** Pequeño 30.000–40.000 · Mediano 40.000–50.000 · Grande 60.000–70.000.
  Disclaimer obligatorio junto a cualquier precio: _"Valores orientativos. El precio final se confirma al
  recibir y evaluar al perro según tamaño, estado del manto y trabajo necesario."_
- **Traslado:** cargo único, ida y vuelta, confirmado por barrio.
  - Barrio Las Palmas: **sin cargo**.
  - Barrios próximos a Las Palmas y barrio Jardín: ARS 5.000–8.000.
  - Zonas más alejadas (ej. Docta, Villa Libertador): ARS 10.000–13.000.
  - No publicar una lista de barrios excluidos por inseguridad: el copy dice "servicio sujeto a cobertura y
    condiciones de seguridad; confirmamos tu dirección por WhatsApp" — nunca nombra zonas rechazadas.
- **Pagos:** efectivo, transferencia, o tarjeta vía link de Mercado Pago. Recargos informados por el
  negocio: **1 cuota = 7%, 3 cuotas = 10,5%** — pero **no se publican ni se cobran todavía**: el 7% en una
  cuota entra en conflicto con el art. 37(c) de la Ley 25.065 (sin revisión legal/comercial no se puede
  cobrar diferencia contado/tarjeta). El modelo (`deposit.paymentOptions` en `lib/config/business.ts`) ya
  admite opciones por cantidad de cuotas y queda armado con `enabled: false`; no hay variable de entorno
  para encenderlo — es una decisión de código deliberada, no un dato pendiente que se complete solo.
- **Seña obligatoria:** ARS 20.000 para agendar, descontable del total. Verificación **manual** en el MVP
  (la dueña envía datos de transferencia o link de MP y marca el pago recibido desde el panel) — sin
  integrar Checkout Pro todavía.
- **Reglas no negociables (confirmadas):**
  - Anticipación mínima 24 h; validar también en servidor.
  - Máximo 3 turnos activos de lunes a viernes; máximo 1 el sábado (a las 11:00); domingo cerrado.
  - Advertencia (no bloqueo) si hay < 150 min entre horarios publicados del mismo día — incluida la
    separación aprobada de 120 min entre 11:30 y 13:30 (lunes a viernes).
  - El slot no se reserva al elegirlo en el formulario; se revalida recién al enviar.
  - Código de solicitud: `GB-` + 8 caracteres sin ambiguos (sin `0/O/1/I`), generados con un generador
    criptográfico (`gen_random_bytes()`), no adivinable. Subido de 4 a 8 caracteres en v3 — ver §7.
  - Cancelar un turno **confirmado** con menos de 48 h de anticipación pierde la seña **solo si cancela el
    cliente**. Si cancela el negocio dentro de esas 48 h, el turno se cancela igual pero la seña nunca se
    marca como perdida (`admin_cancel_appointment` distingue `p_initiated_by` — ver §7, era un bug real en
    v2).
  - Estado público: solo código, estado, fecha y dirección del local — nunca datos del cliente; se consulta
    por formulario (POST), nunca por la URL.
  - WhatsApp: `wa.me` con texto prearmado; nunca envío automático.
  - Mapa cargado solo tras clic explícito.
  - Ninguna cita se marca `confirmed` sin un pago de seña registrado por un admin autenticado.
  - Teléfono normalizado a formato internacional (+54), mostrando al usuario el valor editado.
  - Se guardan versiones de los términos aceptados (precio orientativo, seña, cancelación, privacidad) con
    timestamp.
- **Stack:** Next.js 16.3.6 (App Router, Turbopack), React 19.2.8, TypeScript 5.9.3 estricto, Tailwind CSS
  4.3.3, Supabase, pnpm 10.15.1. Ver README para detalle de versiones y las particularidades de Next 16
  (`proxy.ts` en vez de `middleware.ts`, `params`/`searchParams` async, `fetch` sin cache por defecto).
- **Zona horaria:** `America/Argentina/Cordoba` (IANA válida; reemplaza `Buenos_Aires` de v1 ahora que la
  ciudad está confirmada — mismo offset UTC-03:00 sin DST actualmente, pero es la zona semánticamente
  correcta).

## 2. Datos pendientes que bloquean el lanzamiento

| Dato                                                                                 | Dónde se usa                                               | Bloquea                                                          |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------- | ---------------------------------------------------------------- |
| Nombre y apellido completos de la persona responsable + situación fiscal/CUIT        | Footer, `/privacidad`, `/terminos-de-reserva`, facturación | Bloquea cobrar online — "Good Boy" no identifica al responsable  |
| Textos legales definitivos (privacidad, términos de reserva, reembolsos, revocación) | `/privacidad`, `/terminos-de-reserva`                      | Bloquea publicar (ambas páginas son placeholder `noindex`)       |
| Validación legal/comercial del recargo por cuotas (1 cuota 7% / 3 cuotas 10,5%)      | `deposit.paymentOptions.enabled`                           | Bloquea cobrar recargo — ver auditoría, art. 37(c) Ley 25.065    |
| Plazo para pagar la seña tras la aprobación (`deposit_due_hours`)                    | RPC `admin_approve_request`, pantalla "esperando seña"     | Alta — hoy usa un default de 24 h documentado como placeholder   |
| Política de devolución/reprogramación si cancela el negocio o hay fuerza mayor       | Términos de reserva, acciones admin                        | Media                                                            |
| Si la seña se puede pagar por transferencia **y** por link de MP, o solo una vía     | Instrucciones de pago                                      | Media (se asume que sí, ambas)                                   |
| Logo en SVG/PNG transparente + favicon recortado                                     | Header, favicon, OG                                        | Alta                                                             |
| Permiso de publicación de las 16 fotos + validación de captions                      | Galería, Hero                                              | Alta — ver auditoría "Aviso de fotos"                            |
| Registrar `goodboy.com.ar` de verdad (dominio ya confirmado como disponible)         | `NEXT_PUBLIC_SITE_URL`, canonical, OG                      | Bloquea producción real (build ya no se bloquea por esto en dev) |
| Cargar en el hosting la URL, anon key y service role del proyecto Supabase remoto    | Todo el backend                                            | Bloquea ir a producción (el build falla si faltan — ver §8)      |
| Credenciales Resend (opcional)                                                       | Alertas por correo                                         | No bloquea (adaptador noop en dev)                               |
| Revisión final de abogado/a y contador/a + checklist completo                        | Ver `docs/auditoria-seguridad-y-cumplimiento-good-boy.md`  | Bloquea publicar ("No publicar todavía")                         |

Ya no están pendientes (confirmados en v3, ver §7): dominio (`goodboy.com.ar`), correo admin
(`ayelearguello.aa@gmail.com`), grilla de sábado.

Ya no está pendiente (v4, ver §8): **el proyecto Supabase remoto existe** y tiene aplicadas las 8
migraciones de `supabase/migrations/`. Lo que sigue abierto es operativo: decidir si ese proyecto es el de
producción o el de preview (el README pide dos proyectos separados, nunca compartir base) y cargar sus
claves como variables de entorno del hosting.

## 3. Decisiones tomadas (dentro del margen que no compromete dinero/agenda/privacidad)

- **Backend:** Supabase (Postgres + Auth), RLS deny-by-default, escrituras públicas solo vía RPC
  `SECURITY DEFINER`.
- **Middleware de admin:** `proxy.ts` (convención Next 16), no `middleware.ts`.
- **Design system:** tokens como variables CSS + Tailwind v4 `@theme`, sin reescribir Tailwind desde cero.
- **Galería:** estática (manifiesto tipado en `lib/content/landing.ts`), sin CMS. Usa fotos reales tomadas
  en el local (`public/images/perros/`) para el Hero y las 15 fichas paginadas de la galería (4 por
  página); agregar/reemplazar una foto es editar ese manifiesto y dejar el archivo en esa carpeta, no
  requiere build de otra herramienta. Los captions son descriptivos genéricos (tipo de corte/servicio) —
  quedan a confirmar por la dueña si quiere nombres de perros o textos más específicos por foto.
- **Feature flags:** `NEXT_PUBLIC_FEATURE_TURNSTILE` (captcha, off por defecto). La seña **ya no es un
  feature flag apagado** — es un requisito confirmado del MVP v2 (ver §6).
- **Recargo de tarjeta (v3):** ya no es un porcentaje único nullable — es
  `deposit.paymentOptions` en `lib/config/business.ts`, un array de opciones por cantidad de cuotas
  (`{installments, surchargePercent}[]`) con un flag `enabled` explícito, apagado por defecto. El espejo en
  base es `business_settings.card_surcharge_options jsonb` (reemplaza a `card_surcharge_percent`, que nunca
  llegó a leerse desde ningún RPC). Mientras `enabled` sea `false` la UI no muestra ningún porcentaje —
  dice que el recargo está en revisión —, y el build de producción **no** exige tener un recargo cargado
  (era un chequeo v2 que forzaba a inventar un número; en v3 "apagado a propósito" es un estado válido, no
  un pendiente sin completar). El paso de pago no calcula un total con tarjeta mientras siga apagado.
- **Plazo de pago de seña:** `business_settings.deposit_due_hours`, default documentado de 24 h (marcado
  como placeholder en `docs/assumptions.md` y en la propia UI del panel) hasta que la dueña confirme el
  valor real.
- **Expiración de señas vencidas:** patrón de "expiración perezosa" — cualquier lectura de disponibilidad
  (`public_availability`, `request_appointment`) trata una cita `awaiting_deposit` con `deposit_due_at`
  pasado como si ya estuviera libre, sin esperar un cron. Además, `expire_overdue_deposits()` es una RPC
  idempotente que el panel admin llama en cada carga de "Hoy"/"Solicitudes" para dejar el estado real
  (`expired`) escrito en la base y liberar el slot para el resto de las vistas (agenda, horarios). Se eligió
  este enfoque en vez de `pg_cron` para no depender de una extensión que requiere configuración adicional en
  Supabase Cloud; documentado como mejora futura si se prefiere un cron real.
- **Precio/disponibilidad/seña:** nunca confiados desde el cliente; toda regla se revalida en servidor/RPC.

## 4. Esquema de datos v2 (seña y estados)

`appointment_status`: `pending_review → awaiting_deposit → confirmed`, más
`reschedule_requested, cancelled_by_client, cancelled_by_business, deposit_forfeited, completed, no_show,
expired`. Estados que **ocupan** el slot (bloquean nueva reserva): `pending_review`, `awaiting_deposit`,
`confirmed`, `reschedule_requested`. El resto libera el slot.

`payments`: `appointment_id`, `type='deposit'`, `amount_ars`, `method` (`cash|bank_transfer|
mercadopago_link`), `status` (`pending|verified|reversed`), `external_reference`, `verified_by`,
`verified_at`. Toda alta/reversión pasa por RPC de admin y queda en `appointment_events`.

Interfaz `PaymentProvider` documentada (no implementada) para migrar a Mercado Pago Checkout Pro con
webhook firmado + idempotencia más adelante, sin cambiar el modelo de datos.

## 5. Verificación realizada

Tras la ronda v4 (2026-10-01), en este entorno: `pnpm typecheck`, `pnpm lint`, `pnpm format:check`,
`pnpm test` (68 tests), `pnpm build` (con las variables no reales del CI) y `pnpm test:e2e` (16 tests)
pasan. Se verificó explícitamente que el build de producción **falla** sin los datos obligatorios y que el
mensaje lista los seis problemas sin imprimir ningún valor (ver §8). En v3 se había verificado además que
las cabeceras de seguridad (CSP/HSTS/nosniff/Referrer-Policy/Permissions-Policy) aparecen en la respuesta de
un build de producción real (`pnpm start`).

`pnpm test:integration` (RLS/RPC/concurrencia/seña/agenda de sábado/validación de entrada) está escrito y
actualizado para v3, pero **no se ejecutó** ni acá (sin Docker) ni contra el proyecto Supabase remoto: los
tests crean usuarios admin, turnos y pagos sin limpiarlos, así que no deben apuntarse a una base real.
Queda pendiente para GitHub Actions (job `db-and-e2e`, Docker + `supabase start`) o una máquina local con
Docker Desktop. Hasta que corra en verde, las correcciones SQL de v3 están verificadas solo por inspección
de catálogo (funciones, trigger y constraints existen en el remoto) y por los advisors de Supabase.

## 6. Qué cambió de v1 a v2 y por qué

El cliente mandó un documento de producto más detallado que resuelve casi todos los "pendientes" de v1
(ciudad, WhatsApp, franja horaria, Instagram) pero también agrega un requisito de negocio nuevo que v1 no
tenía: **seña obligatoria con verificación manual**. Esto no es un capricho de implementación — cambia el
ciclo de vida de una cita (antes `pending → confirmed` directo; ahora pasa por `awaiting_deposit`) y agrega
una tabla y un flujo de auditoría de pagos completos. Se migró el schema, las RPC, el turnero y el panel
para reflejarlo, en vez de agregar la seña como una capa superficial sobre el modelo v1.

Se mantuvo sin cambios: el sistema de tokens visuales ya construido (con contraste verificado), la
arquitectura de rutas, RLS y el patrón de RPC `SECURITY DEFINER`, y la decisión de no usar la API paga de
WhatsApp. Los tonos semánticos "sugeridos" en el documento v2 (`#2F6B57`/`#8A5A12`/`#A43F52`) difieren
levemente de los ya implementados y auditados contra el diseño de alta fidelidad original — se conservaron
los valores auditados en vez de reemplazarlos por una sugerencia sin verificación de contraste explícita;
si la dueña prefiere los tonos del documento nuevo, es un cambio de una línea en `app/globals.css`.

## 7. Qué cambió en v3 (2026-09-29) y por qué

Dos documentos nuevos motivaron esta ronda: `docs/plan-web-good-boy.md` (confirma dominio, correo admin y
una **grilla de sábado separada** de la semanal) y
`docs/auditoria-seguridad-y-cumplimiento-good-boy.md` (auditoría legal/técnica que dice "no publicar
todavía" y lista bloqueos P0 concretos). Se resolvieron los bloqueos técnicos que no dependen de una
decisión legal/fiscal del negocio:

- **Bug de cancelación corregido:** `admin_cancel_appointment` marcaba la seña como perdida
  (`deposit_forfeited`) para **cualquier** cancelación de un turno confirmado dentro de las 48 h, sin mirar
  quién cancelaba. Ahora solo una cancelación **iniciada por el cliente** puede perder la seña; si cancela
  el negocio, el turno pasa a `cancelled_by_business` sin tocar el pago. Corregido tanto en la función SQL
  como en el texto/copy del panel (antes mostraba la misma advertencia de "seña perdida" para ambos
  botones).
- **Agenda de sábado real:** antes el sistema trataba todos los días (lunes a sábado) con la misma grilla
  09:00/11:30/13:30 y el mismo tope de 3. Ahora el sábado es una grilla propia (único horario 11:00, tope
  1. reforzada en tres capas: TypeScript (`lib/domain/schedule.ts`), el RPC (`is_allowed_slot_time`,
     `max_active_per_day_for`) y un trigger sobre `availability_slots` que bloquea incluso una escritura
     directa a la tabla (el admin tiene `all` por RLS, no solo acceso vía RPC).
- **Validación de entrada en el RPC público:** `request_appointment` no tenía límites de longitud ni
  formato en ningún campo de texto, y aceptaba `p_consents: []`. Ahora valida longitudes (nombre del perro/
  responsable ≤ 80, raza/barrio ≤ 100, dirección ≤ 200, notas ≤ 1000, email/teléfono con formato) y exige
  las 3 claves de consentimiento requeridas — espejado como `CHECK` constraints en la tabla para que la
  regla valga también ante una escritura directa del admin.
- **Código de seguimiento más robusto:** de 4 a 8 caracteres, y de `random()` (no criptográfico) a
  `gen_random_bytes()`. Decisión tomada con el usuario: mantener un código tipeable a mano en vez de saltar
  a 80–128 bits (que habría requerido un token separado del código mostrado al cliente).
- **Rate limiting sin IP cruda:** la clave de rate-limit (antes la IP tal cual) ahora se guarda con HMAC-
  SHA256 (`lib/security/rateLimitKey.ts`, secreto rotable en `RATE_LIMIT_HMAC_SECRET`). También se revocó
  `EXECUTE` de `PUBLIC` sobre `enforce_rate_limit` (quedó abierto por descuido en la migración pública
  original, a diferencia de las funciones admin que sí lo revocaban).
- **Login admin con allowlist previa:** antes cualquier correo podía disparar un magic link (Supabase recién
  lo rechazaba en el callback, después de crear el usuario de Auth). Ahora `app/admin/login/actions.ts`
  revisa la allowlist _antes_ de llamar a Supabase Auth, con una respuesta genérica idéntica se permita o no
  el correo (para no poder usarse para enumerar admins) y un throttle liviano vía `enforce_rate_limit`.
- **Cabeceras de seguridad:** CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy` y `Permissions-Policy`
  agregadas en `next.config.ts` (no había ninguna). La CSP es una base razonable con `'unsafe-inline'` en
  script/style — no una CSP estricta con nonces.
- **Modelo de recargo de tarjeta rehecho:** de un único `cardSurchargePercent` nullable a
  `deposit.paymentOptions` (array por cantidad de cuotas) con `enabled: false` explícito — ver §3 y §2. El
  build de producción ya no exige tener un recargo cargado (ese chequeo v2 obligaba a inventar un número).
- **Expiración perezosa reforzada:** `request_appointment` ahora corre el mismo barrido de
  `expire_overdue_deposits()` al principio de la transacción, así una fila `awaiting_deposit` vencida nunca
  puede chocar contra el índice único parcial y bloquear un slot que en los hechos ya está libre.
- **Reprogramación validada de verdad:** la rama de `reschedule_requested` en
  `admin_set_appointment_status` no validaba que el nuevo slot estuviera publicado, futuro, no bloqueado ni
  dentro de la grilla/tope — ahora repite las mismas validaciones que una reserva nueva.

Quedó explícitamente fuera de esta ronda (ver §2 y la auditoría para el detalle): los textos legales
definitivos, la identidad fiscal del responsable, la validación final del recargo, MFA para el login admin,
activar Turnstile, y la política/prueba de backups y restauración.

## 8. Qué cambió en v4 (2026-10-01) y por qué

Ronda de cierre técnico. **No se tocó ningún texto legal** (`/privacidad` y `/terminos-de-reserva` siguen
siendo placeholders `noindex`) y **no se habilitó ningún recargo** (`deposit.paymentOptions.enabled` sigue
en `false`).

- **Proyecto Supabase remoto existente.** Las 8 migraciones de `supabase/migrations/` están aplicadas en el
  proyecto remoto y registradas en su historial. Además de las de v3 se agregaron dos migraciones chicas,
  `20260101000007_fix_function_search_path.sql` y `20260101000008_fix_set_updated_at_search_path.sql`, que
  fijan `search_path = ''` en `is_allowed_slot_time`, `max_active_per_day_for` y `set_updated_at`; con eso el
  advisor de seguridad `function_search_path_mutable` quedó sin hallazgos. En `v3_hardening` se **conservó**
  `business_settings.card_surcharge_percent` (en v3 se la eliminaba): ahora se agrega
  `card_surcharge_options` en paralelo y la columna vieja se quitará en una migración futura, cuando se
  confirme que la app ya usa la nueva. Los hallazgos de advisors que quedan son intencionales: RPC
  `SECURITY DEFINER` expuestos a `anon`/`authenticated` (cada uno valida `is_admin()` o está acotado a lo
  público) y `request_throttle` con RLS sin políticas (solo la toca `enforce_rate_limit`).
- **Build gate de producción endurecido** (`lib/config/productionGate.ts`, llamado desde
  `next.config.ts`, con tests unitarios). En producción el build falla salvo que: `NEXT_PUBLIC_SITE_URL`
  sea `https://`; `NEXT_PUBLIC_SUPABASE_URL` sea `https://` y no apunte a un host local;
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` estén definidas y no sean los valores de
  desarrollo; `ADMIN_EMAIL_ALLOWLIST` tenga al menos un correo válido; y `RATE_LIMIT_HMAC_SECRET` no sea el
  valor de desarrollo y tenga 32 caracteres o más. Los mensajes nombran la variable, nunca su valor.
- **CI corregido** (`.github/workflows/ci.yml`): se eliminó `NEXT_PUBLIC_CARD_SURCHARGE_PERCENT` (variable
  obsoleta desde v3, nada la lee) y se agregaron valores **no reales** para `ADMIN_EMAIL_ALLOWLIST`,
  `RATE_LIMIT_HMAC_SECRET` y `SUPABASE_SERVICE_ROLE_KEY`. El job `quality` usa una URL Supabase `https://`
  falsa (el build nunca se conecta); el job `db-and-e2e` sigue apuntando al stack local de Docker.
- **Auditoría de secretos:** no hay archivos `.env*` (salvo `.env.example`, vacío de secretos) ni en el
  árbol ni en el historial de git. Lo único que parece una credencial son dos JWT en
  `supabase/tests/helpers.ts`: son las claves demo **públicas** de todo `supabase start` local
  (`iss: supabase-demo`), válidas solo contra una instancia local. `.mcp.json` contiene únicamente el
  identificador del proyecto Supabase (la autenticación del MCP es OAuth, no hay token). Se agregó
  `.claude/settings.local.json` y `.kilo/worktrees/` a `.gitignore` para que la configuración local de
  herramientas no se versione por accidente.
- **`pnpm test:integration` queda para GitHub Actions** (Docker + `supabase start`), nunca contra la base
  remota — ver §5.
- **Un solo `.mcp.json` reformateado** (solo salto de línea final) porque `pnpm format:check` lo marcaba y
  habría roto el job `quality` del CI.
