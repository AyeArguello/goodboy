/**
 * Future extension point for the official WhatsApp Business API. The MVP
 * never sends WhatsApp messages programmatically — see
 * lib/domain/whatsapp.ts for the wa.me deep-link approach that's actually
 * used today (owner/customer always reviews and taps send themselves).
 *
 * When/if official sending is added, implement this interface behind a
 * feature flag (mirroring NEXT_PUBLIC_FEATURE_DEPOSIT's pattern) and:
 *   - verify the provider's webhook signature on every inbound event
 *   - make `sendMessage` idempotent (dedupe by `idempotencyKey`) so retried
 *     webhook deliveries or provider retries can't double-send
 *   - never call this from a code path that isn't already rate-limited
 */
export interface OutgoingWhatsAppMessage {
  toE164: string;
  templateName: string;
  variables: Record<string, string>;
  /** Caller-supplied key so a retried call is a safe no-op, not a duplicate send. */
  idempotencyKey: string;
}

export interface WhatsAppAdapter {
  sendMessage(
    message: OutgoingWhatsAppMessage,
  ): Promise<{ providerMessageId: string }>;
}

export class NotImplementedWhatsAppAdapter implements WhatsAppAdapter {
  async sendMessage(): Promise<{ providerMessageId: string }> {
    throw new Error(
      "WhatsApp Business API sending is not implemented in the MVP — see lib/domain/whatsapp.ts for the wa.me deep-link flow that's used instead.",
    );
  }
}
