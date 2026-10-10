"use client";

import { useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { requestAdminPasswordRecovery } from "@/app/admin/recuperar/actions";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { businessConfig } from "@/lib/config/business";

export function RecoveryForm() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await requestAdminPasswordRecovery(email);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSent(true);
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-8">
      <form
        onSubmit={submit}
        className="flex w-full max-w-sm flex-col items-stretch gap-5"
      >
        <Image
          src="/images/logo-good-boy.jpg"
          alt={businessConfig.name}
          width={112}
          height={112}
          className="mx-auto size-28"
          priority
        />
        <h1 className="font-heading m-0 text-center text-2xl font-bold">
          Recuperar contraseña
        </h1>
        {sent ? (
          <div
            role="status"
            className="border-charcoal rounded-xl border-[1.5px] bg-white p-5 text-center"
          >
            Si el correo está autorizado, vas a recibir un enlace para crear una
            contraseña nueva. Revisá también spam.
          </div>
        ) : (
          <>
            <p className="text-ink-soft m-0 text-center">
              Te enviaremos un enlace de recuperación al correo autorizado.
            </p>
            <TextField
              label="Correo"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              error={error ?? undefined}
              required
            />
            <Button
              type="submit"
              loading={submitting}
              loadingText="Enviando…"
              disabled={!email}
            >
              Enviar enlace de recuperación
            </Button>
          </>
        )}
        <Link
          href="/admin/login"
          className="font-heading text-purple min-h-11 self-center px-3 py-2.5 text-sm font-semibold underline"
        >
          Volver al ingreso
        </Link>
      </form>
    </main>
  );
}
