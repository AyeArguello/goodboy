import type {
  CoatState,
  LogisticsMode,
  ServicePackageKey,
  SizeBucket,
} from "@/lib/domain/appointment";

export interface WizardForm {
  dogName: string;
  sizeBucket: SizeBucket | "";
  breed: string;
  coatState: CoatState | "";
  servicePackage: ServicePackageKey | "";
  notes: string;
  logisticsMode: LogisticsMode | "";
  neighborhood: string;
  pickupAddress: string;
  ownerName: string;
  phone: string;
  email: string;
  consentPrice: boolean;
  consentDeposit: boolean;
  consentPrivacy: boolean;
}

export const initialForm: WizardForm = {
  dogName: "",
  sizeBucket: "",
  breed: "",
  coatState: "",
  servicePackage: "",
  notes: "",
  logisticsMode: "",
  neighborhood: "",
  pickupAddress: "",
  ownerName: "",
  phone: "",
  email: "",
  consentPrice: false,
  consentDeposit: false,
  consentPrivacy: false,
};

export type WizardFieldErrors = Partial<
  Record<keyof WizardForm | "slot" | "consent", string>
>;

export const TOTAL_STEPS = 6;
export const STEP_NAMES = [
  "Fecha y horario",
  "Tu perro",
  "Logística",
  "Responsable",
  "Consentimientos",
  "Revisión",
];
