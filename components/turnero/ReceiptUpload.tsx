"use client";

import { useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { CtaLink } from "@/components/ui/Link";
import { businessWhatsAppLink } from "@/lib/domain/whatsapp";
import { businessConfig } from "@/lib/config/business";
import {
  MAX_RECEIPT_FILES,
  RECEIPT_REFERENCE_MAX_LENGTH,
} from "@/lib/receipts/constants";
import { checkDeclaredFile } from "@/lib/receipts/fileValidation";
import {
  finalizeReceiptUploadAction,
  getUploadContextAction,
  prepareReceiptUploadAction,
  type ContextActionResult,
} from "@/app/turnos/comprobante/actions";

type Context = Extract<ContextActionResult, { ok: true }>;

const ERROR_COPY: Record<string, string> = {
  INVALID_LINK:
    "Este enlace no es válido o está incompleto. Abrilo de nuevo desde el email que te mandamos.",
  TOKEN_USED:
    "Ya subiste un comprobante con este enlace. Si hace falta uno nuevo, te mandamos otro enlace por email.",
  TOKEN_EXPIRED:
    "El plazo para pagar la seña venció. Escribinos y vemos cómo seguir.",
  NOT_AWAITING_DEPOSIT:
    "Este turno ya no admite comprobantes (puede que ya esté confirmado o que haya vencido).",
  TOO_MANY_RECEIPTS:
    "Ya hay dos comprobantes cargados para este turno. Esperá a que los verifiquemos.",
  RATE_LIMITED:
    "Hiciste muchos intentos seguidos. Esperá unos minutos y probá de nuevo.",
  INVALID_FILE:
    "Revisá los archivos: subí una o dos imágenes JPG, PNG o WebP de hasta 5 MB.",
  INVALID_CONTENT:
    "Alguno de los archivos no es una imagen válida. Subí una captura o foto en JPG, PNG o WebP.",
  STORAGE_ERROR: "No pudimos guardar la imagen. Probá de nuevo en un momento.",
  VALIDATION_ERROR: "Revisá los datos ingresados.",
  SERVER_ERROR: "Algo falló de nuestro lado. Probá de nuevo en un momento.",
};

function readToken(): string | null {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return params.get("t");
}

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** PUT to a Storage signed upload URL, reporting real byte progress. */
function putWithProgress(
  url: string,
  file: File,
  apikey: string,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("apikey", apikey);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`HTTP ${xhr.status}`));
    xhr.onerror = () => reject(new Error("network"));
    const body = new FormData();
    body.append("cacheControl", "3600");
    body.append("", file);
    xhr.send(body);
  });
}

interface Picked {
  file: File;
  error: string | null;
}

export function ReceiptUpload() {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [context, setContext] = useState<ContextActionResult | null>(null);
  const [picked, setPicked] = useState<Picked[]>([]);
  const [reference, setReference] = useState("");
  const [progress, setProgress] = useState<number[]>([]);
  const [uploading, setUploading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = readToken();
    // Reading the URL fragment is an external-system sync, only possible in the browser.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToken(t);
    if (!t) return;
    let cancelled = false;
    getUploadContextAction(t).then((result) => {
      if (!cancelled) setContext(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const ctx: Context | null = context?.ok ? context : null;
  const maxFiles = Math.min(
    MAX_RECEIPT_FILES,
    ctx?.remainingFiles ?? MAX_RECEIPT_FILES,
  );
  const validFiles = picked.filter((p) => !p.error).map((p) => p.file);
  const canSubmit =
    !uploading && validFiles.length > 0 && picked.every((p) => !p.error);

  function onPick(list: FileList | null) {
    if (!list) return;
    setFormError(null);
    const next = [...picked];
    for (const file of Array.from(list)) {
      if (next.length >= maxFiles) {
        setFormError(
          `Podés subir hasta ${maxFiles} ${maxFiles === 1 ? "imagen" : "imágenes"}.`,
        );
        break;
      }
      const check = checkDeclaredFile(file);
      next.push({ file, error: check.ok ? null : check.message });
    }
    setPicked(next);
    if (inputRef.current) inputRef.current.value = "";
  }

  function removeAt(index: number) {
    setPicked((p) => p.filter((_, i) => i !== index));
    setFormError(null);
  }

  async function submit() {
    if (!token || !canSubmit) return;
    setUploading(true);
    setFormError(null);
    setProgress(validFiles.map(() => 0));

    try {
      const prepared = await prepareReceiptUploadAction({
        token,
        files: validFiles.map((f) => ({
          name: f.name,
          type: f.type,
          size: f.size,
        })),
      });
      if (!prepared.ok) {
        setFormError(
          prepared.message ??
            ERROR_COPY[prepared.code] ??
            ERROR_COPY.SERVER_ERROR!,
        );
        return;
      }

      for (let i = 0; i < validFiles.length; i++) {
        await putWithProgress(
          prepared.uploads[i]!.signedUrl,
          validFiles[i]!,
          prepared.apikey,
          (pct) => setProgress((p) => p.map((v, j) => (j === i ? pct : v))),
        );
        setProgress((p) => p.map((v, j) => (j === i ? 100 : v)));
      }

      const finalized = await finalizeReceiptUploadAction({
        token,
        uploads: prepared.uploads.map((u) => ({ path: u.path, mime: u.mime })),
        reference: reference.trim() || undefined,
      });
      if (!finalized.ok) {
        setFormError(
          finalized.message ??
            ERROR_COPY[finalized.code] ??
            ERROR_COPY.SERVER_ERROR!,
        );
        return;
      }
      setDone(true);
    } catch {
      setFormError(
        "Se cortó la subida. Revisá tu conexión y probá de nuevo: no hace falta volver a elegir las imágenes.",
      );
    } finally {
      setUploading(false);
    }
  }

  const alias = ctx?.transfer.alias ?? null;

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-5 px-4 py-8">
      <div className="flex flex-col gap-1.5">
        <span className="text-ink-soft text-sm">{businessConfig.name}</span>
        <h1 className="font-heading m-0 text-3xl font-bold">
          Comprobante de la seña
        </h1>
      </div>

      {token === undefined || (token && !context) ? (
        <p role="status" className="text-ink-soft m-0">
          Cargando tu turno…
        </p>
      ) : null}

      {token === null ? (
        <Alert variant="error" title="Falta el enlace">
          {ERROR_COPY.INVALID_LINK}
        </Alert>
      ) : null}

      {context && !context.ok ? (
        <Alert variant="error" title="No pudimos abrir este enlace">
          {ERROR_COPY[context.code] ?? ERROR_COPY.SERVER_ERROR}
        </Alert>
      ) : null}

      {ctx ? (
        <div className="border-charcoal flex flex-col gap-2 rounded-xl border-[1.5px] bg-white p-4.5">
          <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-base">
            <dt className="text-ink-soft">Perro</dt>
            <dd className="m-0 font-bold">{ctx.dogName}</dd>
            <dt className="text-ink-soft">Turno</dt>
            <dd className="m-0 font-bold">{ctx.whenLabel}</dd>
            <dt className="text-ink-soft">Seña</dt>
            <dd className="m-0 font-bold">
              ARS {ctx.amountArs.toLocaleString("es-AR")}
            </dd>
            {ctx.dueLabel && ctx.state === "valid" ? (
              <>
                <dt className="text-ink-soft">Plazo</dt>
                <dd className="m-0">hasta el {ctx.dueLabel}</dd>
              </>
            ) : null}
          </dl>
        </div>
      ) : null}

      {ctx &&
      (done || ctx.state === "used" || ctx.pendingReceipts > 0) &&
      ctx.state !== "closed" ? (
        <Alert
          variant="info"
          title="Comprobante recibido, pendiente de verificación"
        >
          Lo revisamos a mano y te avisamos por email cuando el turno quede
          confirmado. Hasta entonces, el turno todavía no está confirmado.
        </Alert>
      ) : null}

      {ctx &&
      ctx.state === "closed" &&
      ctx.appointmentStatus === "confirmed" ? (
        <Alert variant="info" title="Turno confirmado">
          Ya verificamos tu seña. No hace falta subir nada más.
        </Alert>
      ) : null}

      {ctx &&
      ctx.state === "closed" &&
      ctx.appointmentStatus !== "confirmed" ? (
        <Alert variant="warning" title="Este turno ya no admite comprobantes">
          {ERROR_COPY.NOT_AWAITING_DEPOSIT}
        </Alert>
      ) : null}

      {ctx && ctx.state === "expired" ? (
        <Alert variant="warning" title="El plazo venció">
          {ERROR_COPY.TOKEN_EXPIRED}
        </Alert>
      ) : null}

      {ctx && ctx.state === "revoked" ? (
        <Alert variant="warning" title="Este enlace ya no es válido">
          Usá el último email que te mandamos: tiene el enlace vigente.
        </Alert>
      ) : null}

      {ctx && ctx.state === "valid" && !done && ctx.pendingReceipts === 0 ? (
        <>
          <section
            aria-labelledby="transfer-title"
            className="bg-lavender-100 flex flex-col gap-2 rounded-lg p-4"
          >
            <h2
              id="transfer-title"
              className="font-heading m-0 text-base font-bold"
            >
              1. Transferí la seña
            </h2>
            {alias || ctx.transfer.cbu || ctx.transfer.holder ? (
              <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[15px]">
                {alias ? (
                  <li className="flex flex-wrap items-center gap-2">
                    <span>
                      Alias: <strong>{alias}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={async () => {
                        await navigator.clipboard?.writeText(alias);
                        setCopied(true);
                      }}
                      className="border-charcoal font-heading min-h-11 cursor-pointer rounded-full border-[1.5px] bg-white px-4 text-sm font-semibold"
                    >
                      {copied ? "Copiado ✓" : "Copiar alias"}
                    </button>
                  </li>
                ) : null}
                {ctx.transfer.holder ? (
                  <li>Titular: {ctx.transfer.holder}</li>
                ) : null}
                {ctx.transfer.cbu ? <li>CBU/CVU: {ctx.transfer.cbu}</li> : null}
              </ul>
            ) : (
              <p className="m-0 text-[15px]">
                Los datos para transferir están en el email que te mandamos.
              </p>
            )}
          </section>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
            className="flex flex-col gap-4"
            aria-describedby="upload-help"
          >
            <h2 className="font-heading m-0 text-base font-bold">
              2. Subí el comprobante
            </h2>
            <p id="upload-help" className="text-ink-soft m-0 text-sm">
              Una foto o captura en JPG, PNG o WebP, de hasta 5 MB.{" "}
              {maxFiles > 1 ? "Podés subir hasta 2 imágenes." : null}
            </p>

            <div className="flex flex-col gap-2">
              <label
                htmlFor="receipt-file"
                className="font-heading text-charcoal text-[15px] font-semibold"
              >
                Imagen del comprobante
              </label>
              <input
                ref={inputRef}
                id="receipt-file"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple={maxFiles > 1}
                disabled={uploading || picked.length >= maxFiles}
                onChange={(e) => onPick(e.target.files)}
                className="border-ink-soft file:bg-purple min-h-13 w-full rounded-md border-[1.5px] bg-white p-3 text-base file:mr-3 file:min-h-11 file:rounded-full file:border-0 file:px-4 file:font-semibold file:text-white"
              />
            </div>

            {picked.length > 0 ? (
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {picked.map((p, i) => (
                  <li
                    key={`${p.file.name}-${i}`}
                    className="border-lavender flex flex-col gap-1.5 rounded-lg border-[1.5px] bg-white p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="min-w-0 text-[15px] break-words">
                        {p.file.name}{" "}
                        <span className="text-ink-soft">
                          ({formatSize(p.file.size)})
                        </span>
                      </span>
                      {!uploading ? (
                        <button
                          type="button"
                          onClick={() => removeAt(i)}
                          aria-label={`Quitar ${p.file.name}`}
                          className="text-purple min-h-11 cursor-pointer rounded-full px-3 text-sm font-semibold underline"
                        >
                          Quitar
                        </button>
                      ) : null}
                    </div>
                    {p.error ? (
                      <span
                        role="alert"
                        className="text-error text-sm font-bold"
                      >
                        {p.error}
                      </span>
                    ) : null}
                    {uploading && !p.error ? (
                      <div className="flex items-center gap-2">
                        <div
                          role="progressbar"
                          aria-label={`Progreso de ${p.file.name}`}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={
                            progress[validFiles.indexOf(p.file)] ?? 0
                          }
                          className="bg-lavender-100 h-2.5 flex-1 overflow-hidden rounded-full"
                        >
                          <div
                            className="bg-purple h-full transition-[width]"
                            style={{
                              width: `${progress[validFiles.indexOf(p.file)] ?? 0}%`,
                            }}
                          />
                        </div>
                        <span className="text-sm tabular-nums">
                          {progress[validFiles.indexOf(p.file)] ?? 0}%
                        </span>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}

            <TextField
              label="Referencia de la operación"
              optional
              maxLength={RECEIPT_REFERENCE_MAX_LENGTH}
              hint="Por ejemplo, el número de operación que figura en el comprobante."
              value={reference}
              disabled={uploading}
              onChange={(e) => setReference(e.target.value)}
            />

            <div aria-live="polite" className="flex flex-col gap-2">
              {uploading ? (
                <p role="status" className="m-0 text-[15px]">
                  Subiendo… no cierres esta página.
                </p>
              ) : null}
              {formError ? (
                <Alert variant="error" title="No pudimos enviar el comprobante">
                  {formError}
                </Alert>
              ) : null}
            </div>

            <Button
              type="submit"
              disabled={!canSubmit}
              loading={uploading}
              loadingText="Subiendo…"
            >
              Enviar comprobante
            </Button>
          </form>
        </>
      ) : null}

      {ctx || (context && !context.ok) ? (
        <div className="flex flex-col gap-2.5">
          <CtaLink href="/turnos/estado">
            Consultar el estado de mi turno
          </CtaLink>
          <a
            href={businessWhatsAppLink()}
            target="_blank"
            rel="noopener noreferrer"
            className="text-purple flex min-h-11 items-center text-sm"
          >
            ¿Necesitás ayuda? Escribinos por WhatsApp
          </a>
        </div>
      ) : null}

      <p className="text-ink-soft m-0 text-sm">
        Este enlace es personal: no lo compartas. Guardamos el comprobante de
        forma privada, solo lo ve quien administra los turnos, y se elimina
        automáticamente después del cierre del turno.
      </p>
    </div>
  );
}
