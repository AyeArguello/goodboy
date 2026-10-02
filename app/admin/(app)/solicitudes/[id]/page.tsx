import { notFound } from "next/navigation";
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

  return (
    <AppointmentDetail
      appointment={appointment}
      events={events}
      emails={emails}
    />
  );
}
