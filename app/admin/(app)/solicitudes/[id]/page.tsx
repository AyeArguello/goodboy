import { notFound } from "next/navigation";
import { AppointmentDetail } from "@/components/admin/AppointmentDetail";
import { getAppointmentById } from "@/lib/data/admin";

export default async function AppointmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const appointment = await getAppointmentById(id);
  if (!appointment) notFound();

  return <AppointmentDetail appointment={appointment} />;
}
