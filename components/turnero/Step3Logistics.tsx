import { TextField } from "@/components/ui/Field";
import { SelectableCard } from "@/components/ui/SelectableCard";
import { businessConfig } from "@/lib/config/business";
import type { StepFormProps } from "./Step2Dog";

export function Step3Logistics({ form, errors, setField }: StepFormProps) {
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
              <span className="border-purple mt-0.5 flex size-6 items-center justify-center rounded-full border-2">
                <span
                  className={`size-3 rounded-full ${sel ? "bg-purple" : "bg-transparent"}`}
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
          <TextField
            label="Barrio"
            placeholder="Ej.: Las Palmas"
            value={form.neighborhood}
            onChange={(e) => setField("neighborhood", e.target.value)}
            error={errors.neighborhood}
          />
          <TextField
            label="Dirección de búsqueda"
            autoComplete="street-address"
            value={form.pickupAddress}
            onChange={(e) => setField("pickupAddress", e.target.value)}
            error={errors.pickupAddress}
          />
          <div
            role="note"
            className="bg-lavender-100 flex flex-col gap-1.5 rounded-lg p-4"
          >
            <strong className="font-heading text-base font-bold">
              Costo del traslado: se confirma según tu barrio
            </strong>
            <p className="m-0 text-[15px]">
              {businessConfig.transportPricing.freeLabel}:{" "}
              {businessConfig.transportPricing.freeText}.{" "}
              {businessConfig.transportPricing.nearbyLabel}:{" "}
              {businessConfig.transportPricing.nearbyRange}.{" "}
              {businessConfig.transportPricing.farLabel}:{" "}
              {businessConfig.transportPricing.farRange}. Un único cargo con ida
              y vuelta. {businessConfig.transportPricing.disclaimer}
            </p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
