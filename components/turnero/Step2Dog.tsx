import { TextField, TextAreaField } from "@/components/ui/Field";
import { SelectableCard } from "@/components/ui/SelectableCard";
import {
  COAT_LABELS,
  SERVICE_PACKAGE_INCLUDES,
  SERVICE_PACKAGE_LABELS,
  SIZE_LABELS,
  type CoatState,
  type ServicePackageKey,
  type SizeBucket,
} from "@/lib/domain/appointment";
import { businessConfig } from "@/lib/config/business";
import type { WizardFieldErrors, WizardForm } from "./types";

const SIZES: SizeBucket[] = ["pequeno", "mediano", "grande"];
const COATS: CoatState[] = ["corto", "largo", "con_nudos", "no_se"];
const SERVICE_PACKAGES: ServicePackageKey[] = [
  "corto_doble_capa",
  "crecimiento_continuo",
];

export interface StepFormProps {
  form: WizardForm;
  errors: WizardFieldErrors;
  setField: <K extends keyof WizardForm>(
    field: K,
    value: WizardForm[K],
  ) => void;
}

export function Step2Dog({ form, errors, setField }: StepFormProps) {
  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <h1 className="font-heading text-charcoal m-0 text-[clamp(26px,4vw,34px)] leading-tight font-bold">
          Contanos de tu perro
        </h1>
        <p className="text-ink-soft m-0">
          Con esto organizamos el tiempo del turno. El precio final se confirma
          al recibirlo.
        </p>
      </div>

      <TextField
        label="Nombre del perro"
        value={form.dogName}
        onChange={(e) => setField("dogName", e.target.value)}
        error={errors.dogName}
      />

      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="font-heading mb-1 text-[15px] font-semibold">
          Tamaño aproximado
        </legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {SIZES.map((size) => (
            <SelectableCard
              key={size}
              role="radio"
              selected={form.sizeBucket === size}
              invalid={!!errors.sizeBucket}
              onClick={() => setField("sizeBucket", size)}
              className="flex min-h-19 flex-col gap-0.5 rounded-lg px-3.5 py-3"
            >
              <span className="font-heading text-base font-bold">
                {SIZE_LABELS[size]}
              </span>
              <span className="text-ink-soft text-sm tabular-nums">
                ARS {businessConfig.prices[size].range} · orientativo
              </span>
            </SelectableCard>
          ))}
        </div>
        {errors.sizeBucket ? (
          <span className="text-error text-sm font-bold">
            {errors.sizeBucket}
          </span>
        ) : null}
      </fieldset>

      <TextField
        label="Raza o cruza"
        optional
        placeholder="Ej.: caniche, mestizo mediano"
        value={form.breed}
        onChange={(e) => setField("breed", e.target.value)}
      />

      <fieldset className="m-0 border-0 p-0">
        <legend className="font-heading mb-2 text-[15px] font-semibold">
          Estado del manto
        </legend>
        <div className="flex flex-wrap gap-2">
          {COATS.map((coat) => {
            const sel = form.coatState === coat;
            return (
              <button
                key={coat}
                type="button"
                role="radio"
                aria-checked={sel}
                onClick={() => setField("coatState", coat)}
                className={`font-heading min-h-11 cursor-pointer rounded-full border-[1.5px] px-4 text-sm font-semibold ${
                  sel
                    ? "border-purple bg-purple text-white"
                    : "border-lavender text-charcoal bg-white"
                }`}
              >
                {COAT_LABELS[coat]}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="font-heading mb-1 text-[15px] font-semibold">
          Servicio
        </legend>
        <div
          role="radiogroup"
          aria-label="Servicio"
          className="flex flex-col gap-2.5"
        >
          {SERVICE_PACKAGES.map((pkg) => {
            const sel = form.servicePackage === pkg;
            return (
              <SelectableCard
                key={pkg}
                role="radio"
                selected={sel}
                invalid={!!errors.servicePackage}
                onClick={() => setField("servicePackage", pkg)}
                className="flex flex-col gap-1.5 rounded-lg px-4 py-3.5"
              >
                <strong className="font-heading text-base font-bold">
                  {SERVICE_PACKAGE_LABELS[pkg]}
                </strong>
                <span className="text-ink-soft text-sm">
                  {SERVICE_PACKAGE_INCLUDES[pkg].join(" · ")}
                </span>
              </SelectableCard>
            );
          })}
        </div>
        {errors.servicePackage ? (
          <span role="alert" className="text-error text-sm font-bold">
            {errors.servicePackage}
          </span>
        ) : null}
      </fieldset>

      <TextAreaField
        label="Notas"
        optional
        placeholder="Temperamento, sensibilidad al secador, algo que debamos saber"
        value={form.notes}
        onChange={(e) => setField("notes", e.target.value)}
      />
    </section>
  );
}
