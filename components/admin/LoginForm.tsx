"use client";

import { useState } from "react";
import Image from "next/image";
import { TextField } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { businessConfig } from "@/lib/config/business";
import { sendAdminLoginLink } from "@/app/admin/login/actions";

export function LoginForm({ notAllowed }: { notAllowed: boolean }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(
    notAllowed ? "Ese correo no tiene acceso al panel." : null,
  );

  async function sendLink() {
    setSending(true);
    setError(null);
    const result = await sendAdminLoginLink(email);
    setSending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSent(true);
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-8">
      <div className="flex w-full max-w-sm flex-col items-stretch gap-5">
        <Image
          src="/images/logo-good-boy.jpg"
          alt={businessConfig.name}
          width={120}
          height={120}
          className="mx-auto size-30"
        />

        {!sent ? (
          <>
            <h1 className="font-heading m-0 text-center text-2xl font-bold">
              Entrar al panel
            </h1>
            <p className="text-ink-soft m-0 text-center">
              Te mandamos un enlace a tu correo. No hace falta contraseña.
            </p>
            <TextField
              label="Correo"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={error ?? undefined}
            />
            <Button
              onClick={sendLink}
              loading={sending}
              loadingText="Enviando…"
              disabled={!email}
            >
              Enviarme el enlace
            </Button>
          </>
        ) : (
          <div
            role="status"
            className="border-charcoal flex flex-col items-center gap-2.5 rounded-xl border-[1.5px] bg-white p-6 text-center"
          >
            <h1 className="font-heading m-0 text-xl font-bold">
              Revisá tu correo
            </h1>
            <p className="text-ink-soft m-0">
              Mandamos un enlace a{" "}
              <strong className="text-charcoal">{email}</strong>. Abrilo desde
              este teléfono. Vence en 15 minutos.
            </p>
            <Button
              variant="secondary"
              onClick={() => setSent(false)}
              className="mt-1.5"
            >
              No me llegó, reenviar
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}
