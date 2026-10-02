"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { businessConfig } from "@/lib/config/business";

const TABS = [
  {
    href: "/admin/hoy",
    label: "Hoy",
    icon: "M12 3v2M12 19v2M5 12H3M21 12h-2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
  },
  {
    href: "/admin/agenda",
    label: "Agenda",
    icon: "M4 6.5h16v13H4zM4 10.5h16M8.5 4v4M15.5 4v4",
  },
  {
    href: "/admin/solicitudes",
    label: "Solicitudes",
    icon: "M5 4h14v16H5zM8.5 9h7M8.5 13h7M8.5 17h4",
  },
  { href: "/admin/horarios", label: "Horarios", icon: "M12 5v14M5 12h14" },
] as const;

export function AdminShell({
  pendingCount,
  pendingReceiptsCount,
  children,
}: {
  pendingCount: number;
  pendingReceiptsCount: number;
  children: ReactNode;
}) {
  const toReview = pendingCount + pendingReceiptsCount;
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href ||
    (href === "/admin/solicitudes" &&
      pathname.startsWith("/admin/solicitudes"));

  return (
    <div className="flex min-h-screen">
      <nav
        aria-label="Panel"
        className="border-lavender-100 sticky top-0 hidden h-screen w-60 flex-col gap-1 border-r bg-white p-3.5 lg:flex"
      >
        <Image
          src="/images/logo-good-boy.jpg"
          alt={businessConfig.name}
          width={88}
          height={88}
          className="mb-4 ml-2 size-22"
        />
        {TABS.map((t) => {
          const active = isActive(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={`font-heading flex min-h-12 items-center gap-3 rounded-lg px-3.5 text-[15px] font-semibold no-underline ${active ? "bg-lavender-100" : ""} text-charcoal`}
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#25282C"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d={t.icon} />
              </svg>
              <span className="flex-1">{t.label}</span>
              {t.href === "/admin/solicitudes" ? (
                <>
                  <Badge count={toReview} />
                  <span className="sr-only">
                    {pendingCount} solicitudes por revisar y{" "}
                    {pendingReceiptsCount} comprobantes por verificar
                  </span>
                </>
              ) : null}
            </Link>
          );
        })}
        <Link
          href="/admin/mantenimiento"
          aria-current={
            pathname === "/admin/mantenimiento" ? "page" : undefined
          }
          className="font-heading text-ink-soft mt-auto flex min-h-11 items-center rounded-lg px-3.5 text-sm font-semibold no-underline"
        >
          Mantenimiento
        </Link>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-5 pb-28 lg:pb-5">
          {children}
        </main>

        <nav
          aria-label="Panel"
          className="border-lavender-100 sticky bottom-0 grid grid-cols-4 border-t bg-white px-1 pt-1.5 pb-2.5 lg:hidden"
        >
          {TABS.map((t) => {
            const active = isActive(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`font-heading relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-semibold no-underline ${active ? "text-charcoal" : "text-ink-soft"}`}
              >
                <span
                  className={`flex h-7.5 w-14 items-center justify-center rounded-full ${active ? "bg-lavender" : ""}`}
                >
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#25282C"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d={t.icon} />
                  </svg>
                </span>
                {t.label}
                {t.href === "/admin/solicitudes" && toReview > 0 ? (
                  <span className="bg-purple absolute top-0.5 right-[calc(50%-30px)] flex min-w-5 items-center justify-center rounded-full px-1 text-[11px] text-white">
                    <span aria-hidden="true">{toReview}</span>
                    <span className="sr-only">
                      {pendingCount} solicitudes por revisar y{" "}
                      {pendingReceiptsCount} comprobantes por verificar
                    </span>
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
