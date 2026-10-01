import type { Metadata } from "next";
import { StatusLookup } from "@/components/turnero/StatusLookup";

export const metadata: Metadata = {
  title: "Consultar estado",
  robots: { index: false, follow: false },
};

export default function EstadoPage() {
  return <StatusLookup />;
}
