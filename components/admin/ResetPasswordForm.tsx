"use client";

import { useState, type FormEvent } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { updateAdminPassword } from "@/app/admin/restablecer/actions";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { businessConfig } from "@/lib/config/business";

export function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await updateAdminPassword(password, confirmation);
    setSubmitting(false);
    if (!result.ok) {
      setPassword("");
      setConfirmation("");
      setError(result.error);
      return;
    }
    router.replace("/admin/login?reset=done");
    router.refresh();
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
          Crear contraseña nueva
        </h1>
        <p className="text-ink-soft m-0 text-center text-sm">
          Usá 14 caracteres o más, con mayúscula, minúscula, número y símbolo.
          No reutilices una contraseña de otro servicio.
        </p>
        <TextField
          label="Contraseña nueva"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          minLength={14}
          required
        />
        <TextField
          label="Repetir contraseña"
          type="password"
          autoComplete="new-password"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          error={error ?? undefined}
          minLength={14}
          required
        />
        <Button
          type="submit"
          loading={submitting}
          loadingText="Guardando…"
          disabled={!password || !confirmation}
        >
          Guardar contraseña
        </Button>
      </form>
    </main>
  );
}
