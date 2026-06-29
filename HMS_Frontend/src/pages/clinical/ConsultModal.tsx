/**
 * ConsultModal – full clinical consultation record for a visit.
 * Replaces the simple "Add Diagnosis" modal with a tabbed,
 * Ghana-Health-Service-aligned encounter form.
 */
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, useFieldArray } from "react-hook-form";
import { Plus, Trash2, Search, FlaskConical, Pill } from "lucide-react";
import toast from "react-hot-toast";
import api from "@/lib/api";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import { FormField, Input, Select, Textarea } from "@/components/ui/Form";
import { formatDate, formatDateTime } from "@/lib/utils";

// ─── External types (shared with ClinicalPage) ────────────────────────────────

export interface VisitSummary {
  id: string;
  patientName?: string;
  patientNumber?: string;
  patient_id?: string;
  age?: number;
  sex?: string;
  visitDate: string;
  checkInTime: string;
  doctorName?: string;
  departmentName?: string;
  isEmergency: boolean;
  status: string;
}

// ─── Internal API types ───────────────────────────────────────────────────────

interface FullVisit {
  id: string;
  visit_number: string;
  visit_type: string;
  visit_status: string;
  visit_date: string;
  check_in_time: string;
  chief_complaint?: string;
  history_of_presenting_illness?: string;
  consultation_notes?: string;
  treatment_plan?: string;
  triage_notes?: string;
  is_emergency: boolean;
  referred_by?: string;
  patient?: {
    id: string;
    patient_number: string;
    name: string;
    date_of_birth: string;
    gender: string;
    phone: string;
  };
  department?: { id: string; name: string; code: string };
  created_by_user?: { id: string; name: string };
  triage_by_user?: { id: string; name: string };
  diagnoses?: DiagnosisRecord[];
  prescriptions?: PrescriptionRecord[];
  lab_orders?: LabOrderRecord[];
  vitals?: VitalRecord[];
}

interface DiagnosisRecord {
  id: string;
  code: string;
  name: string;
  type: string;
  diagnosed_date: string;
  diagnosed_by: { name: string };
}
interface PrescriptionRecord {
  id: string;
  prescription_number: string;
  prescription_date: string;
  is_dispensed: boolean;
  prescribed_by: { name: string };
}
interface LabOrderRecord {
  id: string;
  order_number: string;
  status: string;
  items?: { test_name: string; result_value?: string; status: string }[];
}
interface VitalRecord {
  id: string;
  recorded_at: string;
  temperature_celsius?: number;
  systolic_bp?: number;
  diastolic_bp?: number;
  heart_rate?: number;
  respiratory_rate?: number;
  oxygen_saturation?: number;
  height_cm?: number;
  weight_kg?: number;
  bmi?: number;
  pain_scale?: number;
  blood_glucose?: number;
  notes?: string;
}
interface PatientDetail {
  id: string;
  patient_number: string;
  ghs_unique_identifier?: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  date_of_birth: string;
  gender: string;
  marital_status?: string;
  occupation?: string;
  phone_number?: string;
  alternate_phone?: string;
  email?: string;
  blood_group?: string;
  genotype?: string;
  allergies?: string;
  chronic_conditions?: string;
  current_medications?: string;
  surgical_history?: string;
  family_history?: string;
  social_history?: string;
  nhis_number?: string;
  nhis_expiry_date?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  emergency_contact_relationship?: string;
}
interface DrugResult {
  id: string;
  drug_code: string;
  drug_name: string;
  generic_name?: string;
  brand_name?: string;
  drug_category?: string;
  dosage_form?: string;
  strength?: string;
  current_stock?: number;
}
interface DiagSuggestion {
  id: string;
  diagnosis_code: string;
  diagnosis_name: string;
  diagnosis_type?: string;
}
interface LabTest {
  id: string;
  test_name: string;
  test_code: string;
  test_category: string;
}
interface Department {
  id: string;
  department_name: string;
}

// ─── Form types ───────────────────────────────────────────────────────────────

type ComplaintForm = {
  chief_complaint: string;
  symptom_duration: string;
  hpi: string;
  associated_symptoms: string;
  previous_treatments: string;
  triggering_factors: string;
};
type ExamForm = {
  general_appearance: string;
  heent: string;
  cardiovascular: string;
  respiratory_exam: string;
  abdomen: string;
  musculoskeletal: string;
  neurological: string;
  skin: string;
  other_notes: string;
};
type DiagnosisForm = {
  diagnosis_code: string;
  diagnosis_name: string;
  diagnosis_type: string;
};
type RxItem = {
  medication_name: string;
  dosage: string;
  route: string;
  frequency: string;
  duration: string;
  quantity: string;
  instructions: string;
};
type RxForm = { items: RxItem[] };
type PlanForm = {
  care_plan: string;
  diet_instructions: string;
  activity_restrictions: string;
  monitoring: string;
  follow_up_date: string;
  follow_up_instructions: string;
  referral_to: string;
  clinical_notes: string;
  admission_decision: string;
  discharge_notes: string;
  transfer_department_id: string;
  transfer_reason: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

type ConsultTab =
  | "patient"
  | "complaints"
  | "vitals"
  | "examination"
  | "diagnosis"
  | "investigations"
  | "prescription"
  | "plan";

const TABS: { key: ConsultTab; label: string }[] = [
  { key: "patient", label: "Patient" },
  { key: "complaints", label: "Complaints & HPI" },
  { key: "vitals", label: "Vitals" },
  { key: "examination", label: "Examination" },
  { key: "diagnosis", label: "Diagnosis" },
  { key: "investigations", label: "Investigations" },
  { key: "prescription", label: "Prescription" },
  { key: "plan", label: "Plan & Notes" },
];

const DIAGNOSIS_TYPE_OPTS = [
  { value: "Primary", label: "Primary" },
  { value: "Secondary", label: "Secondary" },
  { value: "Differential", label: "Differential (Provisional)" },
];

const RX_ROUTES = [
  { value: "Oral", label: "Oral (PO)" },
  { value: "IV", label: "Intravenous (IV)" },
  { value: "IM", label: "Intramuscular (IM)" },
  { value: "SC", label: "Subcutaneous (SC)" },
  { value: "Topical", label: "Topical" },
  { value: "Sublingual", label: "Sublingual (SL)" },
  { value: "Inhalation", label: "Inhalation" },
  { value: "Rectal", label: "Rectal (PR)" },
  { value: "Nasal", label: "Nasal" },
  { value: "Ophthalmic", label: "Ophthalmic" },
];

const RX_FREQS = [
  { value: "Once daily", label: "Once daily (OD)" },
  { value: "Twice daily", label: "Twice daily (BD)" },
  { value: "Three times daily", label: "Three times daily (TID)" },
  { value: "Four times daily", label: "Four times daily (QID)" },
  { value: "Every 6 hours", label: "Every 6 hours (Q6H)" },
  { value: "Every 8 hours", label: "Every 8 hours (Q8H)" },
  { value: "Every 12 hours", label: "Every 12 hours (Q12H)" },
  { value: "At night", label: "At night (ON)" },
  { value: "As needed", label: "As needed (PRN)" },
  { value: "Stat", label: "Immediately (STAT)" },
];

const EMPTY_RX_ITEM: RxItem = {
  medication_name: "",
  dosage: "",
  route: "Oral",
  frequency: "Twice daily",
  duration: "",
  quantity: "",
  instructions: "",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function safeParse<T>(raw: string | undefined | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
function calcAge(dob: string) {
  return Math.floor(
    (Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 3600 * 1000),
  );
}
function routeFromDosageForm(dosageForm: string): string {
  const f = dosageForm.toLowerCase();
  if (f.includes("inject") || f.includes("vial")) return "IM";
  if (f.startsWith("iv") || f.includes(" iv")) return "IV";
  if (
    f.includes("topical") ||
    f.includes("cream") ||
    f.includes("gel") ||
    f.includes("ointment")
  )
    return "Topical";
  if (f.includes("inhale") || f.includes("inhaler")) return "Inhalation";
  if (f.includes("ophthal") || f.includes("eye drop")) return "Ophthalmic";
  if (f.includes("nasal")) return "Nasal";
  return "Oral";
}

// ─── Sub-components (module-level to avoid re-mount on every render) ──────────

function SectionTitle({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3 pb-1.5 border-b border-gray-100">
      {children}
    </p>
  );
}

function ROField({
  label,
  value,
}: Readonly<{ label: string; value?: string | null }>) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-0.5">
        {label}
      </p>
      <p className="text-sm text-gray-800 leading-snug">
        {value || <span className="text-gray-300">—</span>}
      </p>
    </div>
  );
}

function VitalCard({
  label,
  value,
  unit,
  normal,
}: Readonly<{
  label: string;
  value?: number | string | null;
  unit: string;
  normal?: [number, number];
}>) {
  const numVal = typeof value === "number" ? value : undefined;
  const abnormal =
    numVal !== undefined && normal
      ? numVal < normal[0] || numVal > normal[1]
      : false;
  return (
    <div
      className={`p-3 rounded-xl border ${abnormal ? "border-red-200 bg-red-50" : "border-gray-100 bg-gray-50"}`}
    >
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <p
        className={`text-lg font-semibold ${abnormal ? "text-red-700" : "text-gray-800"}`}
      >
        {value ?? <span className="text-gray-300">—</span>}
        {value != null && (
          <span className="text-sm font-normal ml-1 text-gray-400">{unit}</span>
        )}
      </p>
      {abnormal && (
        <p className="text-xs text-red-500 mt-0.5">Outside normal range</p>
      )}
    </div>
  );
}

interface DrugSuggestListProps {
  results: DrugResult[];
  idx: number;
  onSelect: (drug: DrugResult, idx: number) => void;
}
function DrugSuggestList({
  results,
  idx,
  onSelect,
}: Readonly<DrugSuggestListProps>) {
  return (
    <div className="absolute z-20 w-full mt-1 border border-gray-200 rounded-xl overflow-hidden max-h-44 overflow-y-auto shadow-lg bg-white">
      {results.map((drug) => (
        <button
          key={drug.id}
          type="button"
          onClick={() => onSelect(drug, idx)}
          className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-purple-50 text-left text-sm border-b border-gray-50 last:border-0"
        >
          <span className="font-mono text-xs text-purple-600 w-16 shrink-0">
            {drug.drug_code}
          </span>
          <span className="flex-1 font-medium text-gray-800">
            {drug.drug_name}
          </span>
          {drug.generic_name && (
            <span className="text-xs text-gray-500 truncate max-w-[120px]">
              {drug.generic_name}
            </span>
          )}
          <span className="text-xs text-gray-400 ml-1 shrink-0">
            {drug.strength}
          </span>
        </button>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  visit: VisitSummary;
  onClose: () => void;
}

// Stable badge class lookup to avoid nested ternaries
const DIAG_TYPE_CLS: Record<string, string> = {
  Primary: "bg-green-100 text-green-700",
  Secondary: "bg-purple-100 text-purple-700",
};
const LAB_STATUS_CLS: Record<string, string> = {
  Completed: "bg-green-100 text-green-700",
  Pending: "bg-yellow-100 text-yellow-700",
};

export default function ConsultModal({ visit, onClose }: Readonly<Props>) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<ConsultTab>("patient");
  const [labSearch, setLabSearch] = useState("");
  const [selectedTests, setSelectedTests] = useState<LabTest[]>([]);
  const [labPriority, setLabPriority] = useState("Routine");
  const [labNotes, setLabNotes] = useState("");
  const [diagSearch, setDiagSearch] = useState("");
  const [drugSearchIdx, setDrugSearchIdx] = useState<number | null>(null);
  const [drugSearchQ, setDrugSearchQ] = useState("");

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: vt, isLoading: vtLoading } = useQuery({
    queryKey: ["clinical", "visit", visit.id],
    queryFn: () =>
      api
        .get(`/clinical/visits/${visit.id}`)
        .then((r) => r.data.data as FullVisit),
  });

  const patientId = visit.patient_id ?? vt?.patient?.id;
  const { data: patient } = useQuery({
    queryKey: ["patients", patientId],
    queryFn: () =>
      api
        .get(`/patients/${patientId}`)
        .then((r) => r.data.data as PatientDetail),
    enabled: !!patientId,
  });

  const { data: labResults } = useQuery({
    queryKey: ["lab", "tests", "search", labSearch],
    queryFn: () =>
      api
        .get("/lab/tests/search", { params: { q: labSearch } })
        .then((r) => r.data.data as LabTest[]),
    enabled: labSearch.length >= 2,
  });

  const { data: diagSuggestions } = useQuery({
    queryKey: ["diag", "search", diagSearch],
    queryFn: () =>
      api
        .get("/clinical/diagnoses/search", { params: { q: diagSearch } })
        .then((r) => r.data.data as DiagSuggestion[]),
    enabled: diagSearch.length >= 2,
  });

  const { data: drugResults } = useQuery({
    queryKey: ["pharmacy", "drugs", "search", drugSearchQ],
    queryFn: () =>
      api
        .get("/pharmacy/drugs/search", { params: { q: drugSearchQ } })
        .then((r) => r.data.data as DrugResult[]),
    enabled: drugSearchQ.length >= 2,
  });

  const { data: departmentsData } = useQuery({
    queryKey: ["departments"],
    queryFn: () =>
      api.get("/departments").then((r) => r.data.data as Department[]),
  });

  // Fallback: fetch all patient vitals when the visit has none linked
  const { data: patientVitalsData } = useQuery({
    queryKey: ["patient-vitals", patientId],
    queryFn: () =>
      api
        .get(`/patients/${patientId}/vitals`)
        .then((r) => (r.data.data ?? r.data) as VitalRecord[]),
    enabled: !!patientId && !vtLoading && (vt?.vitals?.length ?? 0) === 0,
  });

  const deptOptions = [
    { value: "", label: "— Select department —" },
    ...(departmentsData ?? []).map((d: Department) => ({
      value: d.id,
      label: d.department_name,
    })),
  ];

  // ── Forms ──────────────────────────────────────────────────────────────────

  const complaintForm = useForm<ComplaintForm>();
  const examForm = useForm<ExamForm>();
  const diagForm = useForm<DiagnosisForm>();
  const rxForm = useForm<RxForm>({
    defaultValues: { items: [{ ...EMPTY_RX_ITEM }] },
  });
  const planForm = useForm<PlanForm>();

  const {
    fields: rxItems,
    append: addRx,
    remove: removeRx,
  } = useFieldArray({
    control: rxForm.control,
    name: "items",
  });

  // Pre-populate editable forms from loaded visit data
  useEffect(() => {
    if (!vt) return;
    const hpi = safeParse<Partial<ComplaintForm>>(
      vt.history_of_presenting_illness,
      {},
    );
    const exam = safeParse<Partial<ExamForm>>(vt.consultation_notes, {});
    const plan = safeParse<Partial<PlanForm>>(vt.treatment_plan, {});

    complaintForm.reset({
      chief_complaint: vt.chief_complaint ?? "",
      symptom_duration: hpi.symptom_duration ?? "",
      hpi: hpi.hpi ?? "",
      associated_symptoms: hpi.associated_symptoms ?? "",
      previous_treatments: hpi.previous_treatments ?? "",
      triggering_factors: hpi.triggering_factors ?? "",
    });
    examForm.reset({
      general_appearance: exam.general_appearance ?? "",
      heent: exam.heent ?? "",
      cardiovascular: exam.cardiovascular ?? "",
      respiratory_exam: exam.respiratory_exam ?? "",
      abdomen: exam.abdomen ?? "",
      musculoskeletal: exam.musculoskeletal ?? "",
      neurological: exam.neurological ?? "",
      skin: exam.skin ?? "",
      other_notes: exam.other_notes ?? "",
    });
    planForm.reset({
      care_plan: plan.care_plan ?? "",
      diet_instructions: plan.diet_instructions ?? "",
      activity_restrictions: plan.activity_restrictions ?? "",
      monitoring: plan.monitoring ?? "",
      follow_up_date: plan.follow_up_date ?? "",
      follow_up_instructions: plan.follow_up_instructions ?? "",
      referral_to: plan.referral_to ?? "",
      clinical_notes: plan.clinical_notes ?? "",
      admission_decision: plan.admission_decision ?? "",
      discharge_notes: plan.discharge_notes ?? "",
      transfer_department_id: plan.transfer_department_id ?? "",
      transfer_reason: plan.transfer_reason ?? "",
    });
  }, [vt]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Mutations ──────────────────────────────────────────────────────────────

  const updateVisit = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.put(`/clinical/visits/${visit.id}`, data),
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["clinical", "visit", visit.id] });
      qc.invalidateQueries({ queryKey: ["clinical"] });
    },
    onError: () => toast.error("Save failed"),
  });

  const addDiagnosis = useMutation({
    mutationFn: (d: DiagnosisForm) =>
      api.post(`/clinical/visits/${visit.id}/diagnoses`, d),
    onSuccess: () => {
      toast.success("Diagnosis added");
      qc.invalidateQueries({ queryKey: ["clinical", "visit", visit.id] });
      qc.invalidateQueries({ queryKey: ["clinical"] });
      diagForm.reset();
    },
    onError: () => toast.error("Failed to add diagnosis"),
  });

  const createLabOrder = useMutation({
    mutationFn: () =>
      api.post("/lab/orders", {
        patient_id: visit.patient_id,
        visit_id: visit.id,
        tests: selectedTests.map((t) => ({ test_id: t.id })),
        priority: labPriority,
        clinical_info: labNotes,
      }),
    onSuccess: () => {
      toast.success("Lab order submitted");
      setSelectedTests([]);
      setLabSearch("");
      setLabNotes("");
      qc.invalidateQueries({ queryKey: ["clinical", "visit", visit.id] });
      qc.invalidateQueries({ queryKey: ["clinical"] });
      qc.invalidateQueries({ queryKey: ["lab"] });
    },
    onError: () => toast.error("Failed to create lab order"),
  });

  const createPrescription = useMutation({
    mutationFn: (d: RxForm) =>
      api.post("/clinical/prescriptions", {
        patient_id: visit.patient_id,
        visit_id: visit.id,
        items: d.items.filter((i) => i.medication_name.trim()),
      }),
    onSuccess: () => {
      toast.success("Prescription saved");
      rxForm.reset({ items: [{ ...EMPTY_RX_ITEM }] });
      qc.invalidateQueries({ queryKey: ["clinical", "visit", visit.id] });
      qc.invalidateQueries({ queryKey: ["clinical"] });
      qc.invalidateQueries({ queryKey: ["pharmacy"] });
      qc.invalidateQueries({ queryKey: ["prescriptions"] });
    },
    onError: () => toast.error("Failed to save prescription"),
  });

  const discharge = useMutation({
    mutationFn: (notes: string) =>
      api.put(`/clinical/visits/${visit.id}/discharge`, {
        discharge_notes: notes,
      }),
    onSuccess: () => {
      toast.success("Patient discharged");
      qc.invalidateQueries({ queryKey: ["clinical"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      onClose();
    },
    onError: () => toast.error("Discharge failed"),
  });

  const transfer = useMutation({
    mutationFn: ({
      department_id,
      reason,
    }: {
      department_id: string;
      reason: string;
    }) =>
      api.put(`/clinical/visits/${visit.id}/transfer`, {
        department_id,
        reason,
      }),
    onSuccess: () => {
      toast.success("Patient transferred");
      qc.invalidateQueries({ queryKey: ["clinical"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      onClose();
    },
    onError: () => toast.error("Transfer failed"),
  });

  // ── Save handlers ──────────────────────────────────────────────────────────

  function saveComplaints(d: ComplaintForm) {
    const { chief_complaint, ...hpiFields } = d;
    updateVisit.mutate({
      chief_complaint,
      history_of_presenting_illness: JSON.stringify(hpiFields),
    });
  }

  function saveExam(d: ExamForm) {
    updateVisit.mutate({ consultation_notes: JSON.stringify(d) });
  }

  function savePlan(d: PlanForm) {
    const {
      discharge_notes,
      transfer_department_id,
      transfer_reason,
      ...planFields
    } = d;
    updateVisit.mutate({ treatment_plan: JSON.stringify(planFields) });

    if (d.admission_decision === "Discharge" && discharge_notes) {
      discharge.mutate(discharge_notes);
    } else if (d.admission_decision === "Transfer" && transfer_department_id) {
      transfer.mutate({
        department_id: transfer_department_id,
        reason: transfer_reason,
      });
    } else {
      onClose();
    }
  }

  // ── Tab renders ────────────────────────────────────────────────────────────

  // Use visit-linked vitals first; fall back to patient's most recent vitals
  const allVitals: VitalRecord[] =
    (vt?.vitals?.length ?? 0) > 0
      ? (vt!.vitals as VitalRecord[])
      : (patientVitalsData ?? []);

  function renderPatient() {
    if (!patient && vtLoading) return <Loader />;
    const p = patient;
    const dob = p?.date_of_birth ?? vt?.patient?.date_of_birth;
    const ageVal = dob ? calcAge(dob) : visit.age;
    const dobSuffix = dob ? ` · ${formatDate(dob)}` : "";
    const ageStr =
      ageVal === undefined ? undefined : `${ageVal} yrs${dobSuffix}`;
    const bloodGroup = p?.blood_group;
    const genotypeSuffix = p?.genotype ? ` / ${p.genotype}` : "";
    const bloodGroupStr = bloodGroup
      ? `${bloodGroup}${genotypeSuffix}`
      : undefined;
    const fullName = p
      ? [p.first_name, p.middle_name, p.last_name].filter(Boolean).join(" ")
      : visit.patientName;
    return (
      <div className="space-y-6">
        <section>
          <SectionTitle>Basic Information</SectionTitle>
          <div className="grid grid-cols-3 gap-x-6 gap-y-4">
            <ROField
              label="Patient ID"
              value={p?.patient_number ?? vt?.patient?.patient_number}
            />
            <ROField label="GHS Unique ID" value={p?.ghs_unique_identifier} />
            <ROField label="Full Name" value={fullName} />
            <ROField label="Age / Date of Birth" value={ageStr} />
            <ROField label="Sex / Gender" value={p?.gender ?? visit.sex} />
            <ROField label="Marital Status" value={p?.marital_status} />
            <ROField label="Occupation" value={p?.occupation} />
            <ROField label="Phone" value={p?.phone_number} />
            <ROField label="Alternate Phone" value={p?.alternate_phone} />
            <ROField label="Email" value={p?.email} />
            <ROField label="Blood Group" value={bloodGroupStr} />
          </div>
        </section>

        <section>
          <SectionTitle>Medical History</SectionTitle>
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            <ROField label="Known Allergies" value={p?.allergies} />
            <ROField label="Chronic Conditions" value={p?.chronic_conditions} />
            <ROField
              label="Current Medications"
              value={p?.current_medications}
            />
            <ROField label="Surgical History" value={p?.surgical_history} />
            <ROField label="Family History" value={p?.family_history} />
            <ROField label="Social History" value={p?.social_history} />
          </div>
        </section>

        <section>
          <SectionTitle>NHIS / Insurance</SectionTitle>
          <div className="grid grid-cols-3 gap-x-6 gap-y-4">
            <ROField label="NHIS Number" value={p?.nhis_number} />
            <ROField
              label="NHIS Expiry"
              value={
                p?.nhis_expiry_date ? formatDate(p.nhis_expiry_date) : undefined
              }
            />
          </div>
        </section>

        {p?.emergency_contact_name && (
          <section>
            <SectionTitle>Emergency Contact</SectionTitle>
            <div className="grid grid-cols-3 gap-x-6 gap-y-4">
              <ROField label="Name" value={p.emergency_contact_name} />
              <ROField label="Phone" value={p.emergency_contact_phone} />
              <ROField
                label="Relationship"
                value={p.emergency_contact_relationship}
              />
            </div>
          </section>
        )}
      </div>
    );
  }

  function renderComplaints() {
    return (
      <form
        onSubmit={complaintForm.handleSubmit(saveComplaints)}
        className="space-y-5"
      >
        <section>
          <SectionTitle>Chief Complaint</SectionTitle>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Chief Complaint" required className="col-span-2">
              <Input
                {...complaintForm.register("chief_complaint")}
                placeholder='e.g. "Fever and headache for 3 days"'
              />
            </FormField>
            <FormField label="Duration of Symptoms">
              <Input
                {...complaintForm.register("symptom_duration")}
                placeholder="e.g. 3 days, 2 weeks"
              />
            </FormField>
          </div>
        </section>

        <section>
          <SectionTitle>History of Present Illness (HPI)</SectionTitle>
          <div className="grid grid-cols-2 gap-4">
            <FormField
              label="Symptom Progression & Description"
              className="col-span-2"
            >
              <Textarea
                rows={3}
                {...complaintForm.register("hpi")}
                placeholder="How did symptoms start? Severity, character, radiation, timing…"
              />
            </FormField>
            <FormField label="Associated Symptoms">
              <Textarea
                rows={2}
                {...complaintForm.register("associated_symptoms")}
                placeholder="e.g. nausea, vomiting, chills, night sweats…"
              />
            </FormField>
            <FormField label="Previous Treatments Taken">
              <Textarea
                rows={2}
                {...complaintForm.register("previous_treatments")}
                placeholder="Self-medication, prior consultations, traditional medicine…"
              />
            </FormField>
            <FormField
              label="Triggering / Aggravating Factors"
              className="col-span-2"
            >
              <Input
                {...complaintForm.register("triggering_factors")}
                placeholder="e.g. exposure to cold, food intake, exertion…"
              />
            </FormField>
          </div>
        </section>

        <div className="flex justify-end pt-1">
          <Button type="submit" isLoading={updateVisit.isPending}>
            Save Complaints & HPI
          </Button>
        </div>
      </form>
    );
  }

  function renderVitals() {
    return (
      <div className="space-y-5">
        {allVitals.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">
            No vitals recorded for this visit yet.
            <br />
            <span className="text-xs">
              Vitals are recorded by nursing staff during triage.
            </span>
          </div>
        ) : (
          <div className="space-y-6">
            {allVitals.map((v, i) => (
              <div key={v.id ?? v.recorded_at}>
                {allVitals.length > 1 && (
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                    {i === 0 ? "Latest" : `Earlier reading`} ·{" "}
                    {formatDateTime(v.recorded_at)}
                  </p>
                )}
                {i === 0 && allVitals.length === 1 && (
                  <p className="text-xs text-gray-400 mb-2">
                    Recorded {formatDateTime(v.recorded_at)}
                  </p>
                )}
                <div className="grid grid-cols-4 gap-3">
                  <VitalCard
                    label="Temperature"
                    value={v.temperature_celsius}
                    unit="°C"
                    normal={[36.1, 37.2]}
                  />
                  <VitalCard
                    label="Blood Pressure"
                    value={
                      v.systolic_bp
                        ? `${v.systolic_bp}/${v.diastolic_bp}`
                        : null
                    }
                    unit="mmHg"
                  />
                  <VitalCard
                    label="Heart Rate"
                    value={v.heart_rate}
                    unit="bpm"
                    normal={[60, 100]}
                  />
                  <VitalCard
                    label="Respiratory Rate"
                    value={v.respiratory_rate}
                    unit="/min"
                    normal={[12, 20]}
                  />
                  <VitalCard
                    label="SpO₂"
                    value={v.oxygen_saturation}
                    unit="%"
                    normal={[95, 100]}
                  />
                  <VitalCard label="Height" value={v.height_cm} unit="cm" />
                  <VitalCard label="Weight" value={v.weight_kg} unit="kg" />
                  <VitalCard label="BMI" value={v.bmi} unit="kg/m²" />
                  <VitalCard
                    label="Pain Score"
                    value={v.pain_scale}
                    unit="/10"
                    normal={[0, 3]}
                  />
                  <VitalCard
                    label="Blood Glucose"
                    value={v.blood_glucose}
                    unit="mmol/L"
                    normal={[3.9, 7.8]}
                  />
                </div>
                {v.notes && (
                  <p className="mt-2 text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
                    <span className="font-medium text-gray-400 text-xs uppercase tracking-wide mr-2">
                      Notes:
                    </span>
                    {v.notes}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
        {vt?.triage_notes && (
          <section>
            <SectionTitle>Triage Notes</SectionTitle>
            <p className="text-sm text-gray-700 bg-amber-50 rounded-xl p-3 border border-amber-100 whitespace-pre-wrap">
              {vt.triage_notes}
            </p>
          </section>
        )}
      </div>
    );
  }

  function renderExamination() {
    return (
      <form onSubmit={examForm.handleSubmit(saveExam)} className="space-y-5">
        <SectionTitle>Physical Examination</SectionTitle>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="General Appearance" className="col-span-2">
            <Input
              {...examForm.register("general_appearance")}
              placeholder="e.g. Alert, well-oriented, no acute distress"
            />
          </FormField>
          <FormField label="HEENT (Head, Eyes, Ears, Nose, Throat)">
            <Textarea
              rows={2}
              {...examForm.register("heent")}
              placeholder="Conjunctiva, sclera, ear canals, nasal cavity, throat, tonsils…"
            />
          </FormField>
          <FormField label="Cardiovascular">
            <Textarea
              rows={2}
              {...examForm.register("cardiovascular")}
              placeholder="Heart sounds, murmurs, peripheral pulses, JVP…"
            />
          </FormField>
          <FormField label="Respiratory">
            <Textarea
              rows={2}
              {...examForm.register("respiratory_exam")}
              placeholder="Air entry, breath sounds, wheeze, crackles…"
            />
          </FormField>
          <FormField label="Abdomen">
            <Textarea
              rows={2}
              {...examForm.register("abdomen")}
              placeholder="Tenderness, organomegaly, bowel sounds, masses…"
            />
          </FormField>
          <FormField label="Musculoskeletal">
            <Textarea
              rows={2}
              {...examForm.register("musculoskeletal")}
              placeholder="Joints, range of motion, tenderness, swelling…"
            />
          </FormField>
          <FormField label="Neurological">
            <Textarea
              rows={2}
              {...examForm.register("neurological")}
              placeholder="Consciousness level, cranial nerves, motor/sensory, reflexes…"
            />
          </FormField>
          <FormField label="Skin">
            <Textarea
              rows={2}
              {...examForm.register("skin")}
              placeholder="Rashes, lesions, jaundice, pallor, cyanosis, oedema…"
            />
          </FormField>
          <FormField label="Other Findings" className="col-span-2">
            <Textarea
              rows={2}
              {...examForm.register("other_notes")}
              placeholder="Any other clinical observations…"
            />
          </FormField>
        </div>
        <div className="flex justify-end pt-1">
          <Button type="submit" isLoading={updateVisit.isPending}>
            Save Examination
          </Button>
        </div>
      </form>
    );
  }

  function renderDiagnosis() {
    const existing = vt?.diagnoses ?? [];
    return (
      <div className="space-y-6">
        {existing.length > 0 && (
          <section>
            <SectionTitle>Recorded Diagnoses</SectionTitle>
            <div className="space-y-2">
              {existing.map((d) => {
                const typeCls =
                  DIAG_TYPE_CLS[d.type] ?? "bg-yellow-100 text-yellow-700";
                return (
                  <div
                    key={d.id}
                    className="flex flex-wrap items-center gap-3 p-3 bg-gray-50 rounded-xl"
                  >
                    <span className="font-mono text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-md min-w-[60px] text-center">
                      {d.code || "N/A"}
                    </span>
                    <span className="flex-1 text-sm font-medium text-gray-800">
                      {d.name}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeCls}`}
                    >
                      {d.type}
                    </span>
                    <span className="text-xs text-gray-400">
                      {formatDate(d.diagnosed_date)}
                    </span>
                    <span className="text-xs text-gray-400">
                      by {d.diagnosed_by?.name}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <section>
          <SectionTitle>Add New Diagnosis</SectionTitle>
          <form
            onSubmit={diagForm.handleSubmit((d) => addDiagnosis.mutate(d))}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-4">
              <FormField
                label="Search ICD-10 Diagnoses (GHS Catalogue)"
                className="col-span-2"
              >
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                  <input
                    className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 bg-white"
                    placeholder="Type to search GHS-approved ICD-10 diagnoses…"
                    value={diagSearch}
                    onChange={(e) => setDiagSearch(e.target.value)}
                  />
                  {diagSearch.length >= 2 &&
                    diagSuggestions &&
                    diagSuggestions.length > 0 && (
                      <div className="absolute z-20 w-full mt-1 border border-gray-200 rounded-xl overflow-hidden max-h-56 overflow-y-auto shadow-lg bg-white">
                        {diagSuggestions.map((s) => (
                          <button
                            key={`${s.diagnosis_code}-${s.diagnosis_name}`}
                            type="button"
                            onClick={() => {
                              diagForm.setValue(
                                "diagnosis_code",
                                s.diagnosis_code,
                              );
                              diagForm.setValue(
                                "diagnosis_name",
                                s.diagnosis_name,
                              );
                              if (s.diagnosis_type)
                                diagForm.setValue(
                                  "diagnosis_type",
                                  s.diagnosis_type,
                                );
                              setDiagSearch("");
                            }}
                            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-primary-50 text-left text-sm border-b border-gray-50 last:border-0"
                          >
                            <span className="font-mono text-xs text-blue-600 w-[70px] shrink-0">
                              {s.diagnosis_code || "—"}
                            </span>
                            <span className="flex-1 text-gray-800">
                              {s.diagnosis_name}
                            </span>
                            {s.diagnosis_type && (
                              <span className="text-xs text-gray-400">
                                {s.diagnosis_type}
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  {diagSearch.length >= 2 && diagSuggestions?.length === 0 && (
                    <div className="absolute z-20 w-full mt-1 border border-gray-100 rounded-xl bg-white shadow p-3 text-sm text-gray-400 text-center">
                      No matching diagnoses — enter ICD-10 code and name
                      manually below
                    </div>
                  )}
                </div>
              </FormField>
              <FormField label="ICD-10 Code">
                <Input
                  {...diagForm.register("diagnosis_code")}
                  placeholder="e.g. J06.9, B50.0, A09, E11"
                />
              </FormField>
              <FormField label="Type" required>
                <Select
                  options={DIAGNOSIS_TYPE_OPTS}
                  {...diagForm.register("diagnosis_type", { required: true })}
                />
              </FormField>
              <FormField label="Diagnosis Name" required className="col-span-2">
                <Input
                  {...diagForm.register("diagnosis_name", {
                    required: "Diagnosis name is required",
                  })}
                  placeholder="e.g. Malaria (Uncomplicated), Type 2 Diabetes Mellitus, Acute Gastroenteritis"
                />
              </FormField>
            </div>
            <div className="flex justify-end">
              <Button type="submit" isLoading={addDiagnosis.isPending}>
                Add Diagnosis
              </Button>
            </div>
          </form>
        </section>
      </div>
    );
  }

  function addTest(t: LabTest) {
    setSelectedTests((prev) => [...prev, t]);
    setLabSearch("");
  }
  function removeTest(id: string) {
    setSelectedTests((prev) => prev.filter((s) => s.id !== id));
  }
  function selectDrug(drug: DrugResult, idx: number) {
    const genericPart = drug.generic_name ? " (" + drug.generic_name + ")" : "";
    rxForm.setValue(
      `items.${idx}.medication_name`,
      drug.drug_name + genericPart,
    );
    if (drug.strength) rxForm.setValue(`items.${idx}.dosage`, drug.strength);
    if (drug.dosage_form)
      rxForm.setValue(
        `items.${idx}.route`,
        routeFromDosageForm(drug.dosage_form),
      );
    setDrugSearchQ("");
    setDrugSearchIdx(null);
  }
  function handleRemoveRx(e: React.MouseEvent<HTMLButtonElement>) {
    removeRx(Number(e.currentTarget.dataset.idx));
  }
  function handleDrugChange(e: React.ChangeEvent<HTMLInputElement>) {
    setDrugSearchIdx(Number(e.currentTarget.dataset.idx));
    setDrugSearchQ(e.target.value);
  }
  function handleDrugFocus(e: React.FocusEvent<HTMLInputElement>) {
    setDrugSearchIdx(Number(e.currentTarget.dataset.idx));
  }

  function renderInvestigations() {
    const existing = vt?.lab_orders ?? [];
    return (
      <div className="space-y-6">
        {existing.length > 0 && (
          <section>
            <SectionTitle>Existing Lab Orders</SectionTitle>
            <div className="space-y-2">
              {existing.map((o) => {
                const statusCls =
                  LAB_STATUS_CLS[o.status] ?? "bg-gray-100 text-gray-600";
                return (
                  <div
                    key={o.id}
                    className="p-3 bg-gray-50 rounded-xl space-y-1.5"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs text-gray-500">
                        {o.order_number}
                      </span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusCls}`}
                      >
                        {o.status}
                      </span>
                    </div>
                    {o.items?.map((item) => (
                      <div
                        key={item.test_name}
                        className="flex items-center gap-2 text-sm text-gray-700 pl-1"
                      >
                        <FlaskConical className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        <span>{item.test_name}</span>
                        {item.result_value && (
                          <span className="ml-1 text-green-700 font-medium">
                            → {item.result_value}
                          </span>
                        )}
                        <span
                          className={`ml-auto text-xs ${
                            item.status === "Completed"
                              ? "text-green-600"
                              : "text-gray-400"
                          }`}
                        >
                          {item.status}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <section>
          <SectionTitle>Order New Investigations</SectionTitle>
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
              <input
                className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 bg-white"
                placeholder="Search tests — e.g. CBC, Malaria, LFT, RFT, CXR, urine, ECG…"
                value={labSearch}
                onChange={(e) => setLabSearch(e.target.value)}
              />
            </div>

            {labSearch.length >= 2 && labResults && labResults.length > 0 && (
              <div className="border border-gray-200 rounded-xl overflow-hidden max-h-44 overflow-y-auto shadow-sm">
                {labResults.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    disabled={selectedTests.some((s) => s.id === t.id)}
                    onClick={() => addTest(t)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-primary-50 text-left text-sm disabled:opacity-40 disabled:cursor-not-allowed border-b border-gray-50 last:border-0"
                  >
                    <span className="font-mono text-xs text-gray-400 w-16 shrink-0">
                      {t.test_code}
                    </span>
                    <span className="flex-1 text-gray-800">{t.test_name}</span>
                    <span className="text-xs text-gray-400">
                      {t.test_category}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {labSearch.length >= 2 && labResults?.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-2">
                No tests found matching "{labSearch}"
              </p>
            )}

            {selectedTests.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-gray-500 uppercase">
                  Selected ({selectedTests.length})
                </p>
                {selectedTests.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center gap-2.5 p-2.5 bg-blue-50 rounded-xl text-sm"
                  >
                    <FlaskConical className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                    <span className="flex-1 text-blue-800 font-medium">
                      {t.test_name}
                    </span>
                    <span className="text-xs text-blue-400">
                      {t.test_category}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeTest(t.id)}
                      className="p-0.5 hover:text-red-500 text-blue-300"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="lab-priority"
                  className="block text-xs font-medium text-gray-600 mb-1"
                >
                  Priority
                </label>
                <select
                  id="lab-priority"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-400"
                  value={labPriority}
                  onChange={(e) => setLabPriority(e.target.value)}
                >
                  <option value="Routine">Routine</option>
                  <option value="Urgent">Urgent</option>
                  <option value="STAT">STAT (Emergency)</option>
                </select>
              </div>
              <div>
                <label
                  htmlFor="lab-notes"
                  className="block text-xs font-medium text-gray-600 mb-1"
                >
                  Clinical Indication
                </label>
                <input
                  id="lab-notes"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-400"
                  placeholder="Clinical reason for tests…"
                  value={labNotes}
                  onChange={(e) => setLabNotes(e.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                onClick={() => createLabOrder.mutate()}
                disabled={selectedTests.length === 0}
                isLoading={createLabOrder.isPending}
              >
                Submit Lab Order
              </Button>
            </div>
          </div>
        </section>
      </div>
    );
  }

  function renderPrescription() {
    const existing = vt?.prescriptions ?? [];
    return (
      <div className="space-y-6">
        {existing.length > 0 && (
          <section>
            <SectionTitle>Existing Prescriptions</SectionTitle>
            <div className="space-y-1.5">
              {existing.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-wrap items-center gap-3 p-2.5 bg-gray-50 rounded-xl text-sm"
                >
                  <Pill className="w-4 h-4 text-purple-500 shrink-0" />
                  <span className="font-mono text-xs text-gray-400">
                    {p.prescription_number}
                  </span>
                  <span className="text-gray-600">
                    {formatDate(p.prescription_date)}
                  </span>
                  <span className="text-gray-400 text-xs">
                    by {p.prescribed_by?.name}
                  </span>
                  <span
                    className={`ml-auto text-xs px-2 py-0.5 rounded-full font-medium ${
                      p.is_dispensed
                        ? "bg-green-100 text-green-700"
                        : "bg-yellow-100 text-yellow-700"
                    }`}
                  >
                    {p.is_dispensed ? "Dispensed" : "Pending"}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        <section>
          <SectionTitle>New Prescription</SectionTitle>
          <form
            onSubmit={rxForm.handleSubmit((d) => createPrescription.mutate(d))}
            className="space-y-3"
          >
            {rxItems.map((field, idx) => (
              <div
                key={field.id}
                className="border border-gray-100 rounded-xl p-4 space-y-3 bg-gray-50"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Drug {idx + 1}
                  </span>
                  {rxItems.length > 1 && (
                    <button
                      type="button"
                      data-idx={String(idx)}
                      onClick={handleRemoveRx}
                      className="text-red-400 hover:text-red-600 p-1 rounded-lg hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <FormField
                    label="Search Drug (formulary)"
                    className="col-span-3"
                  >
                    <div className="relative">
                      <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                      <input
                        className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 bg-white"
                        placeholder="Search by drug name, generic name or code…"
                        value={drugSearchIdx === idx ? drugSearchQ : ""}
                        data-idx={String(idx)}
                        onChange={handleDrugChange}
                        onFocus={handleDrugFocus}
                      />
                      {drugSearchIdx === idx &&
                        drugSearchQ.length >= 2 &&
                        drugResults &&
                        drugResults.length > 0 && (
                          <DrugSuggestList
                            results={drugResults}
                            idx={idx}
                            onSelect={selectDrug}
                          />
                        )}
                      {drugSearchIdx === idx &&
                        drugSearchQ.length >= 2 &&
                        drugResults?.length === 0 && (
                          <div className="absolute z-20 w-full mt-1 border border-gray-100 rounded-xl bg-white shadow p-3 text-sm text-gray-400 text-center">
                            No drugs found — enter name manually below
                          </div>
                        )}
                    </div>
                  </FormField>
                  <FormField label="Drug Name" required className="col-span-3">
                    <Input
                      {...rxForm.register(`items.${idx}.medication_name`, {
                        required: true,
                      })}
                      placeholder="e.g. Paracetamol 500mg tablets, Artemether-Lumefantrine"
                    />
                  </FormField>
                  <FormField label="Dosage" required>
                    <Input
                      {...rxForm.register(`items.${idx}.dosage`, {
                        required: true,
                      })}
                      placeholder="e.g. 500mg, 2 tabs"
                    />
                  </FormField>
                  <FormField label="Route">
                    <Select
                      options={RX_ROUTES}
                      {...rxForm.register(`items.${idx}.route`)}
                    />
                  </FormField>
                  <FormField label="Frequency">
                    <Select
                      options={RX_FREQS}
                      {...rxForm.register(`items.${idx}.frequency`)}
                    />
                  </FormField>
                  <FormField label="Duration">
                    <Input
                      {...rxForm.register(`items.${idx}.duration`)}
                      placeholder="e.g. 5 days"
                    />
                  </FormField>
                  <FormField label="Quantity">
                    <Input
                      {...rxForm.register(`items.${idx}.quantity`)}
                      placeholder="e.g. 30 tablets"
                    />
                  </FormField>
                  <FormField label="Instructions">
                    <Input
                      {...rxForm.register(`items.${idx}.instructions`)}
                      placeholder="e.g. After food, with plenty of water"
                    />
                  </FormField>
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={() => addRx({ ...EMPTY_RX_ITEM })}
              className="flex items-center gap-2 text-sm text-primary-600 hover:text-primary-800 font-medium py-1"
            >
              <Plus className="w-4 h-4" /> Add Another Drug
            </button>

            <div className="flex justify-end pt-1">
              <Button type="submit" isLoading={createPrescription.isPending}>
                Save Prescription
              </Button>
            </div>
          </form>
        </section>
      </div>
    );
  }

  function renderPlan() {
    const decision = planForm.watch("admission_decision");
    return (
      <form onSubmit={planForm.handleSubmit(savePlan)} className="space-y-6">
        <section>
          <SectionTitle>Care Plan & Advice</SectionTitle>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Treatment / Care Plan" className="col-span-2">
              <Textarea
                rows={3}
                {...planForm.register("care_plan")}
                placeholder="Overall treatment plan, clinical advice and management…"
              />
            </FormField>
            <FormField label="Dietary Instructions">
              <Textarea
                rows={2}
                {...planForm.register("diet_instructions")}
                placeholder="e.g. ORS every 2 hours, low-salt diet, avoid alcohol…"
              />
            </FormField>
            <FormField label="Activity Restrictions">
              <Textarea
                rows={2}
                {...planForm.register("activity_restrictions")}
                placeholder="e.g. Bed rest for 3 days, no heavy lifting for 2 weeks…"
              />
            </FormField>
            <FormField label="Monitoring Instructions" className="col-span-2">
              <Input
                {...planForm.register("monitoring")}
                placeholder="e.g. Check temperature 6-hourly, watch for signs of bleeding…"
              />
            </FormField>
          </div>
        </section>

        <section>
          <SectionTitle>Follow-Up & Referral</SectionTitle>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Follow-Up Date">
              <Input type="date" {...planForm.register("follow_up_date")} />
            </FormField>
            <FormField label="Refer to Specialist">
              <Input
                {...planForm.register("referral_to")}
                placeholder="e.g. Cardiology, Ophthalmology, Paediatrics…"
              />
            </FormField>
            <FormField label="Follow-Up Instructions" className="col-span-2">
              <Textarea
                rows={2}
                {...planForm.register("follow_up_instructions")}
                placeholder="What the patient should watch for and report at next visit…"
              />
            </FormField>
          </div>
        </section>

        <section>
          <SectionTitle>Clinical Notes</SectionTitle>
          <FormField label="Doctor's Notes">
            <Textarea
              rows={3}
              {...planForm.register("clinical_notes")}
              placeholder="Additional observations, reasoning, differential considerations…"
            />
          </FormField>
        </section>

        <section>
          <SectionTitle>Admission Decision</SectionTitle>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Decision" className="col-span-2">
              <Select
                options={[
                  { value: "", label: "— No decision yet —" },
                  { value: "Review", label: "Schedule review / follow-up" },
                  { value: "Discharge", label: "Discharge patient" },
                  { value: "Admit", label: "Admit (inpatient)" },
                  { value: "Transfer", label: "Transfer to department" },
                  { value: "Refer", label: "External referral" },
                ]}
                {...planForm.register("admission_decision")}
              />
            </FormField>

            {(decision === "Discharge" || decision === "Admit") && (
              <FormField
                label="Discharge / Admission Summary"
                className="col-span-2"
              >
                <Textarea
                  rows={3}
                  {...planForm.register("discharge_notes")}
                  placeholder="Summary for patient, discharge instructions, medications…"
                />
              </FormField>
            )}

            {decision === "Transfer" && (
              <>
                <FormField label="Transfer to Department" required>
                  <Select
                    options={deptOptions}
                    {...planForm.register("transfer_department_id", {
                      required: decision === "Transfer",
                    })}
                  />
                </FormField>
                <FormField label="Reason for Transfer" required>
                  <Input
                    {...planForm.register("transfer_reason", {
                      required: decision === "Transfer",
                    })}
                    placeholder="Clinical reason for transfer…"
                  />
                </FormField>
              </>
            )}
          </div>
        </section>

        <div className="flex justify-end pt-1">
          <Button
            type="submit"
            isLoading={
              updateVisit.isPending || discharge.isPending || transfer.isPending
            }
          >
            Save Plan & Close
          </Button>
        </div>
      </form>
    );
  }

  // ── Visit info banner (inside scrollable content) ──────────────────────────

  const patientName = vt?.patient?.name ?? visit.patientName ?? "Patient";
  const patientDob = vt?.patient?.date_of_birth;
  const ageDisplay = patientDob ? calcAge(patientDob) : visit.age;
  const sex = vt?.patient?.gender ?? visit.sex;

  return (
    <Modal open onClose={onClose} title="Clinical Consultation" size="xl">
      {/* sticky visit banner */}
      <div className="-mx-6 -mt-6 mb-0">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-6 py-2.5 bg-primary-50 border-b border-primary-100 text-sm">
          <span className="font-semibold text-primary-800">{patientName}</span>
          {ageDisplay !== undefined && (
            <span className="text-primary-600">
              {ageDisplay} yrs · <span className="capitalize">{sex}</span>
            </span>
          )}
          <span className="text-gray-300">|</span>
          <span className="font-mono text-xs text-gray-500">
            {vt?.visit_number ?? visit.id.slice(0, 8).toUpperCase()}
          </span>
          <span className="text-gray-500">{formatDate(visit.visitDate)}</span>
          {vt?.department?.name && (
            <span className="text-gray-500">{vt.department.name}</span>
          )}
          {vt?.created_by_user?.name && (
            <span className="text-gray-400 text-xs">
              Dr. {vt.created_by_user.name}
            </span>
          )}
          <span
            className={`ml-auto text-xs px-2 py-0.5 rounded-full font-medium ${
              visit.isEmergency
                ? "bg-red-100 text-red-700"
                : "bg-gray-100 text-gray-500"
            }`}
          >
            {vt?.visit_type ?? (visit.isEmergency ? "Emergency" : "Outpatient")}
          </span>
        </div>

        {/* Tab bar */}
        <div className="flex overflow-x-auto bg-white border-b border-gray-100 px-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-xs font-semibold whitespace-nowrap border-b-2 transition-all ${
                tab === t.key
                  ? "border-primary-500 text-primary-700"
                  : "border-transparent text-gray-400 hover:text-gray-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="pt-5">
        {vtLoading && tab !== "patient" ? (
          <Loader />
        ) : (
          <>
            {tab === "patient" && renderPatient()}
            {tab === "complaints" && renderComplaints()}
            {tab === "vitals" && renderVitals()}
            {tab === "examination" && renderExamination()}
            {tab === "diagnosis" && renderDiagnosis()}
            {tab === "investigations" && renderInvestigations()}
            {tab === "prescription" && renderPrescription()}
            {tab === "plan" && renderPlan()}
          </>
        )}
      </div>
    </Modal>
  );
}

function Loader() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="animate-spin w-6 h-6 border-2 border-primary-400 border-t-transparent rounded-full" />
    </div>
  );
}
