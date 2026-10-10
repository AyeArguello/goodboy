# Good Boy — auditoría de seguridad, privacidad y cumplimiento

Fecha: 29 de septiembre de 2026  
Proyecto revisado: `E:\Trabajo\Freelance\Good Boy\Page\good-boy`

> Esta revisión combina comprobación técnica del repositorio con normativa argentina vigente. No sustituye la revisión de un/a abogado/a ni de un/a contador/a, necesaria antes de cobrar señas y publicar condiciones comerciales.

## Veredicto

**No publicar todavía.** La arquitectura técnica tiene buenas defensas de base, pero existen bloqueos P0 legales y de seguridad:

1. `/privacidad` y `/terminos-de-reserva` siguen siendo placeholders.
2. “Good Boy” no alcanza como identificación legal del responsable/proveedor; falta nombre y apellido de la persona responsable y regularización fiscal.
3. El recargo informado de 7% en una cuota presenta un conflicto serio con el artículo 37(c) de la Ley 25.065. Debe suspenderse hasta revisión profesional.
4. La cancelación iniciada por Good Boy dentro de las 48 h actualmente marca la seña como perdida, igual que una cancelación del cliente: es un bug de negocio y riesgo de consumo.
5. Los RPC públicos aceptan texto/consentimientos sin límites ni validación suficiente en base de datos.
6. El código público de consulta tiene solo 4 caracteres y se genera con `random()` de PostgreSQL; debe reemplazarse por un token de mayor entropía.
7. Faltan cabeceras HTTP de seguridad, MFA administrativo, política de retención/borrado y prueba real de RLS/RPC/concurrencia.

## Estado de remediación (actualizado el 1 de octubre de 2026, ronda v4)

La lista de arriba es el hallazgo original del 29/09/2026 y se conserva tal cual. El veredicto **sigue siendo
"No publicar todavía"**, ahora solo por los puntos legales/fiscales y por la prueba de integración pendiente.
Los bloqueos técnicos que no dependían de una decisión legal están corregidos:

| #   | Hallazgo original                                 | Estado                                                                                                                                                                                                                                      |
| --- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Páginas legales placeholder                       | **Abierto** (legal). No se tocaron en v4.                                                                                                                                                                                                   |
| 2   | Identificación legal/fiscal del responsable       | **Abierto** (legal/contable).                                                                                                                                                                                                               |
| 3   | Recargo 7% en una cuota (art. 37(c) Ley 25.065)   | **Suspendido, no resuelto.** `deposit.paymentOptions.enabled` es `false`: ninguna pantalla muestra ni cobra un recargo. Falta la revisión profesional para habilitarlo.                                                                     |
| 4   | Cancelación del negocio marcaba la seña perdida   | **Corregido en v3** (`admin_cancel_appointment`; solo una cancelación iniciada por el cliente puede perder la seña) y aplicado al proyecto Supabase remoto. Falta la prueba de integración.                                                 |
| 5   | RPC público sin validación                        | **Corregido en v3**: validación en `request_appointment` más `CHECK` constraints en `appointments` y `payments`, aplicados al remoto. Falta la prueba de integración.                                                                       |
| 6   | Código de consulta de 4 caracteres con `random()` | **Mitigado, no equivale a lo pedido.** Ahora son 8 caracteres con `gen_random_bytes()` y rate limit por HMAC; se decidió mantener un código tipeable a mano en vez de 80–128 bits. Sigue siendo una decisión a revisar si se detecta abuso. |
| 7   | Cabeceras, MFA, retención, prueba de RLS/RPC      | Cabeceras **corregidas en v3**. MFA, retención/DSAR y backups **abiertos**. Prueba de integración **pendiente** (ver abajo).                                                                                                                |

Hallazgos técnicos P0/P1 de la sección "Hallazgos técnicos priorizados":

- **P0.2 / P0.3 / P0.4:** ver filas 4, 5 y 6 de la tabla.
- **P0.5 Build gate de secretos/configuración: corregido en v4.** En producción el build exige URL Supabase
  `https://` no local, anon key, service role, dominio `https://`, allowlist con correos válidos y secreto
  HMAC de 32+ caracteres; rechaza los valores `local-dev-*`. Ver `lib/config/productionGate.ts` y su test.
  "Políticas aprobadas" sigue pendiente porque depende de los textos legales.
- **P0.7 Integración Supabase real: pendiente.** `pnpm test:integration` no se ejecutó. No debe correr contra
  el proyecto remoto (los tests crean datos y borran tablas enteras antes de cada test; el helper solo
  acepta `127.0.0.1`/`localhost`); corresponde al job
  `db-and-e2e` de GitHub Actions (Docker + `supabase start`) o a una máquina local con Docker.
- **P1.1 Cabeceras HTTP: corregido en v3** (`next.config.ts`). CSP con `'unsafe-inline'`, no estricta.
- **P1.3 Login admin server-side: corregido** (correo + contraseña, allowlist previa, respuesta uniforme,
  throttle por IP anonimizada que falla cerrado, alta pública desactivada, recuperación acotada y cierre de sesión).
- **P1.4 Rate limiter privado: parcial.** La clave usa HMAC y se revocó `EXECUTE` de `PUBLIC` sobre
  `enforce_rate_limit`. Sigue sin existir una limpieza de claves expiradas en `request_throttle`.
- **P1.7 Hardening PostgreSQL: parcial.** v4 fijó `search_path = ''` en las tres funciones que no son
  `SECURITY DEFINER` y el advisor `function_search_path_mutable` quedó sin hallazgos. Las funciones
  `SECURITY DEFINER` mantienen `set search_path = public`; falta evaluar `search_path = ''` con nombres
  calificados y revocar `CREATE` en `public`.
- **Abiertos sin cambios:** P1.2 (MFA), P1.5 (retención y DSAR), P1.6 (backups), todo P2.

El proyecto Supabase remoto **existe** y tiene aplicadas las 8 migraciones de `supabase/migrations/`.

## Controles ya correctos

- RLS está activado en las ocho tablas y funciona deny-by-default.
- Las operaciones públicas pasan por RPCs estrechas `SECURITY DEFINER`.
- La reserva bloquea el slot con `FOR UPDATE` y existe índice único parcial contra doble reserva.
- Las 11 funciones administrativas verifican `is_admin()` y revocan `EXECUTE` a `PUBLIC`.
- La service role solo se importa en código de servidor.
- El correo es opcional; la dirección solo se pide cuando hay traslado.
- No se detectaron analytics, píxeles publicitarios, Hotjar, Google Analytics ni almacenamiento público propio.
- La web pública usa un cliente Supabase sin sesión persistente. Las cookies observadas son las necesarias para el login administrativo.
- `pnpm audit --prod`: **sin vulnerabilidades conocidas** al 29/09/2026.
- Hay 16 fotos WebP reales. No contienen GPS/EXIF identificable; no aparecen personas reconocibles, aunque `perrito1.webp` muestra parcialmente una mano.

## Matriz de páginas, avisos y consentimientos

| Elemento                                | ¿Necesario ahora?                      | Formato recomendado                                                                        | Estado actual                                       |
| --------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| Política de privacidad                  | Sí, P0                                 | Página `/privacidad`, enlazada en footer y justo antes del envío                           | Placeholder, noindex                                |
| Términos de reserva/servicio            | Sí, P0                                 | Página `/terminos-de-reserva` + aceptación expresa no premarcada                           | Resumen incompleto, placeholder                     |
| Política de cancelación y reembolso     | Sí, P0                                 | Sección destacada dentro de términos y, por claridad, página `/reembolsos-y-cancelaciones` | Falta política cuando cancela Good Boy/fuerza mayor |
| Derecho de revocación / arrepentimiento | Revisar como P0                        | Enlace/botón visible y canal electrónico simple; no esconderlo en términos                 | No implementado                                     |
| Política de cookies                     | No como página separada por ahora      | Sección breve dentro de privacidad                                                         | No hay tracking opcional detectado                  |
| Banner/modal de cookies                 | No por ahora                           | No mostrar un banner inútil si solo hay cookies técnicas de admin                          | No implementado, correctamente                      |
| Consentimiento de cookies               | Solo si se agregan analytics/marketing | CMP que bloquee scripts hasta consentimiento                                               | Revaluar si se integra GA/Meta/Hotjar               |
| Aviso de Turnstile                      | Si se activa                           | Declararlo como proveedor de seguridad y enlazar privacidad de Cloudflare                  | Feature flag apagada                                |
| Aviso de fotos                          | Sí, interno                            | Autorización/documento de permiso por cada foto o sesión                                   | Falta evidencia de permisos                         |

No hace falta duplicar “Términos y condiciones” y “Términos de reserva”: una página completa y coherente es mejor. Los textos completos deben abrirse como páginas; no conviene encerrarlos únicamente en modales difíciles de leer o enlazar.

### Cuándo sí haría falta banner de cookies

En el código actual no hay cookies publicitarias ni analíticas. Las cookies de Supabase se usan en `/admin` para una función estrictamente necesaria. Por ello, **no recomiendo un banner de consentimiento ahora**. Sí debe explicarse el uso de cookies técnicas en privacidad.

Reevaluar antes de habilitar:

- Google Analytics, Meta Pixel, Hotjar, Clarity o herramientas equivalentes.
- Mapas o videos de terceros que carguen automáticamente.
- Turnstile si crea identificadores/cookies o transmite datos a Cloudflare.
- Cualquier campaña de remarketing.

## Contenido mínimo de la política de privacidad

La Ley 25.326 exige datos adecuados/no excesivos, información clara al recolectar, seguridad, confidencialidad y mecanismos de acceso/rectificación/supresión. La política debe incluir:

1. Nombre y apellido completos de la persona responsable; “Good Boy” como nombre comercial.
2. Domicilio y medio específico para ejercer derechos de datos.
3. Datos recolectados: nombre, WhatsApp, correo opcional, datos del perro, turno y, solo con traslado, barrio/dirección.
4. Finalidades: gestionar solicitud, traslado, seña, comunicación y cumplimiento administrativo.
5. Qué campos son obligatorios/opcionales y consecuencias de no proporcionarlos.
6. Proveedores/destinatarios: Supabase, proveedor de hosting, Resend si se activa, Mercado Pago y Cloudflare si se activa Turnstile.
7. Posibles transferencias internacionales de datos de esos proveedores.
8. Plazos de conservación por categoría y criterio de eliminación/anonimización.
9. Derechos de acceso, actualización, rectificación y supresión y cómo acreditar identidad.
10. Medidas generales de seguridad, sin revelar detalles explotables.
11. Cookies/almacenamiento técnico realmente usado.
12. Canal de reclamo ante la Agencia de Acceso a la Información Pública.
13. Fecha/versión de la política y mecanismo de aviso ante cambios relevantes.

Fuente: [Ley 25.326 de Protección de Datos Personales](https://www.argentina.gob.ar/normativa/nacional/ley-25326-64790/texto) y [derechos explicados por la AAIP](https://www.argentina.gob.ar/aaip/datospersonales/derechos).

## Minimización de datos

### Lo que está bien

- No se pide DNI, CUIT, tarjeta ni datos bancarios.
- Correo, raza y estado del manto son opcionales.
- Dirección y barrio se eliminan del payload cuando el cliente lleva al perro.
- Estado público de la cita no devuelve nombre, teléfono ni dirección.

### Cambios necesarios

- Agregar límites en Zod **y también en PostgreSQL/RPC**, porque un atacante puede invocar Supabase sin pasar por Next.js. Sugerencia: nombres 80, raza/barrio 100, dirección 200, correo 254, notas 500–1.000 caracteres.
- Validar formato/longitud de teléfono y correo dentro de `request_appointment` o mediante constraints de tabla.
- Validar que `p_consents` contenga exactamente las claves/versiones requeridas; hoy acepta incluso `[]`.
- Generar `accepted_at` en servidor/base de datos, no confiar en la hora del navegador.
- En “Notas”, indicar “No incluyas datos personales o médicos tuyos”.
- Definir retención: solicitudes rechazadas/expiradas, turnos completados, direcciones, pagos y eventos no deberían conservarse indefinidamente.
- Implementar procedimiento de exportación/corrección/supresión. El historial contable que legalmente deba conservarse se separa y minimiza.

## Términos de reserva y reembolsos

Los términos deben explicar de forma cierta, clara y detallada el servicio, precio orientativo, adicionales, pago y cancelación. La Ley 24.240 también regula contratación a distancia y reconoce un derecho irrenunciable de revocación en sus supuestos.

Fuente: [Ley 24.240 de Defensa del Consumidor](https://www.argentina.gob.ar/normativa/nacional/ley-24240-638/actualizacion), especialmente artículos 4, 8 bis, 34 y 37.

### Decisiones que la dueña debe confirmar

- Plazo para pagar la seña después de la aprobación.
- Si al cancelar con 48 h o más la seña se devuelve o se transfiere a una reprogramación.
- Plazo y método del reembolso.
- Qué sucede por demora del cliente, inasistencia o información omitida sobre conducta/salud del perro.
- Qué sucede si Good Boy cancela: recomendación mínima, elección del cliente entre reprogramación o devolución total, sin recargo.
- Fuerza mayor: reprogramación; devolución total si no puede prestarse el servicio.
- Qué ocurre si, al evaluar al perro, no es seguro realizar un procedimiento.
- Canal para revocar/cancelar electrónicamente y comprobante de recepción.

No usar cláusulas generales que excluyan toda responsabilidad. Incluir: “sin perjuicio de los derechos irrenunciables reconocidos por la normativa de defensa del consumidor”.

### Bug crítico de cancelación

En `20260101000005_rpc_admin.sql`, líneas 182–189, todo turno confirmado cancelado dentro de 48 h pasa a `deposit_forfeited`, incluso cuando `p_initiated_by = 'business'`. Debe modificarse para que la pérdida de la seña solo pueda aplicarse a cancelación iniciada por el cliente. La cancelación de Good Boy debe registrar devolución o crédito según la política finalmente aprobada.

La disponibilidad también debe validarse en la base de datos y no solo en la interfaz: de lunes a viernes se permiten hasta tres turnos en 09:00, 11:30 y 13:30; los sábados se permite un único turno a las 11:00. Los RPC administrativos y públicos deben rechazar cualquier segundo turno sabatino o un horario de sábado diferente, incluso si se invocan directamente.

## Riesgo del recargo de tarjeta

La configuración actual admite un único porcentaje, pero el dato comercial recibido tiene dos opciones:

- 1 cuota: 7%.
- 3 cuotas: 10,5%.

Además del desajuste técnico, el artículo 37(c) de la Ley 25.065 establece que el proveedor no debe efectuar diferencias de precio entre contado y tarjeta. **No publicar ni cobrar el 7% en una cuota hasta recibir revisión legal/comercial.** La comisión que Mercado Pago cobre al negocio no necesariamente puede trasladarse al consumidor como recargo de una cuota.

Para cuotas financiadas, mostrar antes de aceptar: precio de contado, cantidad/monto de cuotas, precio total financiado y cualquier indicador financiero exigible. El modelo debe ser `payment_options[]`, no `card_surcharge_percent`.

Fuente: [Ley 25.065 de Tarjetas de Crédito, artículo 37](https://www.argentina.gob.ar/normativa/nacional/ley-25065-55556/actualizacion).

## Identidad legal, CUIT y facturación

“Good Boy” es un nombre comercial, no una persona jurídica. La política y los términos deben identificar a la persona física responsable con nombre completo y domicilio/canal de contacto. La ausencia de CUIT no debe resolverse ocultando la identidad: es un bloqueo que requiere contador/a y, si corresponde, habilitación municipal.

Antes de cobrar online:

- confirmar inscripción fiscal adecuada y capacidad de emitir comprobantes;
- verificar titularidad de la cuenta de Mercado Pago;
- definir nombre que aparecerá en comprobantes y resúmenes;
- revisar habilitación local para peluquería y traslado de animales.

Referencia oficial: [inscripción como monotributista](https://www.argentina.gob.ar/servicio/inscribirme-como-monotributista).

## Hallazgos técnicos priorizados

### P0 — antes de cualquier producción

1. **Reemplazar páginas legales placeholder.** Actualmente están marcadas `[PENDIENTE]` y `noindex`.
2. **Corregir cancelación del negocio.** Nunca forfeit automático cuando cancela Good Boy.
3. **Validar RPC público en DB.** Longitudes, formatos, coherencia pickup, consentimiento y versión.
4. **Endurecer consulta de estado.** Sustituir `GB-` + 4 caracteres generado con `random()` por token criptográfico de al menos 80–128 bits, o exigir código + segundo factor parcial. Mantener respuesta uniforme para códigos inexistentes.
5. **Completar build gate de secretos/configuración.** En producción deben ser obligatorios: URL/anon key Supabase, service role, allowlist admin, dominio HTTPS y políticas aprobadas. No permitir el default `local-dev-service-role-key`.
6. **Resolver recargos e identidad fiscal/legal.** Sin esto no habilitar pago/seña.
7. **Ejecutar integración Supabase real.** RLS, RPCs y concurrencia no están verificadas en este entorno.

### P1 — seguridad alta

1. **Cabeceras HTTP:** CSP con `frame-ancestors 'none'`, HSTS en producción, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`; ajustar CSP para Supabase/Resend/Turnstile solo si se usan.
2. **MFA para admin:** requerir TOTP/AAL2 para datos de clientes y pagos.
3. **Login admin server-side:** resuelto con correo + contraseña, allowlist previa, throttle por IP anonimizada, mensaje uniforme y alta pública desactivada. La recuperación por email está limitada al correo autorizado.
4. **Rate limiter privado:** no guardar IP cruda indefinidamente. HMAC con secreto rotatable, confiar solo en cabecera del proveedor de hosting y eliminar claves expiradas.
5. **Retención y DSAR:** job de borrado/anonimización, proceso para acceso/corrección/supresión y registro de ejecución.
6. **Backups/restore:** backups cifrados, prueba de restauración, responsables e incidente.
7. **Hardening PostgreSQL:** considerar `search_path = ''` con nombres schema-qualified y revocar `CREATE` en `public` a roles no administradores.

### P2 — recomendado

- Activar Turnstile solo si hay abuso, con disclosure y validación server-side; no como sustituto del rate limiting.
- Confirmar permisos de las 16 fotos y conservar evidencia. Validar captions: algunas descripciones afirman tratamientos que no se deducen de la imagen.
- Política de incidentes: pérdida de teléfono/correo admin, revocación de sesiones, rotación de claves y comunicación a afectados/autoridad según corresponda.
- Revisar el alcance y consentimiento de procedimientos como vaciado de glándulas perianales o depilado de oídos; documentar contraindicaciones y protocolo ante lesión/emergencia veterinaria.
- Registrar `goodboy.com.ar` cuanto antes y activar renovación automática, DNSSEC si el registrador lo permite y protección de cuenta con MFA.

## Cambios de configuración confirmados

- `ADMIN_EMAIL_ALLOWLIST=<correo-de-la-dueña>`
- Dominio objetivo: `https://goodboy.com.ar`
- Seña: transferencia **y** link de Mercado Pago.
- Galería: 16 imágenes reales en `public/images/perros`.
- Responsable comercial declarado: “Good Boy”, sin CUIT. Esto sigue bloqueado hasta identificar a la persona física y revisar situación fiscal.
- Proyecto Supabase remoto: creado, con las 8 migraciones aplicadas (v4). Las claves todavía deben cargarse
  como variables de entorno del hosting.
- `NEXT_PUBLIC_DEPOSIT_DUE_HOURS`: pendiente.
- Política de cancelación del negocio/fuerza mayor: pendiente.

## Checklist de salida

- [ ] Nombre completo del responsable y situación fiscal/municipal revisada.
- [ ] Política de privacidad definitiva y versionada.
- [ ] Términos de reserva definitivos y versionados.
- [ ] Política de reembolso/cancelación/fuerza mayor aprobada.
- [ ] Derecho de revocación/“botón de arrepentimiento” revisado legalmente e implementado si corresponde.
- [x] 7% en una cuota eliminado o validado por profesional. _(Apagado: `enabled: false`, nada lo muestra ni
      lo cobra. Sigue sin validación profesional; habilitarlo requiere esa revisión.)_
- [ ] Bug de cancelación del negocio corregido y probado. _(Corregido en v3 y aplicado al remoto; falta la
      prueba de integración.)_
- [ ] Límites/constraints y consentimiento validados dentro de PostgreSQL. _(Implementados en v3 y aplicados
      al remoto; falta la prueba de integración.)_
- [ ] Token de consulta de estado endurecido. _(Mitigado a 8 caracteres criptográficos + rate limit por
      HMAC; no alcanza los 80–128 bits recomendados — decisión a confirmar.)_
- [x] Cabeceras CSP/HSTS y producción HTTPS. _(Cabeceras en `next.config.ts`; el build de producción exige
      `NEXT_PUBLIC_SITE_URL` `https://`. Falta registrar el dominio real.)_
- [ ] MFA y protección anti-spam del login. _(Anti-spam hecho en v3; MFA pendiente.)_
- [ ] Retención, borrado, backups y respuesta a incidentes documentados.
- [ ] Permisos de fotografías archivados.
- [ ] `pnpm test:integration` aprobado contra Supabase real. _(Pendiente: correr en GitHub Actions con
      Docker o en local con Docker; nunca contra el proyecto remoto, porque los tests borran tablas.)_
- [ ] Revisión final de abogado/a y contador/a.
