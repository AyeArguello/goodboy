import type { Metadata } from "next";
import { LoginForm } from "@/components/admin/LoginForm";
import {
  parseRecoveryErrorParam,
  recoveryProblemMessage,
} from "@/lib/auth/recovery";

export const metadata: Metadata = {
  title: "Ingresar",
  robots: { index: false, follow: false },
};

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; reset?: string }>;
}) {
  const { error, reset } = await searchParams;
  const recoveryProblem = parseRecoveryErrorParam(error);
  return (
    <LoginForm
      notAllowed={error === "not_allowed"}
      recoveryProblem={
        recoveryProblem ? recoveryProblemMessage(recoveryProblem) : null
      }
      resetDone={reset === "done"}
    />
  );
}
