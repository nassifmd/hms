import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Search,
  CheckCircle,
  Clock,
  AlertTriangle,
  Eye,
  Package,
  TrendingDown,
  Stethoscope,
  Printer,
  CheckSquare,
  Square,
  MessageSquarePlus,
} from "lucide-react";
import toast from "react-hot-toast";
import api from "@/lib/api";
import type { Prescription } from "@/types";
import PageHeader from "@/components/ui/PageHeader";
import DataTable from "@/components/ui/DataTable";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import { formatDate, statusColor } from "@/lib/utils";
import {
  printPrescription,
  printMultiplePrescriptions,
} from "@/lib/printPrescription";

// Helper: resolve snake_case API fields that may not be camelCase-transformed
function rxField(
  rx: Prescription,
  camel: keyof Prescription,
  snake: string,
): string | undefined {
  return ((rx as any)[camel] ?? (rx as any)[snake]) as string | undefined;
}

interface PharmacyDashboard {
  total_prescriptions_today?: number;
  pending_dispensing?: number;
  low_stock_count?: number;
  expiring_soon?: number;
}

export default function PharmacyPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("Pending");
  const [selectedRx, setSelectedRx] = useState<Prescription | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [printNote, setPrintNote] = useState("");

  // Dashboard stats
  const { data: dashboardData } = useQuery<PharmacyDashboard>({
    queryKey: ["pharmacy", "dashboard"],
    queryFn: () =>
      api
        .get("/pharmacy/dashboard")
        .then((r) => r.data.data as PharmacyDashboard),
  });

  // Low stock alerts
  const { data: lowStockData } = useQuery({
    queryKey: ["pharmacy", "alerts", "low-stock"],
    queryFn: () =>
      api.get("/pharmacy/alerts/low-stock").then((r) => r.data.data),
  });

  const { data, isLoading } = useQuery({
    queryKey: ["prescriptions", statusFilter, search],
    queryFn: () =>
      api
        .get("/clinical/prescriptions/pending", {
          params: {
            status: statusFilter || undefined,
            search: search || undefined,
            limit: 30,
          },
        })
        .then((r) => r.data),
  });

  const prescriptions: Prescription[] = data?.data ?? [];

  // ── Selection helpers ──────────────────────────────────────────────

  const isAllSelected =
    prescriptions.length > 0 && selectedIds.size === prescriptions.length;

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(prescriptions.map((r) => r.id)));
    }
  };

  const clearSelection = () => setSelectedIds(new Set());

  // ── Mutations ──────────────────────────────────────────────────────

  const dispenseMutation = useMutation({
    mutationFn: (rx: Prescription) =>
      api.post("/pharmacy/dispense", {
        prescription_id: rx.id,
        patient_id: (rx as any).patient_id ?? rx.patientId,
      }),
    onSuccess: () => {
      toast.success("Prescription dispensed");
      qc.invalidateQueries({ queryKey: ["prescriptions"] });
      qc.invalidateQueries({ queryKey: ["pharmacy"] });
      setSelectedRx(null);
    },
    onError: (err: any) => {
      const code = err?.response?.data?.error?.code;
      if (code === "INSUFFICIENT_STOCK") {
        toast.error("Insufficient stock. Please add stock");
      } else {
        toast.error("Failed to dispense prescription");
      }
    },
  });

  const batchDispenseMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const results = [];
      for (const id of ids) {
        const rx = prescriptions.find((p) => p.id === id);
        if (!rx) continue;
        try {
          await api.post("/pharmacy/dispense", {
            prescription_id: rx.id,
            patient_id: (rx as any).patient_id ?? rx.patientId,
          });
          results.push({ id, success: true });
        } catch {
          results.push({ id, success: false });
        }
      }
      return results;
    },
    onSuccess: (results) => {
      const succeeded = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success).length;
      if (succeeded > 0)
        toast.success(`${succeeded} prescription(s) dispensed`);
      if (failed > 0)
        toast.error(`${failed} prescription(s) failed — check stock`);
      qc.invalidateQueries({ queryKey: ["prescriptions"] });
      qc.invalidateQueries({ queryKey: ["pharmacy"] });
      clearSelection();
    },
    onError: () => toast.error("Batch dispense failed"),
  });

  const tabs = [
    { label: "Pending", value: "Pending", icon: <Clock className="w-4 h-4" /> },
    {
      label: "Dispensed",
      value: "Dispensed",
      icon: <CheckCircle className="w-4 h-4" />,
    },
    { label: "All", value: "", icon: null },
  ];

  // ── Batch actions ──────────────────────────────────────────────────

  const handleBatchPrint = useCallback(() => {
    const selected = prescriptions.filter((r) => selectedIds.has(r.id));
    if (selected.length === 0) return;
    const withNote = selected.map((rx) => ({ ...rx, customNote: printNote }));
    if (withNote.length === 1) {
      printPrescription(withNote[0]);
    } else {
      printMultiplePrescriptions(withNote);
    }
    clearSelection();
    setPrintNote("");
    toast.success(`Printing ${selected.length} prescription(s)`);
  }, [prescriptions, selectedIds, printNote]);

  const handleBatchDispense = useCallback(() => {
    const ids = Array.from(selectedIds);
    batchDispenseMutation.mutate(ids);
  }, [selectedIds, batchDispenseMutation]);

  // ── Table columns ──────────────────────────────────────────────────

  const columns = [
    {
      key: "_checkbox",
      header: "",
      render: (r: Prescription) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleSelect(r.id);
          }}
          className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-primary-600 transition-colors"
          title={selectedIds.has(r.id) ? "Deselect" : "Select"}
        >
          {selectedIds.has(r.id) ? (
            <CheckSquare className="w-4 h-4 text-primary-600" />
          ) : (
            <Square className="w-4 h-4" />
          )}
        </button>
      ),
      className: "w-10",
    },
    {
      key: "id",
      header: "Rx #",
      render: (r: Prescription) => (
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs">
            {rxField(r, "prescriptionNumber", "prescription_number") ??
              r.id.slice(0, 8)}
          </span>
          {((r as any).source ?? "Clinical") === "Dental" && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700 flex items-center gap-0.5">
              <Stethoscope className="w-2.5 h-2.5" /> Dental
            </span>
          )}
        </div>
      ),
    },
    {
      key: "patientId",
      header: "Patient",
      render: (r: Prescription) => (
        <div>
          <p className="text-sm font-medium">
            {rxField(r, "patientName", "patient_name") ?? "—"}
          </p>
          {rxField(r, "patientNumber", "patient_number") && (
            <p className="text-xs text-gray-400">
              {rxField(r, "patientNumber", "patient_number")}
            </p>
          )}
        </div>
      ),
    },
    {
      key: "doctorId",
      header: "Prescriber",
      render: (r: Prescription) =>
        rxField(r, "doctorName", "doctor_name") ?? "—",
    },
    {
      key: "medications",
      header: "Items",
      render: (r: Prescription) =>
        `${((r as any).items ?? r.medications ?? []).length} item(s)`,
    },
    {
      key: "status",
      header: "Status",
      render: (r: Prescription) => (
        <span className={statusColor(r.status)}>{r.status}</span>
      ),
    },
    {
      key: "createdAt",
      header: "Date",
      render: (r: Prescription) =>
        formatDate((r as any).prescription_date ?? r.createdAt),
    },
    {
      key: "actions",
      header: "",
      render: (r: Prescription) => (
        <button
          onClick={() => {
            setSelectedRx(r);
            setPrintNote("");
          }}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
        >
          <Eye className="w-4 h-4" />
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Pharmacy"
        subtitle="Manage prescriptions and medication dispensing"
      />

      {/* Dashboard stats */}
      {dashboardData && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="card p-4 flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Clock className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Pending Dispensing</p>
              <p className="text-xl font-bold text-gray-900">
                {dashboardData.pending_dispensing ?? 0}
              </p>
            </div>
          </div>
          <div className="card p-4 flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Dispensed Today</p>
              <p className="text-xl font-bold text-gray-900">
                {dashboardData.total_prescriptions_today ?? 0}
              </p>
            </div>
          </div>
          <div className="card p-4 flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-lg">
              <TrendingDown className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Low Stock Items</p>
              <p className="text-xl font-bold text-gray-900">
                {dashboardData.low_stock_count ?? lowStockData?.length ?? 0}
              </p>
            </div>
          </div>
          <div className="card p-4 flex items-center gap-3">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <Package className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Expiring Soon</p>
              <p className="text-xl font-bold text-gray-900">
                {dashboardData.expiring_soon ?? 0}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {tabs.map((t) => (
          <button
            key={t.value}
            onClick={() => {
              setStatusFilter(t.value);
              clearSelection();
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              statusFilter === t.value
                ? "bg-white shadow-sm text-primary-700"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Search + Select-all header */}
      <div className="card p-3 flex items-center gap-3">
        <button
          onClick={toggleSelectAll}
          className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-primary-600 transition-colors"
          title={isAllSelected ? "Deselect all" : "Select all"}
        >
          {isAllSelected ? (
            <CheckSquare className="w-5 h-5 text-primary-600" />
          ) : (
            <Square className="w-5 h-5" />
          )}
        </button>
        <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            clearSelection();
          }}
          placeholder="Search prescriptions…"
          className="flex-1 text-sm outline-none bg-transparent placeholder-gray-400"
        />
      </div>

      {/* Batch action bar */}
      {selectedIds.size > 0 && (
        <div className="bg-primary-50 border border-primary-200 rounded-xl px-4 py-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-primary-700 font-medium">
              {selectedIds.size} prescription(s) selected
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Printer className="w-4 h-4" />}
                onClick={handleBatchPrint}
              >
                Print Selected
              </Button>
              <Button
                size="sm"
                leftIcon={<CheckCircle className="w-4 h-4" />}
                onClick={handleBatchDispense}
                isLoading={batchDispenseMutation.isPending}
                disabled={
                  statusFilter !== "Pending" &&
                  prescriptions.some((r) => r.status !== "Pending")
                }
              >
                Dispense Selected
              </Button>
              <button
                onClick={clearSelection}
                className="text-xs text-gray-500 hover:text-gray-700 underline ml-1"
              >
                Clear
              </button>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <MessageSquarePlus className="w-4 h-4 text-primary-400 mt-2 flex-shrink-0" />
            <input
              value={printNote}
              onChange={(e) => setPrintNote(e.target.value)}
              placeholder="Add a note to the printed prescription(s)…"
              className="w-full text-sm bg-white border border-primary-200 rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-primary-400 placeholder-gray-400"
            />
          </div>
        </div>
      )}

      <DataTable
        columns={columns}
        data={prescriptions}
        keyField="id"
        isLoading={isLoading}
        emptyMessage="No prescriptions found"
      />

      {/* Prescription detail modal */}
      {selectedRx && (
        <Modal
          open={!!selectedRx}
          onClose={() => setSelectedRx(null)}
          title="Prescription Details"
          size="lg"
          footer={
            selectedRx.status === "Pending" ? (
              <>
                <Button variant="secondary" onClick={() => setSelectedRx(null)}>
                  Cancel
                </Button>
                <Button
                  variant="secondary"
                  leftIcon={<Printer className="w-4 h-4" />}
                  onClick={() =>
                    printPrescription({
                      ...selectedRx,
                      customNote: printNote,
                    })
                  }
                >
                  Print Prescription
                </Button>
                <Button
                  leftIcon={<CheckCircle className="w-4 h-4" />}
                  onClick={() => dispenseMutation.mutate(selectedRx)}
                  isLoading={dispenseMutation.isPending}
                >
                  Dispense
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="secondary"
                  leftIcon={<Printer className="w-4 h-4" />}
                  onClick={() =>
                    printPrescription({
                      ...selectedRx,
                      customNote: printNote,
                    })
                  }
                >
                  Print Prescription
                </Button>
                <Button variant="secondary" onClick={() => setSelectedRx(null)}>
                  Close
                </Button>
              </>
            )
          }
        >
          <div className="space-y-4">
            <div className="p-4 bg-gray-50 rounded-xl grid grid-cols-2 gap-2 text-sm">
              <span className="text-gray-500">Patient</span>
              <span className="font-medium">
                {rxField(selectedRx, "patientName", "patient_name") ??
                  selectedRx.patientId}
              </span>
              <span className="text-gray-500">Prescriber</span>
              <span className="font-medium flex items-center gap-1.5">
                {rxField(selectedRx, "doctorName", "doctor_name") ??
                  selectedRx.doctorId}
                {((selectedRx as any).source ?? "Clinical") === "Dental" && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700 flex items-center gap-0.5">
                    <Stethoscope className="w-2.5 h-2.5" /> Dental
                  </span>
                )}
              </span>
              <span className="text-gray-500">Status</span>
              <span className={statusColor(selectedRx.status)}>
                {selectedRx.status}
              </span>
              <span className="text-gray-500">Date</span>
              <span>
                {formatDate(
                  (selectedRx as any).prescription_date ?? selectedRx.createdAt,
                )}
              </span>
            </div>

            {((selectedRx as any).items ?? selectedRx.medications ?? [])
              .length > 0 && (
              <div>
                <p className="text-sm font-semibold mb-2">Medications</p>
                <div className="space-y-2">
                  {(
                    (selectedRx as any).items ??
                    selectedRx.medications ??
                    []
                  ).map((med: any) => (
                    <div
                      key={
                        med.id ??
                        med.medicationId ??
                        med.medication_name ??
                        med.medicationName
                      }
                      className="flex items-start justify-between p-3 border border-gray-100 rounded-lg"
                    >
                      <div>
                        <p className="font-medium text-sm">
                          {med.medication_name ?? med.medicationName}
                        </p>
                        <p className="text-xs text-gray-500">
                          {med.dosage} · {med.frequency} · {med.duration}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">
                          Qty: {med.quantity}
                        </p>
                        {(med.dispensedQuantity ?? med.dispensed_quantity) !==
                          undefined && (
                          <p className="text-xs text-gray-500">
                            Dispensed:{" "}
                            {med.dispensedQuantity ?? med.dispensed_quantity}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedRx.notes && !/^\[dental:/.test(selectedRx.notes) && (
              <div className="p-3 bg-yellow-50 rounded-lg">
                <p className="text-xs text-yellow-700 font-medium mb-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Notes
                </p>
                <p className="text-sm text-yellow-800">{selectedRx.notes}</p>
              </div>
            )}

            {/* Pharmacist note input */}
            <div className="flex items-start gap-2 pt-2">
              <MessageSquarePlus className="w-4 h-4 text-gray-400 mt-2 flex-shrink-0" />
              <textarea
                value={printNote}
                onChange={(e) => setPrintNote(e.target.value)}
                placeholder="Add a note before printing (e.g. reason for not dispensing, alternative pharmacy recommendation)…"
                rows={2}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-primary-400 placeholder-gray-400 resize-none"
              />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
