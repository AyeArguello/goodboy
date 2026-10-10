"use client";

import { useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TextField } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { businessConfig } from "@/lib/config/business";
import { loginAdmin } from "@/app/admin/login/actions";

export function LoginForm({
  notAllowed,
  resetDone,
  recoveryProblem = null,
}: {
  notAllowed: boolean;
  resetDone: boolean;
  /** Why a recovery link did not work, when the visitor arrives from one. */
  recoveryProblem?: string | null;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(
    notAllowed ? "La sesión no es válida o no tiene acceso al panel." : null,
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await loginAdmin(email, password);
    setSubmitting(false);

    if (!result.ok) {
      setPassword("");
      setError(result.error);
      return;
    }

    router.replace("/admin/hoy");
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
          width={120}
          height={120}
          className="mx-auto size-30"
          priority
        />
        <h1 className="font-heading m-0 text-center text-2xl font-bold">
          Entrar al panel
        </h1>
        <p className="text-ink-soft m-0 text-center">
          Ingresá con el correo autorizado y tu contraseña.
        </p>
        {recoveryProblem ? (
          <div
            role="alert"
            className="bg-error-bg text-error m-0 flex flex-col items-center gap-1 rounded-lg px-3 py-2 text-center text-sm"
          >
            <p className="m-0">{recoveryProblem}</p>
            <Link
              href="/admin/recuperar"
              className="font-heading text-purple font-semibold underline"
            >
              Pedir un enlace nuevo
            </Link>
          </div>
        ) : null}
        {resetDone ? (
          <p
            role="status"
            className="border-success-line bg-success-bg m-0 rounded-lg border px-3 py-2 text-center text-sm"
          >
            Contraseña actualizada. Ya podés ingresar.
          </p>
        ) : null}
        <TextField
          label="Correo"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <TextField
          label="Contraseña"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={error ?? undefined}
          required
        />
        <Button
          type="submit"
          loading={submitting}
          loadingText="Ingresando…"
          disabled={!email || !password}
        >
          Ingresar
        </Button>
        <Link
          href="/admin/recuperar"
          className="font-heading text-purple min-h-11 self-center px-3 py-2.5 text-sm font-semibold underline"
        >
          Olvidé mi contraseña
        </Link>
      </form>
    </main>
  );
}
