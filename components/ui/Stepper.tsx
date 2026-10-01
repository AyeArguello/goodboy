export interface StepperProps {
  step: number;
  totalSteps: number;
  stepName: string;
}

/** Segmented progress bar + "Paso X de N" label used at the top of the turnero. */
export function Stepper({ step, totalSteps, stepName }: StepperProps) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-ink-soft text-sm">
        <strong className="font-heading text-purple">
          Paso {step} de {totalSteps}
        </strong>{" "}
        · {stepName}
      </p>
      <div
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={totalSteps}
        aria-valuenow={step}
        aria-label="Progreso de la solicitud"
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${totalSteps}, 1fr)` }}
      >
        {Array.from({ length: totalSteps }, (_, i) => (
          <span
            key={i}
            className={`h-1 rounded-full ${i < step ? "bg-purple" : "bg-lavender-100"}`}
          />
        ))}
      </div>
    </div>
  );
}
