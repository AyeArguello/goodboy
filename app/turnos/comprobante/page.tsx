import type { Metadata } from "next";
import { ReceiptUpload } from "@/components/turnero/ReceiptUpload";

export const metadata: Metadata = {
  title: "Subir comprobante",
  // Personal link: never indexed, never followed.
  robots: { index: false, follow: false },
};

export default function ComprobantePage() {
  return <ReceiptUpload />;
}
