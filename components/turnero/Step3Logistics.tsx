import { useId, useState } from "react";
import { TextField } from "@/components/ui/Field";
import { SelectableCard } from "@/components/ui/SelectableCard";
import { businessConfig } from "@/lib/config/business";
import {
  findBarrio,
  quoteTransport,
  searchBarrios,
} from "@/lib/domain/transport";
import { businessWhatsAppLink } from "@/lib/domain/whatsapp";
import type { StepFormProps } from "./Step2Dog";

/** Type-ahead over the barrios of Córdoba capital; only a listed barrio is accepted. */
function BarrioCombobox({
  value,
  error,
  onChange,
}: {
  value: string;
  error?: string;
  onChange: (barrio: string) => void;
}) {
  const id = useId();
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const matches = searchBarrios(query);
  const showList = open && matches.length > 0 && findBarrio(query) !== query;
  const notFound = query.trim() !== "" && matches.length === 0;

  const choose = (barrio: string) => {
    setQuery(barrio);
    setOpen(false);
    onChange(barrio);
  };

  const onType = (text: string) => {
    setQuery(text);
    setOpen(true);
    setActive(0);
    onChange(findBarrio(text) ?? "");
  };

  return (
    <div className="relative flex flex-col gap-1.5">
      <TextField
        label="Barrio"
        placeholder="Escribí y elegí tu barrio"
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={showList ? `${id}-${active}` : undefined}
        value={query}
        onChange={(e) => onType(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && matches.length > 0) {
            e.preventDefault();
            setOpen(true);
            setActive((i) => (i + 1) % matches.length);
          } else if (e.key === "ArrowUp" && matches.length > 0) {
            e.preventDefault();
            setActive((i) => (i - 1 + matches.length) % matches.length);
          } else if (e.key === "Enter" && showList) {
            e.preventDefault();
            choose(matches[active]!);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        error={error}
      />
      {showList ? (
        <ul
          id={`${id}-list`}
          role="listbox"
          aria-label="Barrios"
          className="border-lavender absolute top-full right-0 left-0 z-10 m-0 mt-1 max-h-64 list-none overflow-auto rounded-md border-[1.5px] bg-white p-1 shadow-lg"
        >
          {matches.map((barrio, index) => (
            <li
              key={barrio}
              id={`${id}-${index}`}
              role="option"
              aria-selected={index === active}
              // mousedown keeps the input focused so blur does not close the list first
              onMouseDown={(e) => {
                e.preventDefault();
                choose(barrio);
              }}
              className={`cursor-pointer rounded-md px-3 py-2.5 text-base ${index === active ? "bg-lavender-100 font-semibold" : ""}`}
            >
              {barrio}
            </li>
          ))}
        </ul>
      ) : null}
      {notFound ? (
        <p role="status" className="text-ink-soft m-0 text-sm">
          No encontramos ese barrio en Córdoba capital. Si vivís en otra
          localidad,{" "}
          <a
            href={businessWhatsAppLink()}
            target="_blank"
            rel="noopener noreferrer"
            className="text-purple font-semibold underline"
          >
            escribinos por WhatsApp
          </a>
          .
        </p>
      ) : null}
    </div>
  );
}

export function Step3Logistics({ form, errors, setField }: StepFormProps) {
  const quote = quoteTransport(form.neighborhood);

  return (
    <section className="flex flex-col gap-5">
      <h1 className="font-heading text-charcoal m-0 text-[clamp(26px,4vw,34px)] leading-tight font-bold">
        ¿Cómo llega a {businessConfig.legalDisclaimerName}?
      </h1>

      <div
        role="radiogroup"
        aria-label="Logística"
        className="flex flex-col gap-2.5"
      >
        {(
          [
            [
              "self",
              "Lo llevo yo",
              `A ${businessConfig.address.street}, en el horario elegido.`,
            ],
            [
              "pickup",
              "Necesito traslado",
              "Lo buscamos y lo devolvemos. Costo según barrio.",
            ],
          ] as const
        ).map(([mode, label, sub]) => {
          const sel = form.logisticsMode === mode;
          return (
            <SelectableCard
              key={mode}
              role="radio"
              selected={sel}
              invalid={!!errors.logisticsMode}
              onClick={() => setField("logisticsMode", mode)}
              className="grid grid-cols-[auto_1fr] items-start gap-3.5 rounded-lg px-4.5 py-4"
            >
              <span
                className={`mt-0.5 flex size-6 items-center justify-center rounded-full border-2 ${sel ? "border-white" : "border-purple"}`}
              >
                <span
                  className={`size-3 rounded-full ${sel ? "bg-white" : "bg-transparent"}`}
                />
              </span>
              <span className="flex flex-col gap-0.5">
                <strong className="font-heading text-[17px] font-bold">
                  {label}
                </strong>
                <span className="text-ink-soft text-sm">{sub}</span>
              </span>
            </SelectableCard>
          );
        })}
      </div>
      {errors.logisticsMode ? (
        <span role="alert" className="text-error text-sm font-bold">
          ⚠ {errors.logisticsMode}
        </span>
      ) : null}

      {form.logisticsMode === "pickup" ? (
        <div className="flex flex-col gap-4 pl-1">
          <BarrioCombobox
            value={form.neighborhood}
            error={errors.neighborhood}
            onChange={(barrio) => setField("neighborhood", barrio)}
          />
          <TextField
            label="Dirección de búsqueda"
            autoComplete="street-address"
            value={form.pickupAddress}
            onChange={(e) => setField("pickupAddress", e.target.value)}
            error={errors.pickupAddress}
          />
          <div
            role="status"
            className="bg-lavender-100 flex flex-col gap-1.5 rounded-lg p-4"
          >
            {quote ? (
              <>
                <strong className="font-heading text-base font-bold">
                  Costo del traslado desde {form.neighborhood}: {quote.amount}
                </strong>
                <p className="m-0 text-[15px]">
                  Un único cargo con ida y vuelta.{" "}
                  {businessConfig.transportPricing.disclaimer}
                </p>
              </>
            ) : (
              <>
                <strong className="font-heading text-base font-bold">
                  Costo del traslado: elegí tu barrio y lo calculamos
                </strong>
                <p className="m-0 text-[15px]">
                  {businessConfig.transportPricing.freeLabel}:{" "}
                  {businessConfig.transportPricing.freeText.toLowerCase()}.{" "}
                  {businessConfig.transportPricing.nearbyLabel}:{" "}
                  {businessConfig.transportPricing.nearbyRange}. Un único cargo
                  con ida y vuelta.
                </p>
              </>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
