import Link from "next/link";
import { signOutAdmin } from "@/app/admin/logout/actions";

const LINKS = [
  {
    href: "/admin/historial",
    label: "Historial",
    hint: "Solicitudes canceladas, vencidas o ya atendidas",
  },
  {
    href: "/admin/galeria",
    label: "Galería",
    hint: "Agregar o quitar las fotos de la web",
  },
  {
    href: "/admin/mantenimiento",
    label: "Mantenimiento",
    hint: "Correos pendientes y limpieza de comprobantes",
  },
] as const;

export default function MasPage() {
  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-heading m-0 text-xl font-bold">Más</h1>
      <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
        {LINKS.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="border-lavender-100 text-charcoal flex min-h-16 flex-col justify-center gap-0.5 rounded-lg border-[1.5px] bg-white px-4 py-3 no-underline"
            >
              <span className="font-heading text-base font-bold">
                {link.label}
              </span>
              <span className="text-ink-soft text-sm">{link.hint}</span>
            </Link>
          </li>
        ))}
      </ul>
      <form action={signOutAdmin}>
        <button
          type="submit"
          className="border-charcoal font-heading text-charcoal min-h-12 w-full cursor-pointer rounded-full border-[1.5px] bg-white text-base font-semibold"
        >
          Cerrar sesión
        </button>
      </form>
    </div>
  );
}
