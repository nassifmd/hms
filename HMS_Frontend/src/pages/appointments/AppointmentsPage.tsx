import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Search,
  Calendar,
  Clock,
  CheckCircle,
  XCircle,
  User,
} from "lucide-react";
import toast from "react-hot-toast";
import api from "@/lib/api";
import type { Appointment } from "@/types";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import DataTable from "@/components/ui/DataTable";
import Modal from "@/components/ui/Modal";
import { FormField, Input, Select, Textarea } from "@/components/ui/Form";
import { formatDate, statusColor, cn } from "@/lib/utils";

const statusOptions = [
  { value: "Scheduled", label: "Scheduled" },
  { value: "Confirmed", label: "Confirmed" },
  { value: "Completed", label: "Completed" },
  { value: "Cancelled", label: "Cancelled" },
  { value: "No-Show", label: "No-Show" },
];

const typeOptions = [
  { value: "Consultation", label: "Consultation" },
  { value: "Follow-up", label: "Follow-up" },
  { value: "Emergency", label: "Emergency" },
  { value: "Procedure", label: "Procedure" },
  { value: "Lab", label: "Laboratory" },
  { value: "Dental", label: "Dental" },
  { value: "Eye", label: "Eye Clinic" },
];

interface ApptFormState {
  patientId: string;
  patientLabel: string;
  departmentId: string;
  doctorId: string;
  appointmentDate: string;
  startTime: string;
  endTime: string;
  appointmentType: string;
  reason: string;
  notes: string;
}

const emptyForm = (): ApptFormState => ({
  patientId: "",
  patientLabel: "",
  departmentId: "",
  doctorId: "",
  appointmentDate: new Date().toISOString().slice(0, 10),
  startTime: "08:00",
  endTime: "08:30",
  appointmentType: "Consultation",
  reason: "",
  notes: "",
});

function addMinutes(time: string, mins: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + mins;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

const StatusBadge = ({ status }: { status: string }) => (
  <span className={statusColor(status)}>{status}</span>
);

// Appointment booking form used both from this page and from patient view
export function AppointmentForm({
  initial,
  onSuccess,
  onCancel,
}: Readonly<{
  initial?: Partial<ApptFormState>;
  onSuccess?: () => void;
  onCancel?: () => void;
}>) {
  const qc = useQueryClient();
  const [form, setForm] = useState<ApptFormState>({
    ...emptyForm(),
    ...initial,
  });
  const [patientSearch, setPatientSearch] = useState(
    initial?.patientLabel ?? "",
  );
  const [showPatientDropdown, setShowPatientDropdown] = useState(false);
  const patientRef = useRef<HTMLDivElement>(null);

  const patientFixed = !!initial?.patientId;

  // Departments
  const { data: deptData } = useQuery({
    queryKey: ["departments"],
    queryFn: () =>
      api
        .get("/users/departments")
        .then(
          (r) => r.data.data as Array<{ id: string; departmentName: string }>,
        ),
  });
  const deptOptions = (deptData ?? []).map((d) => ({
    value: d.id,
    label: d.departmentName,
  }));

  // Doctors — available for the chosen slot + department
  const canFetchDoctors = !!(
    form.appointmentDate &&
    form.startTime &&
    form.endTime
  );
  const { data: doctorData } = useQuery({
    queryKey: [
      "doctors",
      "available",
      form.appointmentDate,
      form.startTime,
      form.endTime,
      form.departmentId,
    ],
    queryFn: () =>
      api
        .get("/users/doctors/available", {
          params: {
            date: form.appointmentDate,
            startTime: form.startTime,
            endTime: form.endTime,
            departmentId: form.departmentId || undefined,
          },
        })
        .then(
          (r) =>
            r.data.data as Array<{
              id: string;
              firstName: string;
              lastName: string;
              specialization?: string;
            }>,
        ),
    enabled: canFetchDoctors,
  });
  const doctorOptions = (doctorData ?? []).map((d) => ({
    value: d.id,
    label:
      `${d.firstName} ${d.lastName}` +
      (d.specialization ? ` (${d.specialization})` : ""),
  }));

  // Patient search
  const { data: patientSearchData } = useQuery({
    queryKey: ["patients", "search", patientSearch],
    queryFn: () =>
      api
        .get("/patients", { params: { search: patientSearch, limit: 6 } })
        .then(
          (r) =>
            r.data.patients as Array<{
              id: string;
              patient_number: string;
              first_name: string;
              last_name: string;
            }>,
        ),
    enabled: patientSearch.length >= 2 && !patientFixed,
  });

  // Close patient dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (
        patientRef.current &&
        !patientRef.current.contains(e.target as Node)
      ) {
        setShowPatientDropdown(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const createMutation = useMutation({
    mutationFn: (f: ApptFormState) =>
      api.post("/appointments", {
        patient_id: f.patientId,
        doctor_id: f.doctorId,
        department_id: f.departmentId,
        appointment_date: f.appointmentDate,
        start_time: f.startTime,
        end_time: f.endTime,
        appointment_type: f.appointmentType,
        reason: f.reason || undefined,
        notes: f.notes || undefined,
      }),
    onSuccess: () => {
      toast.success("Appointment scheduled");
      qc.invalidateQueries({ queryKey: ["appointments"] });
      onSuccess?.();
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })
          ?.response?.data?.error?.message ?? "Failed to schedule appointment";
      toast.error(msg);
    },
  });

  function set(key: keyof ApptFormState, val: string) {
    setForm((prev) => {
      const next = { ...prev, [key]: val };
      // Auto-adjust end time when start time changes
      if (key === "startTime") {
        next.endTime = addMinutes(val, 30);
      }
      return next;
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.patientId) return toast.error("Please select a patient");
    if (!form.departmentId) return toast.error("Please select a department");
    if (!form.doctorId) return toast.error("Please select a doctor");
    if (!form.appointmentDate) return toast.error("Please select a date");
    if (!form.startTime || !form.endTime)
      return toast.error("Please set appointment times");
    createMutation.mutate(form);
  }

  let doctorPlaceholder = "Select date & time first";
  if (canFetchDoctors) {
    if (!doctorData) {
      doctorPlaceholder = "Loading\u2026";
    } else if (doctorOptions.length) {
      doctorPlaceholder = "Select doctor";
    } else {
      doctorPlaceholder = "No available doctors";
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid grid-cols-1 sm:grid-cols-2 gap-4"
    >
      {/* Patient */}
      <div className="sm:col-span-2" ref={patientRef}>
        <FormField label="Patient" required>
          {patientFixed ? (
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200 text-sm">
              <User className="w-4 h-4 text-gray-400" />
              <span>{form.patientLabel}</span>
            </div>
          ) : (
            <div className="relative">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  value={patientSearch}
                  onChange={(e) => {
                    setPatientSearch(e.target.value);
                    setShowPatientDropdown(true);
                    if (!e.target.value)
                      setForm((p) => ({
                        ...p,
                        patientId: "",
                        patientLabel: "",
                      }));
                  }}
                  onFocus={() => setShowPatientDropdown(true)}
                  placeholder="Search patient by name or number…"
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              {form.patientId && (
                <p className="mt-1 text-xs text-green-600">
                  ✓ {form.patientLabel}
                </p>
              )}
              {showPatientDropdown && (patientSearchData?.length ?? 0) > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {patientSearchData!.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                      onClick={() => {
                        const label = `${p.first_name} ${p.last_name} (${p.patient_number})`;
                        setForm((prev) => ({
                          ...prev,
                          patientId: p.id,
                          patientLabel: label,
                        }));
                        setPatientSearch(label);
                        setShowPatientDropdown(false);
                      }}
                    >
                      <span className="font-medium">
                        {p.first_name} {p.last_name}
                      </span>
                      <span className="ml-2 text-gray-400 font-mono text-xs">
                        {p.patient_number}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </FormField>
      </div>

      {/* Department */}
      <FormField label="Department" required>
        <Select
          options={deptOptions}
          placeholder={deptData ? "Select department" : "Loading…"}
          value={form.departmentId}
          onChange={(e) => {
            set("departmentId", e.target.value);
            set("doctorId", "");
          }}
        />
      </FormField>

      {/* Date */}
      <FormField label="Date" required>
        <Input
          type="date"
          value={form.appointmentDate}
          onChange={(e) => set("appointmentDate", e.target.value)}
        />
      </FormField>

      {/* Start time */}
      <FormField label="Start Time" required>
        <Input
          type="time"
          value={form.startTime}
          onChange={(e) => set("startTime", e.target.value)}
        />
      </FormField>

      {/* End time */}
      <FormField label="End Time" required>
        <Input
          type="time"
          value={form.endTime}
          onChange={(e) => set("endTime", e.target.value)}
        />
      </FormField>

      {/* Doctor */}
      <FormField label="Doctor" required className="sm:col-span-2">
        <Select
          options={doctorOptions}
          placeholder={doctorPlaceholder}
          value={form.doctorId}
          onChange={(e) => set("doctorId", e.target.value)}
          disabled={!canFetchDoctors}
        />
      </FormField>

      {/* Type */}
      <FormField label="Appointment Type" required>
        <Select
          options={typeOptions}
          value={form.appointmentType}
          onChange={(e) => set("appointmentType", e.target.value)}
        />
      </FormField>

      {/* Spacer to align */}
      <div />

      {/* Reason */}
      <FormField label="Reason" className="sm:col-span-2">
        <Textarea
          value={form.reason}
          onChange={(e) => set("reason", e.target.value)}
          placeholder="Chief complaint / reason for visit"
        />
      </FormField>

      {/* Notes */}
      <FormField label="Notes" className="sm:col-span-2">
        <Textarea
          value={form.notes}
          onChange={(e) => set("notes", e.target.value)}
          placeholder="Additional notes"
        />
      </FormField>

      {/* Buttons */}
      <div className="sm:col-span-2 flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" isLoading={createMutation.isPending}>
          Schedule Appointment
        </Button>
      </div>
    </form>
  );
}

interface ApptRow extends Record<string, unknown> {
  id: string;
  patient_id: string;
  patient_name?: string;
  patient_number?: string;
  doctor_id?: string;
  doctor_name?: string;
  department_id?: string;
  appointment_date: string;
  start_time?: string;
  end_time?: string;
  appointment_type?: string;
  reason?: string;
  status: string;
}

export default function AppointmentsPage() {
  const [addOpen, setAddOpen] = useState(false);
  const [dateFilter, setDateFilter] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [openVisitAppt, setOpenVisitAppt] = useState<ApptRow | null>(null);
  const [visitType, setVisitType] = useState("Outpatient");
  const [cancelAppt, setCancelAppt] = useState<ApptRow | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [rescheduleAppt, setRescheduleAppt] = useState<ApptRow | null>(null);
  const [rescheduleForm, setRescheduleForm] = useState({
    new_date: "",
    new_start_time: "",
    new_end_time: "",
  });

  const { data, isLoading } = useQuery({
    queryKey: ["appointments", dateFilter, statusFilter, page],
    queryFn: () =>
      api
        .get("/appointments", {
          params: {
            date: dateFilter || undefined,
            status: statusFilter || undefined,
            page,
            limit: 20,
          },
        })
        .then((r) => r.data),
  });

  const rawAppointments: ApptRow[] = (data?.data?.appointments ??
    []) as ApptRow[];
  const pagination = data?.data?.pagination;

  const qc = useQueryClient();

  const checkInMutation = useMutation({
    mutationFn: (id: string) => api.put(`/appointments/${id}/check-in`),
    onSuccess: () => {
      toast.success("Patient checked in");
      qc.invalidateQueries({ queryKey: ["appointments"] });
    },
    onError: () => toast.error("Check-in failed"),
  });

  const openVisitMutation = useMutation({
    mutationFn: ({ appt, vType }: { appt: ApptRow; vType: string }) =>
      api.post("/clinical/visits", {
        patient_id: appt.patient_id,
        department_id: appt.department_id,
        visit_type: vType,
        appointment_id: appt.id,
        chief_complaint: appt.reason,
      }),
    onSuccess: () => {
      toast.success("Visit opened — patient is now in Clinical queue");
      qc.invalidateQueries({ queryKey: ["appointments"] });
      qc.invalidateQueries({ queryKey: ["clinical"] });
      setOpenVisitAppt(null);
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })
          ?.response?.data?.error?.message ?? "Failed to open visit";
      toast.error(msg);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.put(`/appointments/${id}/cancel`, { reason }),
    onSuccess: () => {
      toast.success("Appointment cancelled");
      qc.invalidateQueries({ queryKey: ["appointments"] });
      setCancelAppt(null);
      setCancelReason("");
    },
    onError: () => toast.error("Failed to cancel appointment"),
  });

  const rescheduleMutation = useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      new_date: string;
      new_start_time: string;
      new_end_time: string;
    }) => api.put(`/appointments/${id}/reschedule`, body),
    onSuccess: () => {
      toast.success("Appointment rescheduled");
      qc.invalidateQueries({ queryKey: ["appointments"] });
      setRescheduleAppt(null);
    },
    onError: () => toast.error("Failed to reschedule"),
  });

  const noShowMutation = useMutation({
    mutationFn: (id: string) => api.put(`/appointments/${id}/no-show`),
    onSuccess: () => {
      toast.success("Marked as no-show");
      qc.invalidateQueries({ queryKey: ["appointments"] });
    },
    onError: () => toast.error("Failed to mark no-show"),
  });

  const checkOutMutation = useMutation({
    mutationFn: (id: string) => api.put(`/appointments/${id}/check-out`),
    onSuccess: () => {
      toast.success("Patient checked out");
      qc.invalidateQueries({ queryKey: ["appointments"] });
    },
    onError: () => toast.error("Check-out failed"),
  });

  const { data: todayData } = useQuery({
    queryKey: ["appointments", "today"],
    queryFn: () => api.get("/appointments/today").then((r) => r.data.data),
  });

  const summaryStats = [
    {
      label: "Today",
      value: todayData?.length ?? 0,
      icon: <Calendar className="w-4 h-4" />,
      color: "bg-blue-50 text-blue-600",
    },
    {
      label: "Scheduled",
      value: rawAppointments.filter((a) => a.status === "Scheduled").length,
      icon: <Clock className="w-4 h-4" />,
      color: "bg-yellow-50 text-yellow-600",
    },
    {
      label: "Completed",
      value: rawAppointments.filter((a) => a.status === "Completed").length,
      icon: <CheckCircle className="w-4 h-4" />,
      color: "bg-green-50 text-green-600",
    },
    {
      label: "Cancelled",
      value: rawAppointments.filter((a) => a.status === "Cancelled").length,
      icon: <XCircle className="w-4 h-4" />,
      color: "bg-red-50 text-red-600",
    },
  ];

  // Columns use snake_case keys returned by the backend SQL query
  const columns = useMemo(() => [
    {
      key: "patient_id",
      header: "Patient",
      render: (r: ApptRow) =>
        r.patient_name ?? (
          <span className="font-mono text-xs text-gray-400">
            {r.patient_id.slice(0, 8)}…
          </span>
        ),
    },
    {
      key: "doctor_id",
      header: "Doctor",
      render: (r: ApptRow) =>
        r.doctor_name ?? (
          <span className="font-mono text-xs text-gray-400">
            {(r.doctor_id ?? "").slice(0, 8)}…
          </span>
        ),
    },
    {
      key: "appointment_date",
      header: "Date",
      render: (r: ApptRow) => formatDate(r.appointment_date),
    },
    {
      key: "start_time",
      header: "Time",
      render: (r: ApptRow) => `${r.start_time ?? "—"} – ${r.end_time ?? "—"}`,
    },
    {
      key: "appointment_type",
      header: "Type",
      render: (r: ApptRow) => r.appointment_type ?? "—",
    },
    {
      key: "status",
      header: "Status",
      render: (r: ApptRow) => <StatusBadge status={r.status} />,
    },
    {
      key: "reason",
      header: "Reason",
      render: (r: ApptRow) => (
        <span className="truncate max-w-xs block text-xs text-gray-500">
          {r.reason ?? "—"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (r: ApptRow) => {
        const canCheckIn = r.status === "Scheduled" || r.status === "Confirmed";
        const canOpenVisit =
          r.status === "In Progress" || r.status === "Checked In";
        const canCancel = r.status === "Scheduled" || r.status === "Confirmed";
        const canNoShow = r.status === "Scheduled" || r.status === "Confirmed";
        const canCheckOut =
          r.status === "In Progress" || r.status === "Checked In";
        return (
          <div className="flex items-center gap-1 flex-wrap">
            {canCheckIn && (
              <button
                onClick={() => checkInMutation.mutate(r.id)}
                disabled={checkInMutation.isPending}
                className="px-2 py-1 text-xs font-medium rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 whitespace-nowrap"
              >
                Check In
              </button>
            )}
            {canOpenVisit && (
              <button
                onClick={() => {
                  setOpenVisitAppt(r);
                  setVisitType("Outpatient");
                }}
                className="px-2 py-1 text-xs font-medium rounded-lg bg-green-50 text-green-700 hover:bg-green-100 whitespace-nowrap"
              >
                Open Visit
              </button>
            )}
            {canCheckOut && (
              <button
                onClick={() => checkOutMutation.mutate(r.id)}
                disabled={checkOutMutation.isPending}
                className="px-2 py-1 text-xs font-medium rounded-lg bg-purple-50 text-purple-700 hover:bg-purple-100 whitespace-nowrap"
              >
                Check Out
              </button>
            )}
            {canCancel && (
              <button
                onClick={() => {
                  setCancelAppt(r);
                  setCancelReason("");
                }}
                className="px-2 py-1 text-xs font-medium rounded-lg bg-red-50 text-red-700 hover:bg-red-100 whitespace-nowrap"
              >
                Cancel
              </button>
            )}
            {canNoShow && (
              <button
                onClick={() => noShowMutation.mutate(r.id)}
                disabled={noShowMutation.isPending}
                className="px-2 py-1 text-xs font-medium rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 whitespace-nowrap"
              >
                No-Show
              </button>
            )}
            {(r.status === "Scheduled" || r.status === "Confirmed") && (
              <button
                onClick={() => {
                  setRescheduleAppt(r);
                  setRescheduleForm({
                    new_date: r.appointment_date.slice(0, 10),
                    new_start_time: r.start_time ?? "",
                    new_end_time: r.end_time ?? "",
                  });
                }}
                className="px-2 py-1 text-xs font-medium rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 whitespace-nowrap"
              >
                Reschedule
              </button>
            )}
          </div>
        );
      },
    },
  ], []);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Appointments"
        subtitle="Manage and schedule patient appointments"
        actions={
          <Button
            leftIcon={<Plus className="w-4 h-4" />}
            onClick={() => setAddOpen(true)}
            size="sm"
          >
            New Appointment
          </Button>
        }
      />

      {/* Summary badges */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {summaryStats.map((s) => (
          <div
            key={s.label}
            className={cn(
              "card p-4 flex items-center gap-3",
              s.color.split(" ")[0],
            )}
          >
            <span className={cn("p-2 rounded-lg", s.color)}>{s.icon}</span>
            <div>
              <p className="text-lg font-bold text-gray-900">{s.value}</p>
              <p className="text-xs text-gray-500">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="card p-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-gray-400" />
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <Select
          options={statusOptions}
          placeholder="All statuses"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-40 text-sm py-1.5"
        />
        {(dateFilter || statusFilter) && (
          <button
            onClick={() => {
              setDateFilter("");
              setStatusFilter("");
            }}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            Clear
          </button>
        )}
      </div>

      <DataTable
        columns={columns}
        data={rawAppointments as unknown as ApptRow[]}
        keyField="id"
        isLoading={isLoading}
        emptyMessage="No appointments found"
      />

      {pagination && pagination.pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">
            Page {pagination.page} of {pagination.pages}
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
              disabled={page === pagination.pages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Schedule Appointment Modal */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Schedule Appointment"
        size="lg"
      >
        <AppointmentForm
          onSuccess={() => setAddOpen(false)}
          onCancel={() => setAddOpen(false)}
        />
      </Modal>

      {/* Open Visit Modal */}
      <Modal
        open={!!openVisitAppt}
        onClose={() => setOpenVisitAppt(null)}
        title="Open Clinical Visit"
        size="sm"
      >
        {openVisitAppt && (
          <div className="space-y-4">
            <div className="p-3 bg-gray-50 rounded-xl text-sm space-y-1">
              <p className="font-semibold text-gray-900">
                {openVisitAppt.patient_name ?? "Patient"}
              </p>
              <p className="text-gray-500">{openVisitAppt.patient_number}</p>
              {openVisitAppt.reason && (
                <p className="text-gray-600 mt-1">{openVisitAppt.reason}</p>
              )}
            </div>
            <div>
              <label
                htmlFor="visit-type-select"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Visit Type
              </label>
              <select
                id="visit-type-select"
                value={visitType}
                onChange={(e) => setVisitType(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option>Outpatient</option>
                <option>Inpatient</option>
                <option>Emergency</option>
                <option>Review</option>
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => setOpenVisitAppt(null)}
              >
                Cancel
              </Button>
              <Button
                isLoading={openVisitMutation.isPending}
                onClick={() =>
                  openVisitMutation.mutate({
                    appt: openVisitAppt,
                    vType: visitType,
                  })
                }
              >
                Open Visit
              </Button>
            </div>
          </div>
        )}
      </Modal>
      {/* Cancel Appointment Modal */}
      <Modal
        open={!!cancelAppt}
        onClose={() => setCancelAppt(null)}
        title="Cancel Appointment"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelAppt(null)}>
              Back
            </Button>
            <Button
              variant="danger"
              isLoading={cancelMutation.isPending}
              disabled={!cancelReason.trim()}
              onClick={() =>
                cancelAppt &&
                cancelMutation.mutate({
                  id: cancelAppt.id,
                  reason: cancelReason,
                })
              }
            >
              Confirm Cancellation
            </Button>
          </>
        }
      >
        {cancelAppt && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Cancelling appointment for{" "}
              <strong>{cancelAppt.patient_name ?? "patient"}</strong> on{" "}
              <strong>{formatDate(cancelAppt.appointment_date)}</strong>.
            </p>
            <FormField label="Reason for cancellation" required>
              <Textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Enter reason…"
                rows={3}
              />
            </FormField>
          </div>
        )}
      </Modal>

      {/* Reschedule Appointment Modal */}
      <Modal
        open={!!rescheduleAppt}
        onClose={() => setRescheduleAppt(null)}
        title="Reschedule Appointment"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRescheduleAppt(null)}>
              Cancel
            </Button>
            <Button
              isLoading={rescheduleMutation.isPending}
              disabled={
                !rescheduleForm.new_date ||
                !rescheduleForm.new_start_time ||
                !rescheduleForm.new_end_time
              }
              onClick={() =>
                rescheduleAppt &&
                rescheduleMutation.mutate({
                  id: rescheduleAppt.id,
                  ...rescheduleForm,
                })
              }
            >
              Reschedule
            </Button>
          </>
        }
      >
        {rescheduleAppt && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Rescheduling appointment for{" "}
              <strong>{rescheduleAppt.patient_name ?? "patient"}</strong>.
            </p>
            <FormField label="New Date" required>
              <Input
                type="date"
                value={rescheduleForm.new_date}
                onChange={(e) =>
                  setRescheduleForm((f) => ({ ...f, new_date: e.target.value }))
                }
              />
            </FormField>
            <FormField label="New Start Time" required>
              <Input
                type="time"
                value={rescheduleForm.new_start_time}
                onChange={(e) =>
                  setRescheduleForm((f) => ({
                    ...f,
                    new_start_time: e.target.value,
                  }))
                }
              />
            </FormField>
            <FormField label="New End Time" required>
              <Input
                type="time"
                value={rescheduleForm.new_end_time}
                onChange={(e) =>
                  setRescheduleForm((f) => ({
                    ...f,
                    new_end_time: e.target.value,
                  }))
                }
              />
            </FormField>
          </div>
        )}
      </Modal>
    </div>
  );
}
