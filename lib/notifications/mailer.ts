import "server-only";
import { Resend } from "resend";
import { getServerEnv } from "@/lib/env/server";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export type SendResult =
  | { ok: true; provider: "resend" | "noop"; providerMessageId?: string }
  | { ok: false; error: string };

/**
 * Never throws: a failed send is a value the caller records in the outbox, so
 * an email outage can never roll back or block a state transition.
 */
export interface Mailer {
  send(message: EmailMessage): Promise<SendResult>;
}

class ResendMailer implements Mailer {
  constructor(
    private apiKey: string,
    private from: string,
  ) {}

  async send(message: EmailMessage): Promise<SendResult> {
    try {
      const resend = new Resend(this.apiKey);
      const { data, error } = await resend.emails.send({
        from: this.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
      });
      if (error) return { ok: false, error: error.message };
      return { ok: true, provider: "resend", providerMessageId: data?.id };
    } catch (err) {
      return {
        ok: false,
        error:
          err instanceof Error ? err.message : "error de envío desconocido",
      };
    }
  }
}

/** Used whenever Resend isn't configured (local dev; production refuses to build without it). */
class NoopMailer implements Mailer {
  async send(message: EmailMessage): Promise<SendResult> {
    console.log(
      `[mailer:noop] email no enviado (Resend sin configurar): "${message.subject}"`,
    );
    return { ok: true, provider: "noop" };
  }
}

export function getMailer(): Mailer {
  const env = getServerEnv();
  if (env.RESEND_API_KEY && env.RESEND_FROM_EMAIL) {
    return new ResendMailer(env.RESEND_API_KEY, env.RESEND_FROM_EMAIL);
  }
  return new NoopMailer();
}

/** The owner's address for operational alerts; null when not configured. */
export function getOwnerEmail(): string | null {
  return getServerEnv().OWNER_NOTIFICATION_EMAIL ?? null;
}
