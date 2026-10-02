import { TextField } from "@/components/ui/Field";
import type { StepFormProps } from "./Step2Dog";

export function Step4Owner({ form, errors, setField }: StepFormProps) {
  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <h1 className="font-heading text-charcoal m-0 text-[clamp(26px,4vw,34px)] leading-tight font-bold">
          ¿Cómo te contactamos?
        </h1>
        <p className="text-ink-soft m-0">
          Usamos tu correo para avisarte cada novedad de tu turno (aprobación,
          seña y confirmación) y tu WhatsApp solo si hace falta coordinar algo.
        </p>
      </div>

      <TextField
        label="Tu nombre"
        autoComplete="name"
        value={form.ownerName}
        onChange={(e) => setField("ownerName", e.target.value)}
        error={errors.ownerName}
      />

      <TextField
        label="WhatsApp"
        prefix="+54"
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        placeholder="Código de área y número"
        value={form.phone}
        onChange={(e) => setField("phone", e.target.value)}
        error={errors.phone}
      />

      <TextField
        label="Correo"
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder="nombre@ejemplo.com"
        hint="Ahí te mandamos los datos para pagar la seña y el enlace para subir el comprobante."
        value={form.email}
        onChange={(e) => setField("email", e.target.value)}
        error={errors.email}
      />
    </section>
  );
}
