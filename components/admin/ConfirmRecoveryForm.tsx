"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { businessConfig } from "@/lib/config/business";
import { confirmAdminRecovery } from "@/app/admin/auth/confirm/actions";

/**
 * The recovery email links here. The token is only spent when the owner
 * presses the button, so a mail scanner that merely opens the link cannot
 * invalidate it.
 */
export function ConfirmRecoveryForm({
  tokenHash,
  type,
}: {
  tokenHash: string;
  type: string;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const missingLink = tokenHash === "" || type !== "recovery";

  async function confirm() {
    setSubmitting(true);
    setError(null);
    const result = await confirmAdminRecovery(tokenHash, type);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.replace("/admin/restablecer");
    router.refresh();
  }

  const message = missingLink
    ? "El enlace de recuperación está incompleto. Pedí uno nuevo."
    : error;

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-8">
      <div className="flex w-full max-w-sm flex-col items-stretch gap-5">
        <Image
          src="/images/logo-good-boy.jpg"
          alt={businessConfig.name}
          width={112}
          height={112}
          className="mx-auto size-28"
          priority
        />
        <h1 className="font-heading m-0 text-center text-2xl font-bold">
          Crear contraseña nueva
        </h1>
        {!missingLink ? (
          <p className="text-ink-soft m-0 text-center">
            Tocá el botón para validar el enlace y elegir tu contraseña nueva.
          </p>
        ) : null}
        {message ? (
          <p
            role="alert"
            className="bg-error-bg text-error m-0 rounded-lg px-3 py-2 text-center text-sm"
          >
            {message}
          </p>
        ) : null}
        {!missingLink ? (
          <Button
            type="button"
            onClick={confirm}
            loading={submitting}
            loadingText="Validando…"
          >
            Continuar
          </Button>
        ) : null}
        <Link
          href="/admin/recuperar"
          className="font-heading text-purple min-h-11 self-center px-3 py-2.5 text-sm font-semibold underline"
        >
          Pedir un enlace nuevo
        </Link>
      </div>
    </main>
  );
}
