"use client";

import { useEffect, useMemo, useReducer, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Stepper } from "@/components/ui/Stepper";
import { Button } from "@/components/ui/Button";
import type { BookableSlot } from "@/lib/data/availability";
import {
  submitBookingAction,
  type BookingFormInput,
} from "@/app/turnos/actions";
import { businessConfig, depositAmountFor } from "@/lib/config/business";
import { customerSummaryMessage } from "@/lib/domain/whatsapp";
import {
  initialForm,
  STEP_NAMES,
  TOTAL_STEPS,
  type SubmitError,
  type TakenNotice,
  type WizardFieldErrors,
  type WizardForm,
} from "./types";
import { groupSlotsByDay } from "./grouping";
import { findBarrio } from "@/lib/domain/transport";
import { needsTransport } from "@/lib/domain/appointment";
import { Step1Slot } from "./Step1Slot";
import { Step2Dog } from "./Step2Dog";
import { Step3Logistics } from "./Step3Logistics";
import { Step4Owner } from "./Step4Owner";
import { Step5Consent } from "./Step5Consent";
import { Step6Review } from "./Step6Review";
import { SuccessScreen } from "./SuccessScreen";

interface State {
  step: number;
  selectedDateKey: string | null;
  selectedSlotId: string | null;
  form: WizardForm;
  errors: WizardFieldErrors;
  sending: boolean;
  /** Why the last submit failed, when it did not reach a booking. */
  submitError: SubmitError | null;
  /** Set when the server said somebody else got the chosen turn first. */
  taken: TakenNotice | null;
  successCode: string | null;
}

type Action =
  | { type: "SELECT_DATE"; dateKey: string }
  | { type: "SELECT_SLOT"; slotId: string }
  | {
      type: "SET_FIELD";
      field: keyof WizardForm;
      value: WizardForm[keyof WizardForm];
    }
  | { type: "GO_STEP"; step: number }
  | { type: "SET_ERRORS"; errors: WizardFieldErrors }
  | { type: "SUBMIT_START" }
  | { type: "SUBMIT_SUCCESS"; code: string }
  | {
      type: "SUBMIT_TAKEN";
      label: string;
      reason: TakenNotice["reason"];
    }
  | { type: "SUBMIT_ERROR"; error: SubmitError };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "SELECT_DATE":
      return {
        ...state,
        selectedDateKey: action.dateKey,
        selectedSlotId: null,
        errors: {},
      };
    case "SELECT_SLOT":
      return { ...state, selectedSlotId: action.slotId, errors: {} };
    case "SET_FIELD":
      return {
        ...state,
        form: { ...state.form, [action.field]: action.value },
        errors: { ...state.errors, [action.field]: undefined },
      };
    case "GO_STEP":
      return { ...state, step: action.step, errors: {}, taken: null };
    case "SET_ERRORS":
      return { ...state, errors: action.errors };
    case "SUBMIT_START":
      return { ...state, sending: true, submitError: null };
    case "SUBMIT_SUCCESS":
      return { ...state, sending: false, step: 7, successCode: action.code };
    case "SUBMIT_TAKEN":
      return {
        ...state,
        sending: false,
        step: 1,
        selectedSlotId: null,
        taken: { label: action.label, reason: action.reason },
      };
    case "SUBMIT_ERROR":
      return { ...state, sending: false, submitError: action.error };
    default:
      return state;
  }
}

/** The earliest step that owns one of the server-reported field errors. */
function stepForErrors(errors: WizardFieldErrors): number {
  if ((errors as Record<string, unknown>).slotId) return 1;
  const owners: [number, (keyof WizardFieldErrors)[]][] = [
    [1, ["slot"]],
    [
      2,
      [
        "dogName",
        "sizeBucket",
        "servicePackage",
        "breed",
        "coatState",
        "notes",
      ],
    ],
    [3, ["logisticsMode", "neighborhood", "pickupAddress"]],
    [4, ["ownerName", "phone"]],
    [5, ["consentPrice", "consentDeposit", "consentPrivacy", "consent"]],
  ];
  const found = owners.find(([, keys]) => keys.some((k) => errors[k]));
  return found ? found[0] : 2;
}

function validateStep(step: number, state: State): WizardFieldErrors {
  const { form, selectedSlotId } = state;
  const errors: WizardFieldErrors = {};
  if (step === 1 && !selectedSlotId)
    errors.slot = "Elegí un horario para continuar.";
  if (step === 2) {
    if (!form.dogName.trim()) errors.dogName = "Escribí el nombre de tu perro.";
    if (!form.sizeBucket) errors.sizeBucket = "Elegí un tamaño aproximado.";
    if (!form.servicePackage)
      errors.servicePackage = "Elegí el servicio según el pelo de tu perro.";
  }
  if (step === 3) {
    if (!form.logisticsMode) errors.logisticsMode = "Elegí una opción.";
    if (form.logisticsMode === "oneway")
      errors.logisticsMode = "Elegí si lo buscamos o si lo devolvemos.";
    if (needsTransport(form.logisticsMode)) {
      if (!findBarrio(form.neighborhood))
        errors.neighborhood = "Elegí tu barrio de la lista.";
      if (!form.pickupAddress.trim())
        errors.pickupAddress = "Escribí la dirección donde lo buscamos.";
    }
  }
  if (step === 4) {
    if (!form.ownerName.trim()) errors.ownerName = "Escribí tu nombre.";
    if (form.phone.replace(/\D/g, "").length !== 10) {
      errors.phone =
        "Revisá el número: necesitamos código de área y número (10 dígitos).";
    }
  }
  if (
    step === 5 &&
    (!form.consentPrice || !form.consentDeposit || !form.consentPrivacy)
  ) {
    errors.consent =
      "Para enviar la solicitud necesitamos que aceptes los tres puntos.";
  }
  return errors;
}

export function TurneroWizard({ slots }: { slots: BookableSlot[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Slots the server refused in this session: hidden at once, without waiting
  // for the refreshed list to arrive.
  const [takenSlotIds, setTakenSlotIds] = useState<string[]>([]);
  const days = useMemo(
    () =>
      groupSlotsByDay(slots.filter((s) => !takenSlotIds.includes(s.slotId))),
    [slots, takenSlotIds],
  );

  const [state, dispatch] = useReducer(reducer, {
    step: 1,
    selectedDateKey: days[0]?.dateKey ?? null,
    selectedSlotId: null,
    form: initialForm,
    errors: {},
    sending: false,
    submitError: null,
    taken: null,
    successCode: null,
  });

  // Each step is a new "page": start it from the top, not wherever the
  // previous (longer) step left the scroll.
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [state.step]);

  const selectedDay = days.find((d) => d.dateKey === state.selectedDateKey);
  const selectedSlot = selectedDay?.slots.find(
    (s) => s.slotId === state.selectedSlotId,
  );
  const slotLabel =
    selectedDay && selectedSlot
      ? `${selectedDay.dayLabel} · ${selectedSlot.timeLabel}`
      : "Sin elegir";

  function setField<K extends keyof WizardForm>(
    field: K,
    value: WizardForm[K],
  ) {
    dispatch({ type: "SET_FIELD", field, value });
  }

  function goBack() {
    dispatch({ type: "GO_STEP", step: Math.max(1, state.step - 1) });
  }

  function goToStep(step: number) {
    dispatch({ type: "GO_STEP", step });
  }

  async function handleNext() {
    if (state.step < TOTAL_STEPS) {
      const errors = validateStep(state.step, state);
      if (Object.keys(errors).length > 0) {
        dispatch({ type: "SET_ERRORS", errors });
        return;
      }
      dispatch({ type: "GO_STEP", step: state.step + 1 });
      return;
    }

    // Step 6: submit.
    dispatch({ type: "SUBMIT_START" });
    const payload: BookingFormInput = {
      slotId: state.selectedSlotId ?? "",
      dogName: state.form.dogName,
      sizeBucket: state.form.sizeBucket as BookingFormInput["sizeBucket"],
      breed: state.form.breed || undefined,
      coatState: (state.form.coatState ||
        undefined) as BookingFormInput["coatState"],
      servicePackage: state.form
        .servicePackage as BookingFormInput["servicePackage"],
      notes: state.form.notes || undefined,
      logisticsMode: state.form
        .logisticsMode as BookingFormInput["logisticsMode"],
      neighborhood: state.form.neighborhood || undefined,
      pickupAddress: state.form.pickupAddress || undefined,
      ownerName: state.form.ownerName,
      phone: state.form.phone,
      consentPrice: state.form.consentPrice,
      consentDeposit: state.form.consentDeposit,
      consentPrivacy: state.form.consentPrivacy,
    };

    startTransition(async () => {
      try {
        const result = await submitBookingAction(payload);
        if (result.ok) {
          dispatch({ type: "SUBMIT_SUCCESS", code: result.code });
        } else if (
          result.formError === "SLOT_TAKEN" ||
          result.formError === "DAY_FULL"
        ) {
          // Somebody else got there first. Drop the slot from the list right
          // away, say so, and re-read the real availability from the server.
          dispatch({
            type: "SUBMIT_TAKEN",
            label: slotLabel,
            reason: result.formError,
          });
          setTakenSlotIds((ids) => [...ids, payload.slotId]);
          router.refresh();
        } else if (Object.keys(result.fieldErrors).length > 0) {
          const fieldErrors = result.fieldErrors as WizardFieldErrors;
          dispatch({ type: "GO_STEP", step: stepForErrors(fieldErrors) });
          dispatch({ type: "SET_ERRORS", errors: fieldErrors });
        } else {
          dispatch({
            type: "SUBMIT_ERROR",
            error:
              result.formError === "RATE_LIMITED" ? "rate_limited" : "server",
          });
        }
      } catch {
        dispatch({ type: "SUBMIT_ERROR", error: "network" });
      }
    });
  }

  if (state.step === 7 && state.successCode) {
    return (
      <SuccessScreen
        code={state.successCode}
        slotLabel={slotLabel}
        dogName={state.form.dogName}
        depositAmountArs={depositAmountFor(
          (state.form.sizeBucket || "mediano") as
            "pequeno" | "mediano" | "grande",
        )}
        whatsAppMessage={customerSummaryMessage({
          dogName: state.form.dogName,
          slotLabel,
          code: state.successCode,
        })}
        onBackHome={() => router.push("/")}
      />
    );
  }

  const sending = state.sending || isPending;

  return (
    <div className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 px-4 py-6">
      <header className="border-lavender-100 flex flex-col gap-3 border-b pb-4">
        <div className="flex items-center gap-3">
          {state.step > 1 ? (
            <button
              type="button"
              onClick={goBack}
              aria-label="Volver al paso anterior"
              className="hover:bg-lavender-100 flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full"
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#25282C"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M15 5l-7 7 7 7" />
              </svg>
            </button>
          ) : null}
          <strong className="font-heading text-base">Solicitar turno</strong>
        </div>
        <Stepper
          step={state.step}
          totalSteps={TOTAL_STEPS}
          stepName={STEP_NAMES[state.step - 1]!}
        />
      </header>

      <main className="flex-1">
        {state.step === 1 ? (
          <Step1Slot
            days={days}
            selectedDateKey={state.selectedDateKey}
            selectedSlotId={state.selectedSlotId}
            error={state.errors.slot}
            taken={state.taken}
            onSelectDate={(dateKey) =>
              dispatch({ type: "SELECT_DATE", dateKey })
            }
            onSelectSlot={(slotId) => dispatch({ type: "SELECT_SLOT", slotId })}
          />
        ) : null}
        {state.step === 2 ? (
          <Step2Dog
            form={state.form}
            errors={state.errors}
            setField={setField}
          />
        ) : null}
        {state.step === 3 ? (
          <Step3Logistics
            form={state.form}
            errors={state.errors}
            setField={setField}
          />
        ) : null}
        {state.step === 4 ? (
          <Step4Owner
            form={state.form}
            errors={state.errors}
            setField={setField}
          />
        ) : null}
        {state.step === 5 ? (
          <Step5Consent
            form={state.form}
            errors={state.errors}
            setField={setField}
          />
        ) : null}
        {state.step === 6 ? (
          <Step6Review
            form={state.form}
            slotLabel={slotLabel}
            submitError={state.submitError}
            onEditStep={goToStep}
          />
        ) : null}
      </main>

      <div className="border-lavender-100 bg-canvas sticky bottom-0 flex gap-2.5 border-t py-3">
        {state.step > 1 ? (
          <Button variant="secondary" onClick={goBack} disabled={sending}>
            Atrás
          </Button>
        ) : null}
        <Button
          className="flex-1"
          onClick={handleNext}
          loading={sending}
          loadingText="Enviando…"
        >
          {state.step === TOTAL_STEPS
            ? state.submitError
              ? "Reintentar envío"
              : "Enviar solicitud"
            : "Continuar"}
        </Button>
      </div>

      <p className="text-ink-soft text-center text-xs">
        {businessConfig.address.street} · {businessConfig.businessHoursText}
      </p>
    </div>
  );
}
