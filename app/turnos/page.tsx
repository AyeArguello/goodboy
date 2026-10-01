import type { Metadata } from "next";
import { TurneroWizard } from "@/components/turnero/TurneroWizard";
import { getBookableSlots } from "@/lib/data/availability";

export const metadata: Metadata = {
  title: "Solicitar turno",
};

// Availability changes whenever the owner publishes/hides a slot or someone
// books one — this must never be a build-time snapshot served to everyone
// until the next deploy.
export const dynamic = "force-dynamic";

export default async function TurnosPage() {
  const slots = await getBookableSlots();
  return <TurneroWizard slots={slots} />;
}
