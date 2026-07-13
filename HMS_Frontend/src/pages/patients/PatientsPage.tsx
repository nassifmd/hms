import React, { useState, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Search,
  Download,
  Eye,
  Pencil,
  Phone,
  Hash,
  CalendarPlus,
  Heart,
  Activity,
  CreditCard,
  FlaskConical,
  FileText,
  ChevronDown,
} from "lucide-react";
import { useForm, type UseFormReturn } from "react-hook-form";
import toast from "react-hot-toast";
import api from "@/lib/api";
import type { Patient } from "@/types";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import DataTable from "@/components/ui/DataTable";
import Modal from "@/components/ui/Modal";
import { FormField, Input, Select, Textarea } from "@/components/ui/Form";
import { formatDate, calcAge } from "@/lib/utils";
import { useDebounce } from "@/lib/useDebounce";
import { AppointmentForm } from "@/pages/appointments/AppointmentsPage";

const DETAIL_TABS = [
  { key: "info" as const, label: "Info", Icon: FileText },
  { key: "vitals" as const, label: "Vitals", Icon: Heart },
  { key: "visits" as const, label: "Visits", Icon: Activity },
  { key: "bills" as const, label: "Bills", Icon: CreditCard },
  { key: "prescriptions" as const, label: "Rx", Icon: FileText },
  { key: "labs" as const, label: "Lab Orders", Icon: FlaskConical },
];
type DetailTab = (typeof DETAIL_TABS)[number]["key"];

// Group an array of records by calendar date, newest first
function groupByDate<T extends Record<string, unknown>>(
  items: T[],
  getDate: (item: T) => string | null | undefined,
): { dateKey: string; label: string; items: T[] }[] {
  const map = new Map<string, { label: string; items: T[] }>();
  for (const item of items) {
    const rawStr = getDate(item) ?? null;
    const d = rawStr ? new Date(rawStr) : null;
    const key =
      d && !Number.isNaN(d.getTime())
        ? d.toISOString().slice(0, 10)
        : "unknown";
    const label =
      d && !Number.isNaN(d.getTime())
        ? d.toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })
        : "Unknown Date";
    if (!map.has(key)) map.set(key, { label, items: [] });
    map.get(key)!.items.push(item);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([dateKey, { label, items }]) => ({ dateKey, label, items }));
}

const genderOptions = [
  { value: "Male", label: "Male" },
  { value: "Female", label: "Female" },
  { value: "Other", label: "Other" },
];

const bloodGroupOptions = [
  "A+",
  "A-",
  "B+",
  "B-",
  "O+",
  "O-",
  "AB+",
  "AB-",
].map((v) => ({ value: v, label: v }));
const titleOptions = ["Mr", "Mrs", "Ms", "Miss", "Dr", "Prof", "Rev"].map(
  (v) => ({ value: v, label: v }),
);
const maritalStatusOptions = [
  "Single",
  "Married",
  "Divorced",
  "Widowed",
  "Separated",
].map((v) => ({ value: v, label: v }));
const genotypeOptions = ["AA", "AS", "SS", "SC", "AC"].map((v) => ({
  value: v,
  label: v,
}));
const idTypeOptions = [
  "Ghana Card",
  "Passport",
  "Voter's ID",
  "NHIS Card",
  "SSNIT Card",
  "Driver's License",
].map((v) => ({ value: v, label: v }));
const relationshipOptions = [
  "Spouse",
  "Parent",
  "Child",
  "Sibling",
  "Grandparent",
  "Grandchild",
  "Aunt / Uncle",
  "Niece / Nephew",
  "Cousin",
  "In-law",
  "Guardian",
  "Friend",
  "Colleague",
  "Neighbour",
  "Other",
].map((v) => ({ value: v, label: v }));

const ghanaRegions = [
  "Greater Accra",
  "Ashanti",
  "Western",
  "Central",
  "Eastern",
  "Volta",
  "Oti",
  "Bono",
  "Bono East",
  "Ahafo",
  "Northern",
  "Savannah",
  "North East",
  "Upper East",
  "Upper West",
  "Western North",
].map((v) => ({ value: v, label: v }));

const nationalityOptions = [
  "Ghanaian",
  "Nigerian",
  "Togolese",
  "Ivorian",
  "Burkinabe",
  "Beninese",
  "Liberian",
  "Sierra Leonean",
  "Gambian",
  "Guinean",
  "Senegalese",
  "Malian",
  "South African",
  "Kenyan",
  "Ugandan",
  "Tanzanian",
  "Rwandan",
  "Ethiopian",
  "Cameroonian",
  "Congolese",
  "American",
  "British",
  "Canadian",
  "French",
  "German",
  "Chinese",
  "Indian",
  "Lebanese",
  "Other",
].map((v) => ({ value: v, label: v }));

const religionOptions = [
  "Christianity",
  "Islam",
  "Traditional / African",
  "Hinduism",
  "Buddhism",
  "Judaism",
  "No Religion",
  "Other",
].map((v) => ({ value: v, label: v }));

const tribeOptions = [
  "Akan",
  "Ashanti",
  "Fante",
  "Ewe",
  "Ga",
  "Adangbe",
  "Dagomba",
  "Dagaaba",
  "Gonja",
  "Hausa",
  "Wala",
  "Nzema",
  "Sefwi",
  "Kusasi",
  "Frafra / Gurense",
  "Mole-Dagbani",
  "Sisala",
  "Konkomba",
  "Other",
].map((v) => ({ value: v, label: v }));

const insuranceProviderOptions = [
  { value: "NHIS", label: "NHIS (National Health Insurance)" },
  { value: "GLICO", label: "GLICO Healthcare" },
  { value: "SIC", label: "SIC Life" },
  { value: "Enterprise", label: "Enterprise Life" },
  { value: "Metropolitan", label: "Metropolitan Life" },
  { value: "Nationwide", label: "Nationwide Medical Insurance" },
  { value: "Premier", label: "Premier Insurance" },
  { value: "Hollard", label: "Hollard Insurance" },
  { value: "Prudential", label: "Prudential Life Insurance" },
  { value: "StarLife", label: "Star Life Assurance" },
  { value: "OldMutual", label: "Old Mutual Ghana" },
  { value: "PhoenixLife", label: "Phoenix Life Assurance" },
  { value: "Acacia", label: "Acacia Health Insurance" },
  { value: "Equity", label: "Equity Health Insurance" },
  { value: "Other", label: "Other" },
];

const insuranceTypeOptions = [
  { value: "NHIS", label: "NHIS" },
  { value: "Private", label: "Private" },
  { value: "Corporate", label: "Corporate" },
];

const COMMON_ALLERGIES = [
  "Penicillin",
  "Amoxicillin",
  "Aspirin",
  "Ibuprofen",
  "Paracetamol",
  "Sulfonamides",
  "Codeine",
  "Morphine",
  "Erythromycin",
  "Tetracycline",
  "Ciprofloxacin",
  "Metronidazole",
  "Ampicillin",
  "Cephalosporins",
  "Latex",
  "Peanuts",
  "Tree nuts",
  "Shellfish",
  "Fish",
  "Milk / Dairy",
  "Eggs",
  "Wheat / Gluten",
  "Soy",
  "Bee stings",
  "Wasp stings",
  "Dust mites",
  "Pollen",
  "Mould",
  "Pet dander",
  "Iodine / Contrast dye",
  "Nickel",
  "Chlorhexidine",
];

export default function PatientsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [addOpen, setAddOpen] = useState(false);
  const [viewPatient, setViewPatient] = useState<Patient | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("info");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set(),
  );
  const toggleGroup = (key: string) =>
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const [editOpen, setEditOpen] = useState(false);
  const [addVitalsOpen, setAddVitalsOpen] = useState(false);
  const [bookApptOpen, setBookApptOpen] = useState(false);
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["patients", page, debouncedSearch],
    queryFn: () =>
      api
        .get("/patients", {
          params: { page, limit: 20, search: debouncedSearch || undefined },
        })
        .then((r) => r.data),
  });

  // Sub-queries for patient detail tabs (only fetched when the tab is active)
  const { data: vitalsData, isLoading: vitalsLoading } = useQuery({
    queryKey: ["patient-vitals", viewPatient?.id],
    queryFn: () =>
      api
        .get(`/patients/${viewPatient!.id}/vitals`)
        .then((r) => (r.data.data ?? r.data) as Record<string, unknown>[]),
    enabled: !!viewPatient && detailTab === "vitals",
  });
  const { data: visitsData, isLoading: visitsLoading } = useQuery({
    queryKey: ["patient-visits", viewPatient?.id],
    queryFn: () =>
      api
        .get(`/patients/${viewPatient!.id}/visits`)
        .then((r) => (r.data.data ?? r.data) as Record<string, unknown>[]),
    enabled: !!viewPatient && detailTab === "visits",
  });
  const { data: billsData, isLoading: billsLoading } = useQuery({
    queryKey: ["patient-bills", viewPatient?.id],
    queryFn: () =>
      api
        .get(`/patients/${viewPatient!.id}/bills`)
        .then((r) => (r.data.data ?? r.data) as Record<string, unknown>[]),
    enabled: !!viewPatient && detailTab === "bills",
  });
  const { data: prescriptionsData, isLoading: prescriptionsLoading } = useQuery(
    {
      queryKey: ["patient-prescriptions", viewPatient?.id],
      queryFn: () =>
        api
          .get(`/patients/${viewPatient!.id}/prescriptions`)
          .then((r) => (r.data.data ?? r.data) as Record<string, unknown>[]),
      enabled: !!viewPatient && detailTab === "prescriptions",
    },
  );
  const { data: labsData, isLoading: labsLoading } = useQuery({
    queryKey: ["patient-labs", viewPatient?.id],
    queryFn: () =>
      api
        .get(`/patients/${viewPatient!.id}/lab-orders`)
        .then((r) => (r.data.data ?? r.data) as Record<string, unknown>[]),
    enabled: !!viewPatient && detailTab === "labs",
  });

  const patients: Patient[] = (data?.patients ?? []).map(mapApiPatient);
  const pagination = data
    ? { total: data.total, page: data.page, totalPages: data.pages }
    : undefined;

  const createMutation = useMutation({
    mutationFn: async (payload: Partial<Patient>) => {
      const body: Record<string, unknown> = {
        title: payload.title,
        first_name: payload.firstName,
        middle_name: payload.middleName,
        last_name: payload.lastName,
        date_of_birth: payload.dateOfBirth,
        gender: payload.gender,
        marital_status: payload.maritalStatus,
        genotype: payload.genotype,
        phone_number: payload.phone,
        alternate_phone: payload.alternatePhone,
        email: payload.email,
        address_line1: payload.addressLine1,
        address_line2: payload.addressLine2,
        city: payload.city,
        district: payload.district,
        region: payload.region,
        postal_code: payload.postalCode,
        digital_address: payload.digitalAddress,
        nhis_number: payload.nhisNumber,
        nhis_expiry_date: payload.nhisExpiryDate,
        ghs_unique_identifier: payload.ghsUniqueIdentifier,
        blood_group: payload.bloodGroup,
        allergies: payload.allergies,
        chronic_conditions: payload.chronicConditions,
        current_medications: payload.currentMedications,
        surgical_history: payload.surgicalHistory,
        family_history: payload.familyHistory,
        social_history: payload.socialHistory,
        occupation: payload.occupation,
        employer_name: payload.employerName,
        nationality: payload.nationality,
        religion: payload.religion,
        tribe: payload.tribe,
        hometown: payload.hometown,
        region_of_origin: payload.regionOfOrigin,
        id_type: payload.idType,
        id_number: payload.idNumber,
        emergency_contact_name: payload.emergencyContactName,
        emergency_contact_phone: payload.emergencyContactPhone,
        emergency_contact_relationship: payload.emergencyContactRelationship,
        emergency_contact_address: payload.emergencyContactAddress,
      };
      // strip undefined/empty so COALESCE keeps existing values on update
      Object.keys(body).forEach((k) => {
        if (body[k] === undefined || body[k] === "") delete body[k];
      });
      const res = await api.post("/patients", body);
      const newPatientId = res.data.data?.id;
      // Only create an insurance record for non-NHIS providers (NHIS data is stored
      // directly on the patient record via nhis_number / nhis_expiry_date).
      // Also require the three NOT-NULL DB columns before attempting the insert to
      // avoid a DB error that would mask the successful patient creation.
      const isNhis = payload.insuranceProvider === "NHIS";
      const hasRequiredInsFields =
        !!payload.policyNumber &&
        !!payload.insuranceStartDate &&
        !!payload.insuranceEndDate;
      if (
        newPatientId &&
        payload.insuranceProvider &&
        !isNhis &&
        hasRequiredInsFields
      ) {
        const insBody: Record<string, unknown> = {
          provider: payload.insuranceProvider,
          policy_number: payload.policyNumber,
          type: payload.insuranceType,
          plan_name: payload.planName,
          start_date: payload.insuranceStartDate,
          expiry_date: payload.insuranceEndDate,
        };
        Object.keys(insBody).forEach((k) => {
          if (insBody[k] === undefined || insBody[k] === "") delete insBody[k];
        });
        await api.post(`/patients/${newPatientId}/insurance`, insBody);
      }
      return res;
    },
    onSuccess: (response) => {
      const p = response.data.data;
      const newPatient = mapApiPatient(p as Record<string, unknown>);
      toast.success("Patient registered successfully");
      qc.invalidateQueries({ queryKey: ["patients"] });
      qc.invalidateQueries({ queryKey: ["patient-vitals"] });
      qc.invalidateQueries({ queryKey: ["patient-visits"] });
      qc.invalidateQueries({ queryKey: ["patient-bills"] });
      qc.invalidateQueries({ queryKey: ["patient-prescriptions"] });
      qc.invalidateQueries({ queryKey: ["patient-labs"] });
      setAddOpen(false);
      addForm.reset();
      setViewPatient(newPatient);
    },
    onError: (err: unknown) => {
      type ApiErr = {
        response?: {
          data?: {
            error?: { message?: string; details?: { message: string }[] };
          };
        };
      };
      const errData = (err as ApiErr)?.response?.data?.error;
      const msg =
        errData?.details?.[0]?.message ??
        errData?.message ??
        "Failed to create patient";
      toast.error(msg);
    },
  });

  const addForm = useForm<Partial<Patient>>();

  const editForm = useForm<Partial<Patient>>();

  const vitalsForm = useForm<{
    height_cm?: string;
    weight_kg?: string;
    temperature_celsius?: string;
    systolic_bp?: string;
    diastolic_bp?: string;
    heart_rate?: string;
    respiratory_rate?: string;
    oxygen_saturation?: string;
    blood_glucose?: string;
    pain_scale?: string;
    notes?: string;
  }>();

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: Partial<Patient>;
    }) => {
      const body: Record<string, unknown> = {
        title: payload.title,
        first_name: payload.firstName,
        middle_name: payload.middleName,
        last_name: payload.lastName,
        date_of_birth: payload.dateOfBirth,
        gender: payload.gender,
        marital_status: payload.maritalStatus,
        genotype: payload.genotype,
        phone_number: payload.phone,
        alternate_phone: payload.alternatePhone,
        email: payload.email,
        address_line1: payload.addressLine1,
        address_line2: payload.addressLine2,
        city: payload.city,
        district: payload.district,
        region: payload.region,
        postal_code: payload.postalCode,
        digital_address: payload.digitalAddress,
        nhis_number: payload.nhisNumber,
        nhis_expiry_date: payload.nhisExpiryDate,
        ghs_unique_identifier: payload.ghsUniqueIdentifier,
        blood_group: payload.bloodGroup,
        allergies: payload.allergies,
        chronic_conditions: payload.chronicConditions,
        current_medications: payload.currentMedications,
        surgical_history: payload.surgicalHistory,
        family_history: payload.familyHistory,
        social_history: payload.socialHistory,
        occupation: payload.occupation,
        employer_name: payload.employerName,
        nationality: payload.nationality,
        religion: payload.religion,
        tribe: payload.tribe,
        hometown: payload.hometown,
        region_of_origin: payload.regionOfOrigin,
        id_type: payload.idType,
        id_number: payload.idNumber,
        emergency_contact_name: payload.emergencyContactName,
        emergency_contact_phone: payload.emergencyContactPhone,
        emergency_contact_relationship: payload.emergencyContactRelationship,
        emergency_contact_address: payload.emergencyContactAddress,
      };
      Object.keys(body).forEach((k) => {
        if (body[k] === undefined || body[k] === "") delete body[k];
      });
      return api.put(`/patients/${id}`, body);
    },
    onSuccess: (res) => {
      const p = res.data.data ?? res.data;
      const updated = mapApiPatient(p as Record<string, unknown>);
      toast.success("Patient updated");
      qc.invalidateQueries({ queryKey: ["patients"] });
      qc.invalidateQueries({ queryKey: ["patient-vitals"] });
      qc.invalidateQueries({ queryKey: ["patient-visits"] });
      qc.invalidateQueries({ queryKey: ["patient-bills"] });
      qc.invalidateQueries({ queryKey: ["patient-prescriptions"] });
      qc.invalidateQueries({ queryKey: ["patient-labs"] });
      setViewPatient(updated);
      setEditOpen(false);
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })
          ?.response?.data?.error?.message ?? "Update failed";
      toast.error(msg);
    },
  });

  const addVitalsMutation = useMutation({
    mutationFn: (vitals: Record<string, number | undefined>) =>
      api.post(`/patients/${viewPatient!.id}/vitals`, vitals),
    onSuccess: () => {
      toast.success("Vitals recorded");
      qc.invalidateQueries({ queryKey: ["patient-vitals", viewPatient?.id] });
      setAddVitalsOpen(false);
      vitalsForm.reset();
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })
          ?.response?.data?.error?.message ?? "Failed to record vitals";
      toast.error(msg);
    },
  });

  const openEdit = (patient: Patient) => {
    editForm.reset({
      title: patient.title,
      firstName: patient.firstName,
      middleName: patient.middleName,
      lastName: patient.lastName,
      dateOfBirth: patient.dateOfBirth,
      gender: patient.gender,
      maritalStatus: patient.maritalStatus,
      genotype: patient.genotype,
      phone: patient.phone,
      alternatePhone: patient.alternatePhone,
      email: patient.email,
      addressLine1: patient.addressLine1,
      addressLine2: patient.addressLine2,
      city: patient.city,
      district: patient.district,
      region: patient.region,
      postalCode: patient.postalCode,
      digitalAddress: patient.digitalAddress,
      nhisNumber: patient.nhisNumber,
      nhisExpiryDate: patient.nhisExpiryDate,
      ghsUniqueIdentifier: patient.ghsUniqueIdentifier,
      bloodGroup: patient.bloodGroup,
      allergies: patient.allergies,
      chronicConditions: patient.chronicConditions,
      currentMedications: patient.currentMedications,
      surgicalHistory: patient.surgicalHistory,
      familyHistory: patient.familyHistory,
      socialHistory: patient.socialHistory,
      occupation: patient.occupation,
      employerName: patient.employerName,
      nationality: patient.nationality,
      religion: patient.religion,
      tribe: patient.tribe,
      hometown: patient.hometown,
      regionOfOrigin: patient.regionOfOrigin,
      idType: patient.idType,
      idNumber: patient.idNumber,
      emergencyContactName: patient.emergencyContactName,
      emergencyContactPhone: patient.emergencyContactPhone,
      emergencyContactRelationship: patient.emergencyContactRelationship,
      emergencyContactAddress: patient.emergencyContactAddress,
    });
    setEditOpen(true);
  };

  const handleExport = () => {
    api
      .get("/patients/export", { responseType: "blob" })
      .then((r) => {
        const url = URL.createObjectURL(r.data as Blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `patients_${new Date().toISOString().split("T")[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch(() => toast.error("Export failed"));
  };

  const columns = useMemo(() => [
    {
      key: "patientNumber",
      header: "Patient No.",
      render: (r: Patient) => (
        <span className="font-mono text-xs text-gray-600">
          {r.patientNumber}
        </span>
      ),
    },
    {
      key: "name",
      header: "Name",
      render: (r: Patient) => `${r.firstName} ${r.lastName}`,
    },
    { key: "gender", header: "Gender", render: (r: Patient) => r.gender },
    {
      key: "age",
      header: "Age",
      render: (r: Patient) => calcAge(r.dateOfBirth),
    },
    { key: "phone", header: "Phone", render: (r: Patient) => r.phone ?? "—" },
    {
      key: "nhisNumber",
      header: "NHIS",
      render: (r: Patient) =>
        r.nhisNumber ? (
          <span className="font-mono text-xs">{r.nhisNumber}</span>
        ) : (
          "—"
        ),
    },
    {
      key: "createdAt",
      header: "Registered",
      render: (r: Patient) => formatDate(r.createdAt),
    },
    {
      key: "actions",
      header: "",
      render: (r: Patient) => (
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              setViewPatient(r);
              setDetailTab("info");
            }}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
          >
            <Eye className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              setViewPatient(r);
              openEdit(r);
            }}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
          >
            <Pencil className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ], []);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Patients"
        subtitle={`${pagination?.total ?? 0} total patients`}
        actions={
          <>
            <Button
              variant="secondary"
              leftIcon={<Download className="w-4 h-4" />}
              size="sm"
              onClick={handleExport}
            >
              Export
            </Button>
            <Button
              leftIcon={<Plus className="w-4 h-4" />}
              onClick={() => setAddOpen(true)}
              size="sm"
            >
              New Patient
            </Button>
          </>
        }
      />

      {/* Search bar */}
      <div className="card p-3 flex items-center gap-3">
        <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Search by name, phone, patient number, NHIS…"
          className="flex-1 text-sm outline-none bg-transparent placeholder-gray-400"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={patients}
        keyField="id"
        isLoading={isLoading}
        emptyMessage="No patients found"
      />

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">
            Page {pagination.page} of {pagination.totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={page === pagination.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Add Patient Modal */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Register New Patient"
        size="xl"
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setAddOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={addForm.handleSubmit((d) => createMutation.mutate(d))}
              isLoading={createMutation.isPending}
            >
              Register Patient
            </Button>
          </>
        }
      >
        <form
          className="grid grid-cols-1 sm:grid-cols-2 gap-3"
          onSubmit={(e) => e.preventDefault()}
        >
          <PatientFormFields form={addForm} />
        </form>
      </Modal>

      {/* View Patient Modal */}
      {viewPatient && (
        <Modal
          open={!!viewPatient}
          onClose={() => setViewPatient(null)}
          title="Patient Details"
          size="lg"
          footer={
            <div className="flex items-center justify-between w-full">
              <Button
                variant="secondary"
                leftIcon={<CalendarPlus className="w-4 h-4" />}
                onClick={() => setBookApptOpen(true)}
              >
                Book Appointment
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  leftIcon={<Pencil className="w-4 h-4" />}
                  onClick={() => openEdit(viewPatient)}
                >
                  Edit
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setViewPatient(null)}
                >
                  Close
                </Button>
              </div>
            </div>
          }
        >
          {/* Patient Header */}
          <div className="flex items-center gap-4 mb-4">
            <div className="w-14 h-14 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 text-xl font-bold flex-shrink-0">
              {viewPatient.firstName[0]}
              {viewPatient.lastName[0]}
            </div>
            <div>
              <h2 className="text-lg font-semibold">
                {viewPatient.firstName} {viewPatient.lastName}
              </h2>
              <div className="flex items-center gap-3 text-sm text-gray-500">
                <span className="flex items-center gap-1">
                  <Hash className="w-3 h-3" />
                  {viewPatient.patientNumber}
                </span>
                {viewPatient.phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="w-3 h-3" />
                    {viewPatient.phone}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="border-b border-gray-200 mb-4">
            <div className="flex gap-1 overflow-x-auto">
              {DETAIL_TABS.map(({ key, label, Icon }) => (
                <button
                  key={key}
                  onClick={() => setDetailTab(key)}
                  className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                    detailTab === key
                      ? "border-primary-600 text-primary-600"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Tab Content */}
          {detailTab === "info" && (
            <div className="space-y-5 text-sm">
              {/* Personal */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-primary-600 border-b border-primary-100 pb-1 mb-3">
                  Personal
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {viewPatient.title && (
                    <Info label="Title" value={viewPatient.title} />
                  )}
                  <Info label="Gender" value={viewPatient.gender} />
                  <Info
                    label="Date of Birth"
                    value={formatDate(viewPatient.dateOfBirth)}
                  />
                  <Info
                    label="Age"
                    value={`${calcAge(viewPatient.dateOfBirth)} years`}
                  />
                  <Info
                    label="Marital Status"
                    value={viewPatient.maritalStatus ?? "—"}
                  />
                  <Info label="Genotype" value={viewPatient.genotype ?? "—"} />
                  <Info
                    label="Blood Group"
                    value={viewPatient.bloodGroup ?? "—"}
                  />
                  <Info
                    label="Nationality"
                    value={viewPatient.nationality ?? "—"}
                  />
                  {viewPatient.religion && (
                    <Info label="Religion" value={viewPatient.religion} />
                  )}
                  {viewPatient.tribe && (
                    <Info label="Tribe / Ethnicity" value={viewPatient.tribe} />
                  )}
                  {viewPatient.hometown && (
                    <Info label="Hometown" value={viewPatient.hometown} />
                  )}
                  {viewPatient.regionOfOrigin && (
                    <Info
                      label="Region of Origin"
                      value={viewPatient.regionOfOrigin}
                    />
                  )}
                </div>
              </div>
              {/* Contact */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-primary-600 border-b border-primary-100 pb-1 mb-3">
                  Contact
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <Info label="Phone" value={viewPatient.phone ?? "—"} />
                  <Info
                    label="Alternate Phone"
                    value={viewPatient.alternatePhone ?? "—"}
                  />
                  <Info
                    label="Email"
                    value={viewPatient.email ?? "—"}
                    className="col-span-2"
                  />
                </div>
              </div>
              {/* Address */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-primary-600 border-b border-primary-100 pb-1 mb-3">
                  Address
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {viewPatient.addressLine1 && (
                    <Info
                      label="Address Line 1"
                      value={viewPatient.addressLine1}
                      className="col-span-2"
                    />
                  )}
                  {viewPatient.addressLine2 && (
                    <Info
                      label="Address Line 2"
                      value={viewPatient.addressLine2}
                      className="col-span-2"
                    />
                  )}
                  <Info label="City" value={viewPatient.city ?? "—"} />
                  <Info label="District" value={viewPatient.district ?? "—"} />
                  <Info label="Region" value={viewPatient.region ?? "—"} />
                  <Info
                    label="Postal Code"
                    value={viewPatient.postalCode ?? "—"}
                  />
                  {viewPatient.digitalAddress && (
                    <Info
                      label="Digital Address (GPS)"
                      value={viewPatient.digitalAddress}
                      className="col-span-2"
                    />
                  )}
                </div>
              </div>
              {/* Identity & Insurance */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-primary-600 border-b border-primary-100 pb-1 mb-3">
                  Identity & Insurance
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <Info label="ID Type" value={viewPatient.idType ?? "—"} />
                  <Info label="ID Number" value={viewPatient.idNumber ?? "—"} />
                  <Info
                    label="NHIS Number"
                    value={viewPatient.nhisNumber ?? "—"}
                  />
                  <Info
                    label="NHIS Expiry"
                    value={
                      viewPatient.nhisExpiryDate
                        ? formatDate(viewPatient.nhisExpiryDate)
                        : "—"
                    }
                  />
                  {viewPatient.ghsUniqueIdentifier && (
                    <Info
                      label="GHS Unique ID"
                      value={viewPatient.ghsUniqueIdentifier}
                      className="col-span-2"
                    />
                  )}
                </div>
              </div>
              {/* Employment */}
              {(viewPatient.occupation || viewPatient.employerName) && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-primary-600 border-b border-primary-100 pb-1 mb-3">
                    Employment
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <Info
                      label="Occupation"
                      value={viewPatient.occupation ?? "—"}
                    />
                    <Info
                      label="Employer"
                      value={viewPatient.employerName ?? "—"}
                    />
                  </div>
                </div>
              )}
              {/* Emergency Contact */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-primary-600 border-b border-primary-100 pb-1 mb-3">
                  Emergency Contact
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <Info
                    label="Name"
                    value={viewPatient.emergencyContactName ?? "—"}
                  />
                  <Info
                    label="Phone"
                    value={viewPatient.emergencyContactPhone ?? "—"}
                  />
                  <Info
                    label="Relationship"
                    value={viewPatient.emergencyContactRelationship ?? "—"}
                  />
                  {viewPatient.emergencyContactAddress && (
                    <Info
                      label="Address"
                      value={viewPatient.emergencyContactAddress}
                      className="col-span-2"
                    />
                  )}
                </div>
              </div>
              {/* Medical Background */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-primary-600 border-b border-primary-100 pb-1 mb-3">
                  Medical Background
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <Info
                    label="Allergies"
                    value={viewPatient.allergies ?? "None known"}
                    className="col-span-2"
                  />
                  {viewPatient.chronicConditions && (
                    <Info
                      label="Chronic Conditions"
                      value={viewPatient.chronicConditions}
                      className="col-span-2"
                    />
                  )}
                  {viewPatient.currentMedications && (
                    <Info
                      label="Current Medications"
                      value={viewPatient.currentMedications}
                      className="col-span-2"
                    />
                  )}
                  {viewPatient.surgicalHistory && (
                    <Info
                      label="Surgical History"
                      value={viewPatient.surgicalHistory}
                      className="col-span-2"
                    />
                  )}
                  {viewPatient.familyHistory && (
                    <Info
                      label="Family History"
                      value={viewPatient.familyHistory}
                      className="col-span-2"
                    />
                  )}
                  {viewPatient.socialHistory && (
                    <Info
                      label="Social History"
                      value={viewPatient.socialHistory}
                      className="col-span-2"
                    />
                  )}
                </div>
              </div>
              <p className="text-xs text-gray-400">
                Registered: {formatDate(viewPatient.createdAt)}
              </p>
            </div>
          )}

          {detailTab === "vitals" && (
            <div className="space-y-3">
              <div className="flex justify-end">
                <Button
                  size="sm"
                  leftIcon={<Plus className="w-3.5 h-3.5" />}
                  onClick={() => setAddVitalsOpen(true)}
                >
                  Record Vitals
                </Button>
              </div>
              {vitalsLoading && (
                <p className="text-sm text-gray-500">Loading vitals…</p>
              )}
              {!vitalsLoading && (vitalsData ?? []).length === 0 && (
                <p className="text-sm text-gray-400 text-center py-6">
                  No vitals recorded yet
                </p>
              )}
              {groupByDate(
                vitalsData ?? [],
                (v) =>
                  (v.recorded_at as string) ?? (v.createdAt as string) ?? null,
              ).map(({ dateKey, label, items }) => {
                const gKey = `vitals:${dateKey}`;
                const isCollapsed = collapsedGroups.has(gKey);
                return (
                  <div
                    key={dateKey}
                    className="border border-gray-100 rounded-xl overflow-hidden"
                  >
                    <button
                      onClick={() => toggleGroup(gKey)}
                      className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 text-sm font-medium text-gray-700 transition-colors"
                    >
                      <span>
                        {label}{" "}
                        <span className="text-gray-400 font-normal">
                          · {items.length}{" "}
                          {items.length === 1 ? "reading" : "readings"}
                        </span>
                      </span>
                      <ChevronDown
                        className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isCollapsed ? "-rotate-90" : ""}`}
                      />
                    </button>
                    {isCollapsed ? null : (
                      <div className="p-2 space-y-2">
                        {items.map((v) => (
                          <div
                            key={String(v.id ?? v.recorded_at)}
                            className="bg-white rounded-lg border border-gray-100 p-3 text-sm grid grid-cols-3 gap-2"
                          >
                            {v.height_cm != null && (
                              <Info
                                label="Height"
                                value={`${v.height_cm as number} cm`}
                              />
                            )}
                            {v.weight_kg != null && (
                              <Info
                                label="Weight"
                                value={`${v.weight_kg as number} kg`}
                              />
                            )}
                            {v.bmi != null && (
                              <Info label="BMI" value={`${v.bmi as number}`} />
                            )}
                            {v.temperature_celsius != null && (
                              <Info
                                label="Temp"
                                value={`${v.temperature_celsius as number} °C`}
                              />
                            )}
                            {(v.systolic_bp != null ||
                              v.diastolic_bp != null) && (
                              <Info
                                label="BP"
                                value={`${(v.systolic_bp as number) ?? "—"}/${(v.diastolic_bp as number) ?? "—"} mmHg`}
                              />
                            )}
                            {v.heart_rate != null && (
                              <Info
                                label="HR"
                                value={`${v.heart_rate as number} bpm`}
                              />
                            )}
                            {v.respiratory_rate != null && (
                              <Info
                                label="Resp. Rate"
                                value={`${v.respiratory_rate as number} /min`}
                              />
                            )}
                            {v.oxygen_saturation != null && (
                              <Info
                                label="SpO₂"
                                value={`${v.oxygen_saturation as number}%`}
                              />
                            )}
                            {v.blood_glucose != null && (
                              <Info
                                label="Glucose"
                                value={`${v.blood_glucose as number} mmol/L`}
                              />
                            )}
                            {v.pain_scale != null && (
                              <Info
                                label="Pain"
                                value={`${v.pain_scale as number}/10`}
                              />
                            )}
                            {typeof v.notes === "string" && v.notes && (
                              <Info
                                label="Notes"
                                value={v.notes}
                                className="col-span-3"
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {detailTab === "visits" && (
            <div className="space-y-3">
              {visitsLoading && (
                <p className="text-sm text-gray-500">Loading visits…</p>
              )}
              {!visitsLoading && (visitsData ?? []).length === 0 && (
                <p className="text-sm text-gray-400 text-center py-6">
                  No visits found
                </p>
              )}
              {groupByDate(
                visitsData ?? [],
                (v) =>
                  ((v.visit_date ??
                    v.check_in_time ??
                    v.created_at) as string) ?? null,
              ).map(({ dateKey, label, items }) => {
                const gKey = `visits:${dateKey}`;
                const isCollapsed = collapsedGroups.has(gKey);
                return (
                  <div
                    key={dateKey}
                    className="border border-gray-100 rounded-xl overflow-hidden"
                  >
                    <button
                      onClick={() => toggleGroup(gKey)}
                      className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 text-sm font-medium text-gray-700 transition-colors"
                    >
                      <span>
                        {label}{" "}
                        <span className="text-gray-400 font-normal">
                          · {items.length}{" "}
                          {items.length === 1 ? "visit" : "visits"}
                        </span>
                      </span>
                      <ChevronDown
                        className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isCollapsed ? "-rotate-90" : ""}`}
                      />
                    </button>
                    {isCollapsed ? null : (
                      <div className="p-2 space-y-2">
                        {items.map((v) => {
                          type Dept = {
                            id: string;
                            name: string;
                            code: string;
                          };
                          type Dx = {
                            id: string;
                            code: string;
                            name: string;
                            type: string;
                          };
                          const dept = v.department as Dept | null;
                          const diagnoses = (v.diagnoses ?? []) as Dx[];
                          const status = (v.visit_status ?? v.status) as string;
                          let statusCls = "bg-gray-100 text-gray-600";
                          if (status === "Completed" || status === "Discharged")
                            statusCls = "bg-green-100 text-green-700";
                          else if (status === "Active")
                            statusCls = "bg-blue-100 text-blue-700";
                          else if (status === "In Progress")
                            statusCls = "bg-indigo-100 text-indigo-700";
                          return (
                            <div
                              key={String(v.id)}
                              className="bg-white rounded-lg border border-gray-100 p-3 text-sm"
                            >
                              <div className="flex items-start justify-between gap-2 mb-1">
                                <div>
                                  <span className="font-semibold text-gray-800">
                                    {(v.visit_type ?? "Visit") as string}
                                  </span>
                                  {dept && (
                                    <span className="ml-2 text-xs bg-primary-50 text-primary-700 px-2 py-0.5 rounded-full font-medium">
                                      {dept.name}
                                    </span>
                                  )}
                                </div>
                                <span
                                  className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${statusCls}`}
                                >
                                  {status}
                                </span>
                              </div>
                              {typeof v.chief_complaint === "string" &&
                                v.chief_complaint && (
                                  <p className="text-xs text-gray-600 mb-1">
                                    <span className="font-medium">
                                      Complaint:
                                    </span>{" "}
                                    {v.chief_complaint}
                                  </p>
                                )}
                              {diagnoses.length > 0 && (
                                <div className="mt-1.5">
                                  <p className="text-xs font-medium text-gray-500 mb-1">
                                    Diagnoses
                                  </p>
                                  <div className="flex flex-wrap gap-1">
                                    {diagnoses.map((dx) => (
                                      <span
                                        key={dx.id}
                                        className="text-xs bg-gray-50 border border-gray-200 rounded-md px-2 py-0.5 text-gray-700"
                                      >
                                        {dx.code && (
                                          <span className="font-mono text-gray-400 mr-1">
                                            {dx.code}
                                          </span>
                                        )}
                                        {dx.name}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {detailTab === "bills" && (
            <div className="space-y-3">
              {billsLoading && (
                <p className="text-sm text-gray-500">Loading bills…</p>
              )}
              {!billsLoading && (billsData ?? []).length === 0 && (
                <p className="text-sm text-gray-400 text-center py-6">
                  No invoices found
                </p>
              )}
              {groupByDate(
                billsData ?? [],
                (inv) =>
                  ((inv.invoice_date ?? inv.created_at) as string) ?? null,
              ).map(({ dateKey, label, items }) => {
                const gKey = `bills:${dateKey}`;
                const isCollapsed = collapsedGroups.has(gKey);
                return (
                  <div
                    key={dateKey}
                    className="border border-gray-100 rounded-xl overflow-hidden"
                  >
                    <button
                      onClick={() => toggleGroup(gKey)}
                      className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 text-sm font-medium text-gray-700 transition-colors"
                    >
                      <span>
                        {label}{" "}
                        <span className="text-gray-400 font-normal">
                          · {items.length}{" "}
                          {items.length === 1 ? "invoice" : "invoices"}
                        </span>
                      </span>
                      <ChevronDown
                        className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isCollapsed ? "-rotate-90" : ""}`}
                      />
                    </button>
                    {isCollapsed ? null : (
                      <div className="p-2 space-y-2">
                        {items.map((inv) => {
                          let billCls = "text-red-500";
                          if (inv.payment_status === "Paid")
                            billCls = "text-green-600";
                          else if (inv.payment_status === "Partial")
                            billCls = "text-amber-600";
                          return (
                            <div
                              key={String(inv.id)}
                              className="bg-white rounded-lg border border-gray-100 p-3 text-sm flex items-center justify-between"
                            >
                              <div>
                                <p className="font-medium font-mono text-xs text-gray-600">
                                  {inv.invoice_number as string}
                                </p>
                                <p className="text-xs text-gray-400">
                                  {(inv.payment_status ?? "Unpaid") as string}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="font-semibold">
                                  GHS {Number(inv.total_amount ?? 0).toFixed(2)}
                                </p>
                                <span
                                  className={`text-xs font-medium ${billCls}`}
                                >
                                  {inv.payment_status as string}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {detailTab === "prescriptions" && (
            <div className="space-y-3">
              {prescriptionsLoading && (
                <p className="text-sm text-gray-500">Loading prescriptions…</p>
              )}
              {!prescriptionsLoading &&
                (prescriptionsData ?? []).length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-6">
                    No prescriptions found
                  </p>
                )}
              {groupByDate(
                prescriptionsData ?? [],
                (rx) =>
                  ((rx.prescription_date ?? rx.created_at) as string) ?? null,
              ).map(({ dateKey, label, items }) => {
                const gKey = `rx:${dateKey}`;
                const isCollapsed = collapsedGroups.has(gKey);
                return (
                  <div
                    key={dateKey}
                    className="border border-gray-100 rounded-xl overflow-hidden"
                  >
                    <button
                      onClick={() => toggleGroup(gKey)}
                      className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 text-sm font-medium text-gray-700 transition-colors"
                    >
                      <span>
                        {label}{" "}
                        <span className="text-gray-400 font-normal">
                          · {items.length}{" "}
                          {items.length === 1
                            ? "prescription"
                            : "prescriptions"}
                        </span>
                      </span>
                      <ChevronDown
                        className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isCollapsed ? "-rotate-90" : ""}`}
                      />
                    </button>
                    {isCollapsed ? null : (
                      <div className="p-2 space-y-2">
                        {items.map((rx) => {
                          type RxItem = {
                            id: string;
                            medication_name: string;
                            dosage: string;
                            frequency: string;
                            quantity: number;
                          };
                          const rxItems = (rx.items ?? []) as RxItem[];
                          const rxStatus = rx.status as string;
                          let statusCls = "bg-amber-100 text-amber-700";
                          if (rxStatus === "Dispensed")
                            statusCls = "bg-green-100 text-green-700";
                          else if (rxStatus === "Cancelled")
                            statusCls = "bg-red-100 text-red-600";
                          return (
                            <div
                              key={String(rx.id)}
                              className="bg-white rounded-lg border border-gray-100 p-3 text-sm"
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-mono text-xs text-gray-500">
                                  {(rx.prescription_number ?? "Rx") as string}
                                </span>
                                <span
                                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusCls}`}
                                >
                                  {rxStatus}
                                </span>
                              </div>
                              {(
                                rx.prescribed_by_user as {
                                  name?: string;
                                } | null
                              )?.name && (
                                <p className="text-xs text-gray-400 mb-1.5">
                                  By:{" "}
                                  {
                                    (rx.prescribed_by_user as { name: string })
                                      .name
                                  }
                                </p>
                              )}
                              {rxItems.length > 0 ? (
                                <div className="space-y-1.5">
                                  {rxItems.map((item) => (
                                    <div
                                      key={item.id}
                                      className="bg-gray-50 rounded-md px-2.5 py-1.5"
                                    >
                                      <p className="font-medium text-gray-800 text-xs">
                                        {item.medication_name}
                                      </p>
                                      <p className="text-xs text-gray-500">
                                        {[
                                          item.dosage,
                                          item.frequency,
                                          item.quantity
                                            ? `Qty: ${item.quantity}`
                                            : null,
                                        ]
                                          .filter(Boolean)
                                          .join(" · ")}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-xs text-gray-400 italic">
                                  No items
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {detailTab === "labs" && (
            <div className="space-y-3">
              {labsLoading && (
                <p className="text-sm text-gray-500">Loading lab orders…</p>
              )}
              {!labsLoading && (labsData ?? []).length === 0 && (
                <p className="text-sm text-gray-400 text-center py-6">
                  No lab orders found
                </p>
              )}
              {groupByDate(
                labsData ?? [],
                (ord) => ((ord.order_date ?? ord.created_at) as string) ?? null,
              ).map(({ dateKey, label, items }) => {
                const gKey = `labs:${dateKey}`;
                const isCollapsed = collapsedGroups.has(gKey);
                return (
                  <div
                    key={dateKey}
                    className="border border-gray-100 rounded-xl overflow-hidden"
                  >
                    <button
                      onClick={() => toggleGroup(gKey)}
                      className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 text-sm font-medium text-gray-700 transition-colors"
                    >
                      <span>
                        {label}{" "}
                        <span className="text-gray-400 font-normal">
                          · {items.length}{" "}
                          {items.length === 1 ? "order" : "orders"}
                        </span>
                      </span>
                      <ChevronDown
                        className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isCollapsed ? "-rotate-90" : ""}`}
                      />
                    </button>
                    {isCollapsed ? null : (
                      <div className="p-2 space-y-2">
                        {items.map((ord) => {
                          type LabItem = {
                            id: string;
                            test_name: string;
                            result_value: string | null;
                            status: string;
                          };
                          const labItems = (ord.items ?? []) as LabItem[];
                          const ordStatus = ord.status as string;
                          let ordCls = "bg-gray-100 text-gray-600";
                          if (ordStatus === "Completed")
                            ordCls = "bg-green-100 text-green-700";
                          else if (
                            ordStatus === "In Progress" ||
                            ordStatus === "Processing"
                          )
                            ordCls = "bg-blue-100 text-blue-700";
                          else if (ordStatus === "Pending")
                            ordCls = "bg-amber-100 text-amber-700";
                          return (
                            <div
                              key={String(ord.id)}
                              className="bg-white rounded-lg border border-gray-100 p-3 text-sm"
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-mono text-xs text-gray-500">
                                  {(ord.order_number ?? "Lab Order") as string}
                                </span>
                                <span
                                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${ordCls}`}
                                >
                                  {ordStatus}
                                </span>
                              </div>
                              {(ord.ordered_by_user as { name?: string } | null)
                                ?.name && (
                                <p className="text-xs text-gray-400 mb-1.5">
                                  By:{" "}
                                  {
                                    (ord.ordered_by_user as { name: string })
                                      .name
                                  }
                                </p>
                              )}
                              {labItems.length > 0 ? (
                                <div className="space-y-1.5">
                                  {labItems.map((item) => {
                                    let itemCls = "text-gray-400";
                                    if (item.status === "Completed")
                                      itemCls = "text-green-600";
                                    else if (item.status === "In Progress")
                                      itemCls = "text-blue-600";
                                    return (
                                      <div
                                        key={item.id}
                                        className="bg-gray-50 rounded-md px-2.5 py-1.5 flex items-center justify-between gap-2"
                                      >
                                        <div>
                                          <p className="font-medium text-gray-800 text-xs">
                                            {item.test_name}
                                          </p>
                                          {item.result_value && (
                                            <p className="text-xs text-gray-500">
                                              Result: {item.result_value}
                                            </p>
                                          )}
                                        </div>
                                        <span
                                          className={`text-xs font-medium shrink-0 ${itemCls}`}
                                        >
                                          {item.status}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <p className="text-xs text-gray-400 italic">
                                  No tests
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Modal>
      )}

      {/* Book Appointment Modal (pre-filled with selected patient) */}
      {viewPatient && (
        <Modal
          open={bookApptOpen}
          onClose={() => setBookApptOpen(false)}
          title={`Book Appointment — ${viewPatient.firstName} ${viewPatient.lastName}`}
          size="lg"
        >
          <AppointmentForm
            initial={{
              patientId: viewPatient.id,
              patientLabel: `${viewPatient.firstName} ${viewPatient.lastName} (${viewPatient.patientNumber})`,
            }}
            onSuccess={() => {
              setBookApptOpen(false);
              setViewPatient(null);
            }}
            onCancel={() => setBookApptOpen(false)}
          />
        </Modal>
      )}

      {/* Edit Patient Modal */}
      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit Patient"
        size="xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={editForm.handleSubmit((d) => {
                if (viewPatient)
                  updateMutation.mutate({
                    id: String(viewPatient.id),
                    payload: d,
                  });
              })}
              isLoading={updateMutation.isPending}
            >
              Save Changes
            </Button>
          </>
        }
      >
        <form className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <PatientFormFields form={editForm} />
        </form>
      </Modal>

      {/* Add Vitals Modal */}
      {viewPatient && (
        <Modal
          open={addVitalsOpen}
          onClose={() => setAddVitalsOpen(false)}
          title={`Record Vitals — ${viewPatient.firstName} ${viewPatient.lastName}`}
          footer={
            <>
              <Button
                variant="secondary"
                onClick={() => setAddVitalsOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={vitalsForm.handleSubmit((d) => {
                  const payload: Record<string, number | undefined> = {};
                  if (d.height_cm)
                    payload.height_cm = Number.parseFloat(d.height_cm);
                  if (d.weight_kg)
                    payload.weight_kg = Number.parseFloat(d.weight_kg);
                  if (d.temperature_celsius)
                    payload.temperature_celsius = Number.parseFloat(
                      d.temperature_celsius,
                    );
                  if (d.systolic_bp)
                    payload.systolic_bp = Number.parseInt(d.systolic_bp, 10);
                  if (d.diastolic_bp)
                    payload.diastolic_bp = Number.parseInt(d.diastolic_bp, 10);
                  if (d.heart_rate)
                    payload.heart_rate = Number.parseInt(d.heart_rate, 10);
                  if (d.respiratory_rate)
                    payload.respiratory_rate = Number.parseInt(
                      d.respiratory_rate,
                      10,
                    );
                  if (d.oxygen_saturation)
                    payload.oxygen_saturation = Number.parseFloat(
                      d.oxygen_saturation,
                    );
                  if (d.blood_glucose)
                    payload.blood_glucose = Number.parseFloat(d.blood_glucose);
                  if (d.pain_scale)
                    payload.pain_scale = Number.parseInt(d.pain_scale, 10);
                  if (d.height_cm && d.weight_kg) {
                    const h = Number.parseFloat(d.height_cm) / 100;
                    payload.bmi =
                      Math.round(
                        (Number.parseFloat(d.weight_kg) / (h * h)) * 100,
                      ) / 100;
                  }
                  const notes = d.notes?.trim();
                  addVitalsMutation.mutate(
                    notes
                      ? ({ ...payload, notes } as unknown as Record<
                          string,
                          number | undefined
                        >)
                      : payload,
                  );
                })}
                isLoading={addVitalsMutation.isPending}
              >
                Save Vitals
              </Button>
            </>
          }
        >
          <form className="grid grid-cols-2 gap-4">
            <FormField label="Height (cm)">
              <Input
                type="number"
                step="0.1"
                {...vitalsForm.register("height_cm")}
                placeholder="e.g. 170"
              />
            </FormField>
            <FormField label="Weight (kg)">
              <Input
                type="number"
                step="0.1"
                {...vitalsForm.register("weight_kg")}
                placeholder="e.g. 70"
              />
            </FormField>
            <FormField label="Temperature (°C)">
              <Input
                type="number"
                step="0.1"
                {...vitalsForm.register("temperature_celsius")}
                placeholder="e.g. 36.6"
              />
            </FormField>
            <FormField label="Heart Rate (bpm)">
              <Input
                type="number"
                {...vitalsForm.register("heart_rate")}
                placeholder="e.g. 72"
              />
            </FormField>
            <FormField label="Systolic BP (mmHg)">
              <Input
                type="number"
                {...vitalsForm.register("systolic_bp")}
                placeholder="e.g. 120"
              />
            </FormField>
            <FormField label="Diastolic BP (mmHg)">
              <Input
                type="number"
                {...vitalsForm.register("diastolic_bp")}
                placeholder="e.g. 80"
              />
            </FormField>
            <FormField label="Respiratory Rate (breaths/min)">
              <Input
                type="number"
                {...vitalsForm.register("respiratory_rate")}
                placeholder="e.g. 16"
              />
            </FormField>
            <FormField label="O₂ Saturation (%)">
              <Input
                type="number"
                step="0.1"
                {...vitalsForm.register("oxygen_saturation")}
                placeholder="e.g. 98"
              />
            </FormField>
            <FormField label="Blood Glucose (mmol/L)">
              <Input
                type="number"
                step="0.1"
                {...vitalsForm.register("blood_glucose")}
                placeholder="e.g. 5.4"
              />
            </FormField>
            <FormField label="Pain Scale (0–10)">
              <Input
                type="number"
                min={0}
                max={10}
                {...vitalsForm.register("pain_scale")}
                placeholder="0–10"
              />
            </FormField>
            <FormField label="Notes" className="col-span-2">
              <Input
                {...vitalsForm.register("notes")}
                placeholder="Additional observations…"
              />
            </FormField>
          </form>
        </Modal>
      )}
    </div>
  );
}

function Info({
  label,
  value,
  className,
}: Readonly<{ label: string; value: string; className?: string }>) {
  return (
    <div className={className}>
      <p className="text-xs text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="font-medium text-gray-800 mt-0.5">{value}</p>
    </div>
  );
}

// ─── Shared patient API → Patient mapper ────────────────────────────────────
function mapApiPatient(p: Record<string, unknown>): Patient {
  return {
    id: p.id as string,
    patientNumber: (p.patient_number ?? p.patientNumber) as string,
    title: p.title as string | undefined,
    firstName: (p.first_name ?? p.firstName) as string,
    middleName: (p.middle_name ?? p.middleName) as string | undefined,
    lastName: (p.last_name ?? p.lastName) as string,
    dateOfBirth: (p.date_of_birth ?? p.dateOfBirth) as string,
    gender: p.gender as "Male" | "Female" | "Other",
    maritalStatus: (p.marital_status ?? p.maritalStatus) as string | undefined,
    genotype: p.genotype as string | undefined,
    phone: (p.phone_number ?? p.phone) as string | undefined,
    alternatePhone: (p.alternate_phone ?? p.alternatePhone) as
      string | undefined,
    email: p.email as string | undefined,
    addressLine1: (p.address_line1 ?? p.addressLine1) as string | undefined,
    addressLine2: (p.address_line2 ?? p.addressLine2) as string | undefined,
    address: (p.address_line1 ?? p.address) as string | undefined,
    city: p.city as string | undefined,
    district: p.district as string | undefined,
    region: p.region as string | undefined,
    postalCode: (p.postal_code ?? p.postalCode) as string | undefined,
    digitalAddress: (p.digital_address ?? p.digitalAddress) as
      string | undefined,
    nhisNumber: (p.nhis_number ?? p.nhisNumber) as string | undefined,
    nhisExpiryDate: (p.nhis_expiry_date ?? p.nhisExpiryDate) as
      string | undefined,
    ghsUniqueIdentifier: (p.ghs_unique_identifier ?? p.ghsUniqueIdentifier) as
      string | undefined,
    bloodGroup: (p.blood_group ?? p.bloodGroup) as string | undefined,
    allergies: p.allergies as string | undefined,
    chronicConditions: (p.chronic_conditions ?? p.chronicConditions) as
      string | undefined,
    currentMedications: (p.current_medications ?? p.currentMedications) as
      string | undefined,
    surgicalHistory: (p.surgical_history ?? p.surgicalHistory) as
      string | undefined,
    familyHistory: (p.family_history ?? p.familyHistory) as string | undefined,
    socialHistory: (p.social_history ?? p.socialHistory) as string | undefined,
    occupation: p.occupation as string | undefined,
    employerName: (p.employer_name ?? p.employerName) as string | undefined,
    nationality: p.nationality as string | undefined,
    religion: p.religion as string | undefined,
    tribe: p.tribe as string | undefined,
    hometown: p.hometown as string | undefined,
    regionOfOrigin: (p.region_of_origin ?? p.regionOfOrigin) as
      string | undefined,
    districtOfOrigin: (p.district_of_origin ?? p.districtOfOrigin) as
      string | undefined,
    idType: (p.id_type ?? p.idType) as string | undefined,
    idNumber: (p.id_number ?? p.idNumber) as string | undefined,
    emergencyContactName: (p.emergency_contact_name ??
      p.emergencyContactName) as string | undefined,
    emergencyContactPhone: (p.emergency_contact_phone ??
      p.emergencyContactPhone) as string | undefined,
    emergencyContactRelationship: (p.emergency_contact_relationship ??
      p.emergencyContactRelationship) as string | undefined,
    emergencyContactAddress: (p.emergency_contact_address ??
      p.emergencyContactAddress) as string | undefined,
    facilityId: (p.facility_id ?? p.facilityId) as string,
    createdAt: (p.created_at ?? p.createdAt) as string,
  };
}

// ─── Reusable section heading (used inside a 2-col CSS grid) ────────────────
function SectionHeader({ children }: Readonly<{ children: string }>) {
  return (
    <div className="sm:col-span-2 mt-2 -mb-1">
      <p className="text-xs font-semibold uppercase tracking-wider text-primary-600 border-b border-primary-100 pb-1">
        {children}
      </p>
    </div>
  );
}

// ─── Phone input with static +233 country code prefix ───────────────────────
const PhoneInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>((props, ref) => (
  <div className="flex overflow-hidden rounded-lg border border-gray-300 bg-white focus-within:ring-2 focus-within:ring-primary-500 focus-within:border-primary-500 transition-colors">
    <span className="flex items-center px-3 py-2 bg-gray-50 border-r border-gray-300 text-gray-500 text-sm font-medium select-none shrink-0">
      +233
    </span>
    <input
      ref={ref}
      type="tel"
      className="flex-1 px-3 py-2 text-sm outline-none bg-transparent placeholder-gray-400 min-w-0"
      {...props}
    />
  </div>
));
PhoneInput.displayName = "PhoneInput";

// ─── Allergy multi-picker: searchable, max 3 selections ─────────────────────
function AllergyPicker({
  form,
}: Readonly<{ form: UseFormReturn<Partial<Patient>> }>) {
  const { setValue, watch } = form;
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const raw = watch("allergies") ?? "";
  const selected = raw
    ? raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  const filtered = COMMON_ALLERGIES.filter(
    (a) =>
      a.toLowerCase().includes(search.toLowerCase()) && !selected.includes(a),
  );

  function add(allergy: string) {
    if (selected.length >= 3) return;
    setValue("allergies", [...selected, allergy].join(", "), {
      shouldDirty: true,
    });
    setSearch("");
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function remove(allergy: string) {
    setValue("allergies", selected.filter((s) => s !== allergy).join(", "), {
      shouldDirty: true,
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[0]) add(filtered[0]);
    } else if (e.key === "Backspace" && !search && selected.length > 0) {
      remove(selected[selected.length - 1]);
    }
  }

  return (
    <FormField label="Known Allergies" className="sm:col-span-2">
      <div className="relative">
        <div className="flex flex-wrap items-center gap-1.5 min-h-[42px] px-2 py-1.5 border border-gray-300 rounded-lg bg-white focus-within:ring-2 focus-within:ring-primary-500 focus-within:border-primary-500 transition-colors">
          {selected.map((a) => (
            <span
              key={a}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-800"
            >
              {a}
              <button
                type="button"
                onClick={() => remove(a)}
                className="text-primary-600 hover:text-primary-900 font-bold leading-none"
              >
                ×
              </button>
            </span>
          ))}
          {selected.length < 3 && (
            <input
              ref={inputRef}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 150)}
              onKeyDown={handleKeyDown}
              placeholder={
                selected.length === 0 ? "Search allergies…" : "+ add more"
              }
              className="flex-1 min-w-[120px] text-sm outline-none bg-transparent placeholder-gray-400 py-0.5"
            />
          )}
        </div>
        {open && filtered.length > 0 && (
          <ul className="absolute top-full left-0 right-0 mt-1 max-h-44 overflow-y-auto border border-gray-200 rounded-lg bg-white shadow-lg z-20">
            {filtered.slice(0, 10).map((a) => (
              <li key={a}>
                <button
                  type="button"
                  onMouseDown={() => add(a)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-primary-50 hover:text-primary-700"
                >
                  {a}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {selected.length >= 3 && (
        <p className="text-xs text-gray-400 mt-1">
          Maximum 3 allergies selected
        </p>
      )}
    </FormField>
  );
}

// ─── All patient form fields (shared by Add + Edit modals) ───────────────────
function PatientFormFields({
  form,
}: Readonly<{ form: UseFormReturn<Partial<Patient>> }>) {
  const {
    register,
    watch,
    formState: { errors },
  } = form;
  const selectedProvider = watch("insuranceProvider");
  return (
    <>
      {/* ── Personal Information ── */}
      <SectionHeader>Personal Information</SectionHeader>
      <FormField label="Title">
        <Select
          options={titleOptions}
          placeholder="— None —"
          {...register("title")}
        />
      </FormField>
      <div /> {/* spacer */}
      <FormField label="First Name" required error={errors.firstName?.message}>
        <Input
          {...register("firstName", { required: "Required" })}
          placeholder="John"
        />
      </FormField>
      <FormField label="Last Name" required error={errors.lastName?.message}>
        <Input
          {...register("lastName", { required: "Required" })}
          placeholder="Doe"
        />
      </FormField>
      <FormField label="Middle Name">
        <Input {...register("middleName")} placeholder="Optional" />
      </FormField>
      <FormField
        label="Date of Birth"
        required
        error={errors.dateOfBirth?.message}
      >
        <Input
          type="date"
          {...register("dateOfBirth", { required: "Required" })}
        />
      </FormField>
      <FormField label="Gender" required error={errors.gender?.message}>
        <Select
          options={genderOptions}
          placeholder="Select"
          {...register("gender", { required: "Required" })}
        />
      </FormField>
      <FormField label="Marital Status">
        <Select
          options={maritalStatusOptions}
          placeholder="— None —"
          {...register("maritalStatus")}
        />
      </FormField>
      <FormField label="Genotype">
        <Select
          options={genotypeOptions}
          placeholder="— Unknown —"
          {...register("genotype")}
        />
      </FormField>
      <div />
      {/* ── Contact Details ── */}
      <SectionHeader>Contact Details</SectionHeader>
      <FormField label="Phone Number">
        <PhoneInput {...register("phone")} placeholder="XX XXX XXXX" />
      </FormField>
      <FormField label="Alternate Phone">
        <PhoneInput {...register("alternatePhone")} placeholder="XX XXX XXXX" />
      </FormField>
      <FormField label="Email" className="sm:col-span-2">
        <Input
          type="email"
          {...register("email")}
          placeholder="patient@email.com"
        />
      </FormField>
      {/* ── Residential Address ── */}
      <SectionHeader>Residential Address</SectionHeader>
      <FormField label="Address Line 1" className="sm:col-span-2">
        <Input {...register("addressLine1")} placeholder="House No. / Street" />
      </FormField>
      <FormField label="Address Line 2" className="sm:col-span-2">
        <Input
          {...register("addressLine2")}
          placeholder="Suburb / Area (optional)"
        />
      </FormField>
      <FormField label="City / Town">
        <Input {...register("city")} placeholder="e.g. Accra" />
      </FormField>
      <FormField label="District">
        <Input {...register("district")} placeholder="e.g. Ayawaso West" />
      </FormField>
      <FormField label="Region">
        <Select
          options={ghanaRegions}
          placeholder="— Select region —"
          {...register("region")}
        />
      </FormField>
      <FormField label="Postal Code">
        <Input {...register("postalCode")} />
      </FormField>
      <FormField
        label="Digital Address (GhanaPost GPS)"
        className="sm:col-span-2"
      >
        <Input {...register("digitalAddress")} placeholder="e.g. GA-XXX-XXXX" />
      </FormField>
      {/* ── Identity ── */}
      <SectionHeader>Identity</SectionHeader>
      <FormField label="ID Type">
        <Select
          options={idTypeOptions}
          placeholder="— Select —"
          {...register("idType")}
        />
      </FormField>
      <FormField label="ID Number">
        <Input {...register("idNumber")} placeholder="ID number" />
      </FormField>
      <FormField label="GHS Unique ID" className="sm:col-span-2">
        <Input
          {...register("ghsUniqueIdentifier")}
          placeholder="Ghana Health Service unique identifier"
        />
      </FormField>
      {/* ── Insurance ── */}
      <SectionHeader>Insurance</SectionHeader>
      <FormField label="Insurance Provider">
        <Select
          options={insuranceProviderOptions}
          placeholder="— None —"
          {...register("insuranceProvider")}
        />
      </FormField>
      <FormField label="Insurance Type">
        <Select
          options={insuranceTypeOptions}
          placeholder="— Select —"
          {...register("insuranceType")}
        />
      </FormField>
      {/* NHIS-specific fields */}
      {selectedProvider === "NHIS" && (
        <>
          <FormField label="NHIS Number">
            <Input {...register("nhisNumber")} placeholder="e.g. NHIS-000000" />
          </FormField>
          <FormField label="NHIS Expiry Date">
            <Input type="date" {...register("nhisExpiryDate")} />
          </FormField>
          <FormField label="NHIS Start Date">
            <Input type="date" {...register("insuranceStartDate")} />
          </FormField>
          <FormField label="Active Code (Visit)">
            <Input
              {...register("policyNumber")}
              placeholder="Visit authorisation code"
            />
          </FormField>
        </>
      )}
      {/* Private / Corporate insurance fields */}
      {selectedProvider && selectedProvider !== "NHIS" && (
        <>
          <FormField label="Policy Number">
            <Input
              {...register("policyNumber")}
              placeholder="Policy / Membership number"
            />
          </FormField>
          <FormField label="Plan Name">
            <Input
              {...register("planName")}
              placeholder="Plan or scheme name"
            />
          </FormField>
          <FormField label="Insurance Start Date">
            <Input type="date" {...register("insuranceStartDate")} />
          </FormField>
          <FormField label="Insurance End Date">
            <Input type="date" {...register("insuranceEndDate")} />
          </FormField>
        </>
      )}
      {/* ── Social Background ── */}
      <SectionHeader>Social Background</SectionHeader>
      <FormField label="Occupation">
        <Input {...register("occupation")} placeholder="e.g. Teacher" />
      </FormField>
      <FormField label="Employer Name">
        <Input
          {...register("employerName")}
          placeholder="Employer / Organisation"
        />
      </FormField>
      <FormField label="Nationality">
        <Input
          {...register("nationality")}
          list="nationality-list"
          placeholder="e.g. Ghanaian"
          autoComplete="off"
        />
        <datalist id="nationality-list">
          {nationalityOptions.map((o) => (
            <option key={o.value} value={o.value} />
          ))}
        </datalist>
      </FormField>
      <FormField label="Religion">
        <Select
          options={religionOptions}
          placeholder="— Select —"
          {...register("religion")}
        />
      </FormField>
      <FormField label="Tribe / Ethnicity">
        <Select
          options={tribeOptions}
          placeholder="— Select —"
          {...register("tribe")}
        />
      </FormField>
      <FormField label="Hometown">
        <Input {...register("hometown")} placeholder="e.g. Kumasi" />
      </FormField>
      <FormField label="Region of Origin">
        <Select
          options={ghanaRegions}
          placeholder="— Select region —"
          {...register("regionOfOrigin")}
        />
      </FormField>
      <div />
      {/* ── Emergency Contact ── */}
      <SectionHeader>Emergency Contact</SectionHeader>
      <FormField label="Full Name">
        <Input {...register("emergencyContactName")} />
      </FormField>
      <FormField label="Relationship">
        <Select
          options={relationshipOptions}
          placeholder="— Select —"
          {...register("emergencyContactRelationship")}
        />
      </FormField>
      <FormField label="Phone">
        <PhoneInput
          {...register("emergencyContactPhone")}
          placeholder="XX XXX XXXX"
        />
      </FormField>
      <FormField label="Address" className="sm:col-span-2">
        <Input
          {...register("emergencyContactAddress")}
          placeholder="Emergency contact's address"
        />
      </FormField>
      {/* ── Medical Background ── */}
      <SectionHeader>Medical Background</SectionHeader>
      <FormField label="Blood Group">
        <Select
          options={bloodGroupOptions}
          placeholder="— Unknown —"
          {...register("bloodGroup")}
        />
      </FormField>
      <div />
      <AllergyPicker form={form} />
      <FormField label="Chronic Conditions" className="sm:col-span-2">
        <Textarea
          {...register("chronicConditions")}
          placeholder="e.g. Hypertension, Diabetes"
          rows={2}
        />
      </FormField>
      <FormField label="Current Medications" className="sm:col-span-2">
        <Textarea
          {...register("currentMedications")}
          placeholder="Ongoing prescriptions or self-medication"
          rows={2}
        />
      </FormField>
      <FormField label="Surgical History" className="sm:col-span-2">
        <Textarea
          {...register("surgicalHistory")}
          placeholder="Past surgeries or major procedures"
          rows={2}
        />
      </FormField>
      <FormField label="Family History" className="sm:col-span-2">
        <Textarea
          {...register("familyHistory")}
          placeholder="Relevant hereditary or family conditions"
          rows={2}
        />
      </FormField>
      <FormField label="Social History" className="sm:col-span-2">
        <Textarea
          {...register("socialHistory")}
          placeholder="Smoking, alcohol, lifestyle factors"
          rows={2}
        />
      </FormField>
    </>
  );
}
