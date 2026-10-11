import { notFound } from "next/navigation";
import { getServerEnv } from "@/lib/env/server";
import { AppointmentDetail } from "@/components/admin/AppointmentDetail";
import {
  getAppointmentById,
  getAppointmentEmails,
  getAppointmentEvents,
} from "@/lib/data/admin";

export default async function AppointmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const appointment = await getAppointmentById(id);
  if (!appointment) notFound();

  const [events, emails] = await Promise.all([
    getAppointmentEvents(id),
    getAppointmentEmails(id),
  ]);

  // Only the signed-in admin reaches this page; the data goes into the WhatsApp
  // message that asks the customer for the deposit.
  const env = getServerEnv();

  return (
    <AppointmentDetail
      transfer={{
        alias: env.DEPOSIT_TRANSFER_ALIAS ?? null,
        holder: env.DEPOSIT_TRANSFER_HOLDER ?? null,
        cbu: env.DEPOSIT_TRANSFER_CBU ?? null,
      }}
      appointment={appointment}
      events={events}
      emails={emails}
    />
  );
}
