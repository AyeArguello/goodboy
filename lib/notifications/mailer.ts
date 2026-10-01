import "server-only";
import { Resend } from "resend";
import { getServerEnv } from "@/lib/env/server";

export interface NewRequestEmailInput {
  code: string;
  dogName: string;
  ownerName: string;
  slotLabel: string;
}

export interface Mailer {
  sendNewRequestEmail(input: NewRequestEmailInput): Promise<void>;
}

class ResendMailer implements Mailer {
  constructor(
    private apiKey: string,
    private from: string,
    private to: string,
  ) {}

  async sendNewRequestEmail(input: NewRequestEmailInput): Promise<void> {
    const resend = new Resend(this.apiKey);
    const { error } = await resend.emails.send({
      from: this.from,
      to: this.to,
      subject: `Nueva solicitud · ${input.dogName} (${input.code})`,
      text: [
        `${input.ownerName} pidió un turno para ${input.dogName}.`,
        `Turno: ${input.slotLabel}`,
        `Código: ${input.code}`,
        "",
        "Revisala en el panel de administración, en Solicitudes.",
      ].join("\n"),
    });
    if (error) console.error("Resend send failed:", error.message);
  }
}

/** Used whenever Resend isn't configured (local dev, or until the owner wants email set up). */
class NoopMailer implements Mailer {
  async sendNewRequestEmail(input: NewRequestEmailInput): Promise<void> {
    console.log(
      "[mailer:noop] nueva solicitud (no se envió email real):",
      input,
    );
  }
}

export function getMailer(): Mailer {
  const env = getServerEnv();
  if (
    env.RESEND_API_KEY &&
    env.RESEND_FROM_EMAIL &&
    env.OWNER_NOTIFICATION_EMAIL
  ) {
    return new ResendMailer(
      env.RESEND_API_KEY,
      env.RESEND_FROM_EMAIL,
      env.OWNER_NOTIFICATION_EMAIL,
    );
  }
  return new NoopMailer();
}
