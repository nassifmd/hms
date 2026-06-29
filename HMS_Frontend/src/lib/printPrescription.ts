/**
 * Prescription printing utility.
 *
 * Prints one or more prescriptions — when multiple are selected they
 * are stacked compactly onto a single A4 sheet so the pharmacist can
 * hand one page to the patient.
 */

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatDate } from "./utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface PrintPrescriptionData {
  id: string;
  prescription_number?: string;
  prescriptionNumber?: string;
  patient_id?: string;
  patientId?: string;
  patient_name?: string;
  patientName?: string;
  patient_number?: string;
  patientNumber?: string;
  doctor_name?: string;
  doctorName?: string;
  doctor_id?: string;
  doctorId?: string;
  prescription_date?: string;
  createdAt?: string;
  source?: string;
  items?: PrintMedicationItem[];
  medications?: PrintMedicationItem[];
  notes?: string;
  /** Free-text note added by the pharmacist before printing. */
  customNote?: string;
}

export interface PrintMedicationItem {
  id?: string;
  medication_name?: string;
  medicationName?: string;
  dosage?: string;
  frequency?: string;
  duration?: string;
  quantity?: number;
  qty?: number;
  instructions?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function field<T>(obj: any, camel: string, snake: string): T | undefined {
  return (obj[camel] ?? obj[snake]) as T | undefined;
}

function qtyVal(med: any): string {
  // Prescription items can carry quantity as `quantity` (number),
  // `qty` (legacy), or pre-formatted `quantity_dispensed`.
  const v = med?.quantity ?? med?.qty ?? med?.quantity_dispensed;
  if (v === 0) return "0";
  return v ? String(v) : "—";
}

// ── Layout ────────────────────────────────────────────────────────────
const PAGE_W = 210;
const ML = 12;
const MR = 12;
const CW = PAGE_W - ML - MR; // 186
const FOOTER_Y = 285;

// ---------------------------------------------------------------------------
// Render a compact prescription block starting at (ML, startY).
// Returns the Y position right after the block so the caller can stack
// the next one underneath.
// ---------------------------------------------------------------------------
function renderBlock(
  doc: jsPDF,
  rx: PrintPrescriptionData,
  startY: number,
  blockLabel: string, // e.g. "1" or "" for single
  tableFontSize: number,
  isFirst: boolean,
): number {
  const patientName = field<string>(rx, "patientName", "patient_name") ?? "—";
  const patientNumber =
    field<string>(rx, "patientNumber", "patient_number") ?? "—";
  const doctorName = field<string>(rx, "doctorName", "doctor_name") ?? "—";
  const rxNumber =
    field<string>(rx, "prescriptionNumber", "prescription_number") ??
    rx.id.slice(0, 8);
  const items: PrintMedicationItem[] = rx.items ?? rx.medications ?? [];
  const itemCount = items.length;

  let cursorY = startY;

  // ── Separator line before this block (except first) ──────────────
  if (!isFirst) {
    doc.setDrawColor(200);
    doc.setLineWidth(0.4);
    doc.line(ML, cursorY, PAGE_W - MR, cursorY);
    cursorY += 5;
  }

  // ── Block header — one line: label | patient | prescriber ────────
  // Rx number is shown in the page header instead of repeating it here.
  const fs = tableFontSize + 1;
  doc.setFontSize(fs);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(55, 65, 81);
  doc.text(blockLabel, ML, cursorY);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(0);
  doc.text(`${patientName} (${patientNumber})`, ML + 12, cursorY);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(80);
  doc.text(doctorName, ML + 100, cursorY);

  cursorY += 4;

  // ── Medications inline (no full table when possible) ─────────────
  if (itemCount > 0) {
    const tableData = items.map((med, i) => [
      String(i + 1),
      field<string>(med, "medicationName", "medication_name") ?? "—",
      med.dosage ?? "—",
      med.frequency ?? "—",
      med.duration ?? "—",
      qtyVal(med),
      rxNumber,
    ]);

    const cellPad: any =
      tableFontSize < 7 ? { horizontal: 1.2, vertical: 0.8 } : undefined;

    autoTable(doc, {
      startY: cursorY + 1,
      head: [["#", "Medication", "Dosage", "Freq", "Dur.", "Qty", "Rx #"]],
      body: tableData,
      styles: { fontSize: tableFontSize, cellPadding: cellPad },
      headStyles: {
        fillColor: [55, 65, 81],
        textColor: 255,
        fontSize: Math.max(5.5, tableFontSize),
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: ML, right: MR },
      tableWidth: CW,
      pageBreak: "avoid",
    });

    cursorY = (doc as any).lastAutoTable?.finalY ?? cursorY + 6;
  }

  // ── Notes inline ─────────────────────────────────────────────────
  if (rx.notes) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(6.5);
    doc.setTextColor(120);
    const lines = doc.splitTextToSize(`Notes: ${rx.notes}`, CW - 10);
    doc.text(lines, ML + 4, cursorY + 3);
    cursorY += lines.length * 3.5 + 5;
  }

  // ── Pharmacist note ───────────────────────────────────────────────
  if (rx.customNote) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(180, 120, 20);
    doc.text("Pharmacist Note:", ML, cursorY + 2);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    const lines = doc.splitTextToSize(rx.customNote, CW - 10);
    doc.text(lines, ML + 4, cursorY + 10);
    cursorY += lines.length * 3.5 + 10;
  }

  return cursorY + 3; // gap before next block
}

// ---------------------------------------------------------------------------
// Public API — single prescription
// ---------------------------------------------------------------------------
export function printPrescription(rx: PrintPrescriptionData): void {
  const doc = new jsPDF();

  // Page title
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0);
  doc.text("PRESCRIPTION", 105, 18, { align: "center" });

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  const rxDate = formatDate(
    field<string>(rx, "prescription_date", "") ?? rx.createdAt ?? "",
  );
  doc.text(`Date: ${rxDate}`, ML, 27);

  const items: PrintMedicationItem[] = rx.items ?? rx.medications ?? [];
  const fontSize =
    items.length > 14 ? Math.max(5, Math.floor(8 * (14 / items.length))) : 8;

  renderBlock(doc, rx, 36, "", fontSize, true);

  // Footer
  doc.setFontSize(7);
  doc.setTextColor(150);
  doc.text(
    `Generated by HMS Pharmacy — ${new Date().toLocaleString("en-GH")}`,
    105,
    FOOTER_Y,
    { align: "center" },
  );

  openPdf(doc);
}

// ---------------------------------------------------------------------------
// Public API — multiple prescriptions in ONE combined table
//
// Layout:
//   [Title + timestamp]
//   1  Patient A (P001)            Dr. X         Rx: RX-001
//   │  #  │ Medication   │ Dosage │ Freq │ Dur. │ Qty │   Rx #   │
//   ├─────┼──────────────┼────────┼──────┼──────┼─────┼──────────┤
//   │  1  │ Amoxicillin  │ 500mg  │ TID  │ 7d   │ 21  │ RX-001   │
//   │  2  │ Metformin    │ 500mg  │ BID  │ 30d  │ 60  │ RX-002   │
//   └─────┴──────────────┴────────┴──────┴──────┴─────┴──────────┘
// ---------------------------------------------------------------------------
export function printMultiplePrescriptions(
  list: PrintPrescriptionData[],
): void {
  if (list.length === 0) return;

  const doc = new jsPDF();

  // ── Collect all data ────────────────────────────────────────────
  const allMeds: Array<{
    medicationName: string;
    dosage: string;
    frequency: string;
    duration: string;
    quantity: string;
    rxNumber: string;
  }> = [];

  // Use the first prescription for patient/doctor info; aggregate all Rx numbers
  const first = list[0];
  const patientName =
    field<string>(first, "patientName", "patient_name") ?? "—";
  const patientNumber =
    field<string>(first, "patientNumber", "patient_number") ?? "—";
  const doctorName = field<string>(first, "doctorName", "doctor_name") ?? "—";

  const allRxNumbers = list.map(
    (rx) =>
      field<string>(rx, "prescriptionNumber", "prescription_number") ??
      rx.id.slice(0, 8),
  );

  list.forEach((rx) => {
    const rxNumber =
      field<string>(rx, "prescriptionNumber", "prescription_number") ??
      rx.id.slice(0, 8);
    const items: PrintMedicationItem[] = rx.items ?? rx.medications ?? [];

    items.forEach((med) => {
      allMeds.push({
        medicationName:
          field<string>(med, "medicationName", "medication_name") ?? "—",
        dosage: med.dosage ?? "—",
        frequency: med.frequency ?? "—",
        duration: med.duration ?? "—",
        quantity: qtyVal(med),
        rxNumber,
      });
    });
  });

  // ── Document header ─────────────────────────────────────────────
  const facilityName =
    (typeof import.meta !== "undefined" &&
      import.meta.env?.VITE_FACILITY_NAME) ||
    "Pharmacy";

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0);
  doc.text(facilityName, 105, 14, { align: "center" });

  doc.setFontSize(13);
  doc.text("PHARMACY PRESCRIPTIONS", 105, 22, { align: "center" });

  doc.setFontSize(7);
  doc.setTextColor(130);
  doc.text(
    `${new Date().toLocaleString("en-GH")}  |  ${list.length} prescription(s)  |  ${allMeds.length} item(s)`,
    105,
    30,
    { align: "center" },
  );

  // ── Patient header — single block with all Rx numbers ──────────
  const headerFs = 8;
  let cursorY = 38;

  const line1 = `Patient Name: ${patientName}  OPD#: ${patientNumber}`;
  const line2 = `Issued by: ${doctorName}  Rx: ${allRxNumbers.join(", ")}`;

  doc.setFontSize(headerFs);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(0);
  doc.text(line1, ML, cursorY);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(80);
  doc.text(line2, ML, cursorY + headerFs + 1);

  cursorY += (headerFs + 1) * 2 + 6;

  // ── ONE combined medications table ───────────────────────────────
  const medCount = allMeds.length;
  let tableFontSize = 8;
  const availableForTable = FOOTER_Y - cursorY - 8;
  const estimatedRowH = tableFontSize * 0.35 + 3;
  const headerH = 6;
  const totalNeeded = headerH + medCount * estimatedRowH;

  if (totalNeeded > availableForTable) {
    tableFontSize = Math.max(
      4.5,
      Math.floor(((8 * availableForTable) / totalNeeded) * 10) / 10,
    );
  }

  if (medCount > 0) {
    const tableData = allMeds.map((m, i) => [
      String(i + 1),
      m.medicationName,
      m.dosage,
      m.frequency,
      m.duration,
      m.quantity,
      m.rxNumber,
    ]);

    const cellPad: any =
      tableFontSize < 7 ? { horizontal: 1.2, vertical: 0.8 } : undefined;

    autoTable(doc, {
      startY: cursorY + 2,
      head: [["#", "Medication", "Dosage", "Freq", "Dur.", "Qty", "Rx #"]],
      body: tableData,
      styles: { fontSize: tableFontSize, cellPadding: cellPad },
      headStyles: {
        fillColor: [55, 65, 81],
        textColor: 255,
        fontSize: Math.max(5.5, tableFontSize),
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: ML, right: MR },
      tableWidth: CW,
      pageBreak: "avoid",
    });
  }

  // ── Pharmacist note (from first prescription) ────────────────────
  const customNote = list[0]?.customNote;
  if (customNote) {
    const tableEnd = (doc as any).lastAutoTable?.finalY ?? cursorY + 20;
    const noteY = Math.min(tableEnd + 8, FOOTER_Y - 20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(180, 120, 20);
    doc.text("Pharmacist Note:", ML, noteY);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    doc.setFontSize(6.5);
    const lines = doc.splitTextToSize(customNote, CW - 10);
    doc.text(lines, ML + 4, noteY + 5);
  }

  // ── Footer ───────────────────────────────────────────────────────
  doc.setFontSize(7);
  doc.setTextColor(150);
  doc.text(
    `HMS Pharmacy — ${new Date().toLocaleString("en-GH")}`,
    105,
    FOOTER_Y,
    { align: "center" },
  );

  openPdf(doc);
}

// ---------------------------------------------------------------------------
// Open the PDF via hidden iframe (avoids popup blockers)
// ---------------------------------------------------------------------------
function openPdf(doc: jsPDF): void {
  doc.autoPrint();
  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.top = "-9999px";
  iframe.style.left = "-9999px";
  iframe.style.width = "1px";
  iframe.style.height = "1px";
  iframe.src = url;

  iframe.onload = () => {
    try {
      iframe.contentWindow?.print();
    } catch {
      window.open(url);
    }
  };

  document.body.appendChild(iframe);

  setTimeout(() => {
    document.body.removeChild(iframe);
    URL.revokeObjectURL(url);
  }, 30000);
}
