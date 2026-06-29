import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, FileText, Activity, Calendar, AlertCircle, UserCheck, Pill, Scan, Paperclip, ChevronDown, X as XIcon, ClipboardList, ArrowRight, ChevronLeft } from 'lucide-react'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import PageHeader from '@/components/ui/PageHeader'
import DataTable from '@/components/ui/DataTable'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { FormField, Input, Select, Textarea } from '@/components/ui/Form'
import { formatDate, statusColor } from '@/lib/utils'

interface PatientResult {
  id: string
  patient_number: string
  first_name: string
  last_name: string
  date_of_birth?: string
  gender?: string
  phone_number?: string
}

interface DentalRecord {
  id: string
  patientId: string
  patientName?: string
  patientNumber?: string
  procedureType: string
  toothNumber?: string
  diagnosisNotes?: string
  treatmentNotes?: string
  status: string
  visitDate: string
  dentistName?: string
  nextAppointment?: string
}

interface DentalDashboard {
  today_appointments?: number
  pending_followups?: number
  top_procedures?: Array<{ procedure_name: string; count: number }>
}

interface CatalogItem {
  id: string
  procedure_name: string
  procedure_category?: string
}

interface PrescriptionItem {
  medication_name: string
  dosage: string
  frequency: string
  duration?: string
  route?: string
  instructions?: string
}

interface XrayRequest {
  id: string
  imaging_type: string
  notes?: string
  status: string
  requested_at: string
}

interface Attachment {
  id: string
  file_name: string
  file_type: string
  description?: string
  uploaded_at: string
  url: string
}

interface ProcedureActions {
  prescriptions: Array<{ id: string; prescription_number: string; prescription_date: string; notes?: string; items: PrescriptionItem[] }>
  xray_requests: XrayRequest[]
  attachments: Attachment[]
}

type ActionTab = 'prescribe' | 'xray' | 'attach' | null

interface DrugResult {
  id: string
  drug_code: string
  drug_name: string
  generic_name?: string
  brand_name?: string
  drug_category?: string
  dosage_form?: string
  strength?: string
}

interface ToothData {
  id: string
  tooth_number: number
  quadrant: number
  tooth_type?: string
  status: string
  condition_notes?: string
}

interface DentalChartData {
  id: string
  patient_id: string
  chart_date: string
  chart_type: string
  notes?: string
  teeth?: ToothData[]
  procedure_count?: number
}

interface TreatmentPlan {
  id: string
  patient_id: string
  dental_chart_id?: string
  plan_date: string
  diagnosis: string
  treatment_description: string
  estimated_cost?: number
  estimated_duration?: number
  priority: string
  status: string
  notes?: string
  created_by_name?: string
  chart_date?: string
}

type PageTab = 'procedures' | 'charts' | 'plans'

// BPE types
interface BPEExamination {
  id: string
  dental_chart_id: string
  patient_id: string
  examination_date: string
  sextant_1: string | null
  sextant_2: string | null
  sextant_3: string | null
  sextant_4: string | null
  sextant_5: string | null
  sextant_6: string | null
  overall_score: string | null
  clinical_notes: string | null
  treatment_need: string | null
  examined_by_name?: string
}

const BPE_SCORE_OPTIONS = ['0', '1', '2', '3', '4', '1*', '2*', '3*', '4*']

const BPE_SCORE_COLORS: Record<string, string> = {
  '0': 'bg-green-100 border-green-400 text-green-800',
  '1': 'bg-lime-100 border-lime-400 text-lime-800',
  '2': 'bg-yellow-100 border-yellow-400 text-yellow-800',
  '3': 'bg-orange-100 border-orange-400 text-orange-800',
  '4': 'bg-red-100 border-red-400 text-red-800',
  '1*': 'bg-lime-200 border-lime-500 text-lime-900',
  '2*': 'bg-yellow-200 border-yellow-500 text-yellow-900',
  '3*': 'bg-orange-200 border-orange-500 text-orange-900',
  '4*': 'bg-red-200 border-red-500 text-red-900',
}

const BPE_SCORE_DESCRIPTIONS: Record<string, string> = {
  '0': 'Healthy – no pockets >3.5 mm, no bleeding, no calculus',
  '1': 'Bleeding on probing, no pockets >3.5 mm',
  '2': 'Supra- or subgingival calculus/overhangs, no pockets >3.5 mm',
  '3': 'Pocket 3.5–5.5 mm',
  '4': 'Pocket >5.5 mm',
  '*': 'Furcation involvement',
}

const BPE_SEXTANT_LABELS = [
  { key: 'sextant_1', label: 'S1', teeth: '17-14', region: 'Upper Right' },
  { key: 'sextant_2', label: 'S2', teeth: '13-23', region: 'Upper Anterior' },
  { key: 'sextant_3', label: 'S3', teeth: '24-27', region: 'Upper Left' },
  { key: 'sextant_6', label: 'S6', teeth: '44-47', region: 'Lower Right' },
  { key: 'sextant_5', label: 'S5', teeth: '43-33', region: 'Lower Anterior' },
  { key: 'sextant_4', label: 'S4', teeth: '34-37', region: 'Lower Left' },
] as const

// Searchable drug autocomplete for prescription items
interface DrugSearchProps {
  value: string
  onSelect: (drug: DrugResult) => void
  onChange: (val: string) => void
}

function DrugSearch({ value, onSelect, onChange }: Readonly<DrugSearchProps>) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState(value)
  const ref = useRef<HTMLDivElement>(null)

  const { data: results, isFetching } = useQuery<DrugResult[]>({
    queryKey: ['dental', 'drugs', q],
    queryFn: () => api.get('/dental/drugs/search', { params: { q } }).then((r) => r.data.data as DrugResult[]),
    enabled: q.length >= 2,
    staleTime: 30_000,
  })

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    setQ(e.target.value)
    onChange(e.target.value)
    setOpen(true)
  }

  function pick(drug: DrugResult) {
    const label = `${drug.drug_name}${drug.strength ? ` ${drug.strength}` : ''}`
    setQ(label)
    onChange(label)
    onSelect(drug)
    setOpen(false)
  }

  return (
    <div className="relative" ref={ref}>
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
        <input
          className="w-full pl-6 pr-2 py-1.5 border border-gray-200 rounded-lg text-xs outline-none focus:ring-1 focus:ring-green-400 bg-white"
          placeholder="Search medicine…"
          value={q}
          onChange={handleInput}
          onFocus={() => q.length >= 2 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        {isFetching && <span className="absolute right-2 top-1/2 -translate-y-1/2 w-2.5 h-2.5 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />}
      </div>
      {open && results && results.length > 0 && (
        <div className="absolute z-50 left-0 right-0 mt-1 border border-gray-200 rounded-xl shadow-lg bg-white max-h-48 overflow-y-auto">
          {results.map((drug) => (
            <button
              key={drug.id}
              type="button"
              onMouseDown={() => pick(drug)}
              className="w-full text-left px-3 py-2 hover:bg-green-50 border-b border-gray-50 last:border-0"
            >
              <p className="text-xs font-medium text-gray-800">{drug.drug_name}</p>
              <p className="text-[10px] text-gray-400">
                {[drug.generic_name, drug.dosage_form, drug.strength, drug.drug_category].filter(Boolean).join(' · ')}
              </p>
            </button>
          ))}
        </div>
      )}
      {open && q.length >= 2 && results?.length === 0 && !isFetching && (
        <div className="absolute z-50 left-0 right-0 mt-1 border border-gray-100 rounded-xl shadow bg-white p-2 text-xs text-gray-400 text-center">
          No medicines found. Type name manually.
        </div>
      )}
    </div>
  )
}

// Tooth status colour mapping
const TOOTH_STATUS_COLORS: Record<string, string> = {
  Present:   'bg-white border-gray-300 text-gray-600',
  Missing:   'bg-gray-300 border-gray-400 text-gray-500',
  Decayed:   'bg-red-200 border-red-400 text-red-800',
  Filled:    'bg-blue-200 border-blue-400 text-blue-800',
  Crown:     'bg-yellow-200 border-yellow-400 text-yellow-800',
  Bridge:    'bg-purple-200 border-purple-400 text-purple-800',
  Extracted: 'bg-gray-400 border-gray-500 text-white',
  Impacted:  'bg-orange-200 border-orange-400 text-orange-800',
  RootCanal: 'bg-pink-200 border-pink-400 text-pink-800',
}

interface OdontogramProps {
  teeth: ToothData[]
  onToothClick?: (tooth: ToothData) => void
}

function OdontogramDisplay({ teeth, onToothClick }: Readonly<OdontogramProps>) {
  function renderTooth(n: number) {
    const td = teeth.find((t) => t.tooth_number === n)
    const status = td?.status ?? 'Present'
    const colorClass = TOOTH_STATUS_COLORS[status] ?? 'bg-white border-gray-300'
    return (
      <button
        key={n}
        type="button"
        title={`Tooth ${n} — ${status}${td?.condition_notes ? ': ' + td.condition_notes : ''}`}
        onClick={() => td && onToothClick?.(td)}
        className={`w-9 h-9 rounded text-[10px] font-mono font-bold border-2 transition-all hover:scale-110 ${colorClass}`}
      >
        {n}
      </button>
    )
  }
  return (
    <div className="space-y-1">
      <div className="flex justify-center gap-0.5 border-b-2 border-dashed border-gray-200 pb-2">
        {UPPER_RIGHT.map(renderTooth)}
        <span className="w-px mx-1 bg-gray-200" />
        {UPPER_LEFT.map(renderTooth)}
      </div>
      <div className="flex justify-center gap-0.5 pt-2">
        {LOWER_RIGHT.map(renderTooth)}
        <span className="w-px mx-1 bg-gray-200" />
        {LOWER_LEFT.map(renderTooth)}
      </div>
      <div className="flex justify-between text-[10px] text-gray-400 px-1 mt-1">
        <span>Upper Right ←</span><span>→ Upper Left</span>
      </div>
      {/* Legend */}
      <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-gray-100">
        {Object.entries(TOOTH_STATUS_COLORS).map(([s, cls]) => (
          <span key={s} className={`px-2 py-0.5 rounded text-[10px] font-medium border ${cls}`}>{s}</span>
        ))}
      </div>
    </div>
  )
}

// FDI tooth numbering — upper right→left, lower left→right
const UPPER_RIGHT = [18, 17, 16, 15, 14, 13, 12, 11]
const UPPER_LEFT  = [21, 22, 23, 24, 25, 26, 27, 28]
const LOWER_LEFT  = [31, 32, 33, 34, 35, 36, 37, 38]
const LOWER_RIGHT = [48, 47, 46, 45, 44, 43, 42, 41]

interface ToothPickerProps {
  selected: number[]
  onChange: (teeth: number[]) => void
}

function ToothPicker({ selected, onChange }: Readonly<ToothPickerProps>) {
  function toggle(n: number) {
    onChange(selected.includes(n) ? selected.filter((t) => t !== n) : [...selected, n])
  }
  function tooth(n: number) {
    const on = selected.includes(n)
    return (
      <button
        key={n}
        type="button"
        onClick={() => toggle(n)}
        title={`Tooth ${n}`}
        className={`w-8 h-8 rounded text-xs font-mono font-semibold border transition-colors ${
          on
            ? 'bg-blue-600 text-white border-blue-700'
            : 'bg-white text-gray-600 border-gray-300 hover:bg-blue-50 hover:border-blue-400'
        }`}
      >
        {n}
      </button>
    )
  }
  return (
    <div className="space-y-1">
      {/* Upper arch */}
      <div className="flex justify-center gap-0.5 border-b border-dashed border-gray-300 pb-1">
        {UPPER_RIGHT.map(tooth)}
        <span className="w-px mx-1 bg-gray-300" />
        {UPPER_LEFT.map(tooth)}
      </div>
      {/* Lower arch */}
      <div className="flex justify-center gap-0.5 pt-1">
        {LOWER_RIGHT.map(tooth)}
        <span className="w-px mx-1 bg-gray-300" />
        {LOWER_LEFT.map(tooth)}
      </div>
      <div className="flex justify-between text-[10px] text-gray-400 px-1 mt-0.5">
        <span>Upper Right ← →</span><span>← → Upper Left</span>
      </div>
    </div>
  )
}

// Procedure options are loaded from the catalog (UUIDs required by API)

export default function DentalPage() {
  const qc = useQueryClient()
  const [patientId, setPatientId] = useState('')
  const [pageTab, setPageTab] = useState<PageTab>('procedures')
  const [addOpen, setAddOpen] = useState(false)
  const [viewRecord, setViewRecord] = useState<DentalRecord | null>(null)
  const [activeActionTab, setActiveActionTab] = useState<ActionTab>(null)
  const [rxItems, setRxItems] = useState<PrescriptionItem[]>([{ medication_name: '', dosage: '', frequency: '', duration: '', route: 'Oral' }])
  const [uploadFile, setUploadFile] = useState<File | null>(null)

  // Chart/odontogram state
  const [selectedChartId, setSelectedChartId] = useState<string | null>(null)
  const [viewChartOpen, setViewChartOpen] = useState(false)
  const [createChartOpen, setCreateChartOpen] = useState(false)
  const chartForm = useForm()

  // Treatment plan state
  const [addPlanOpen, setAddPlanOpen] = useState(false)
  const [selectedPlanChart, setSelectedPlanChart] = useState<string | null>(null)
  const [editPlanId, setEditPlanId] = useState<string | null>(null)
  const planForm = useForm()

  // Tooth edit state (within chart view)
  const [editTooth, setEditTooth] = useState<ToothData | null>(null)
  const toothForm = useForm()

  // BPE state
  const [bpeOpen, setBpeOpen] = useState(false)
  const [bpeChartId, setBpeChartId] = useState<string | null>(null)
  const bpeForm = useForm()

  // Top patient search bar
  const [topPatientQ, setTopPatientQ] = useState('')
  const [showTopDropdown, setShowTopDropdown] = useState(false)
  const [topSelectedPatient, setTopSelectedPatient] = useState<PatientResult | null>(null)
  const topSearchRef = useRef<HTMLDivElement>(null)

  // Today's appointments
  interface TodayAppointment {
    id: string
    start_time?: string
    end_time?: string
    status: string
    appointment_type?: string
    notes?: string
    patient_id: string
    patient_number: string
    first_name: string
    last_name: string
    gender?: string
    phone_number?: string
    doctor_name?: string
  }
  const { data: todayAppointments = [] } = useQuery<TodayAppointment[]>({
    queryKey: ['dental', 'today-appointments'],
    queryFn: () => api.get('/dental/today-appointments').then((r) => r.data.data as TodayAppointment[]),
    staleTime: 60_000,
    refetchInterval: 120_000,
  })

  // Today's patients
  interface TodayPatient {
    id: string
    patient_number: string
    first_name: string
    last_name: string
    gender?: string
    phone_number?: string
    last_procedure: string
    status: string
    dentist_name?: string
  }
  const { data: todayPatients = [] } = useQuery<TodayPatient[]>({
    queryKey: ['dental', 'today-patients'],
    queryFn: () => api.get('/dental/today-patients').then((r) => r.data.data as TodayPatient[]),
    staleTime: 60_000,
    refetchInterval: 120_000,
  })

  // Patient search state for the modal
  const [modalPatientQ, setModalPatientQ] = useState('')
  const [selectedPatient, setSelectedPatient] = useState<PatientResult | null>(null)
  const [showPatientDropdown, setShowPatientDropdown] = useState(false)
  const patientSearchRef = useRef<HTMLDivElement>(null)
  const [selectedTeeth, setSelectedTeeth] = useState<number[]>([])

  // Procedure catalog (needed for UUID-based procedure_id)
  const { data: catalogData } = useQuery<CatalogItem[]>({
    queryKey: ['dental', 'catalog'],
    queryFn: () => api.get('/dental/catalog').then((r) => r.data.data as CatalogItem[]),
    staleTime: 5 * 60 * 1000,
  })

  const procedureOptions = (catalogData ?? []).map((c) => ({
    value: c.id,
    label: c.procedure_category ? `${c.procedure_name} (${c.procedure_category})` : c.procedure_name,
  }))

  // Dashboard stats
  const { data: dashboardData } = useQuery<DentalDashboard>({
    queryKey: ['dental', 'dashboard'],
    queryFn: () => api.get('/dental/dashboard').then((r) => r.data.data as DentalDashboard),
  })

  // Per-patient procedures (only when a patient ID is provided)
  const { data: proceduresData, isLoading } = useQuery({
    queryKey: ['dental', 'procedures', patientId],
    queryFn: () => api.get(`/dental/patients/${patientId}/procedures`).then((r) => r.data),
    enabled: !!patientId,
  })

  const records: DentalRecord[] = (proceduresData?.data ?? []).map((r: Record<string, unknown>) => {
    const rawFindings = (r.findings ?? r.diagnosis_notes ?? r.clinical_notes) as string | undefined
    // Extract "Additional teeth: X, Y" that was embedded in findings during create
    const additionalTeethMatch = rawFindings?.match(/\nAdditional teeth: ([\d,\s]+)/)
    const primaryTooth = r.tooth_number === null || r.tooth_number === undefined ? undefined : String(r.tooth_number as number)
    const toothNumber = additionalTeethMatch
      ? additionalTeethMatch[1].trim()
      : primaryTooth
    // Remove the "Additional teeth:" line from the displayed findings
    const diagnosisNotes = rawFindings?.replace(/\nAdditional teeth: [\d,\s]+/, '').trim() || undefined
    return {
      id: r.id,
      patientId: r.patient_id ?? patientId,
      patientName: r.patient_name as string | undefined,
      patientNumber: r.patient_number as string | undefined,
      procedureType: (r.procedure_name ?? r.procedure_type) as string,
      toothNumber,
      diagnosisNotes,
      treatmentNotes: (r.notes ?? r.treatment_notes) as string | undefined,
      status: (r.status ?? 'Completed') as string,
      visitDate: (r.procedure_date ?? r.visit_date ?? r.created_at) as string,
      dentistName: (r.performed_by_user as Record<string, unknown> | null)?.name as string | undefined,
      nextAppointment: (r.follow_up_date ?? r.next_appointment) as string | undefined,
    }
  })

  // Top bar patient search
  const { data: topPatientResults } = useQuery<PatientResult[]>({
    queryKey: ['patients', 'search', 'top', topPatientQ],
    queryFn: () =>
      api.get('/patients/search', { params: { q: topPatientQ } }).then((r) => r.data.data as PatientResult[]),
    enabled: topPatientQ.length >= 3,
  })

  // Patient search query (modal) — fires when 3+ chars typed
  const { data: patientSearchResults } = useQuery<PatientResult[]>({
    queryKey: ['patients', 'search', modalPatientQ],
    queryFn: () =>
      api.get('/patients/search', { params: { q: modalPatientQ } }).then((r) => r.data.data as PatientResult[]),
    enabled: modalPatientQ.length >= 3,
  })

  const createMutation = useMutation({
    mutationFn: (payload: unknown) => api.post('/dental/procedures', payload),
    onSuccess: () => {
      toast.success('Dental record created')
      qc.invalidateQueries({ queryKey: ['dental'] })
      setAddOpen(false)
      addForm.reset()
      // Auto-load records for the patient we just created a procedure for
      if (selectedPatient) {
        setTopSelectedPatient(selectedPatient)
        setTopPatientQ(`${selectedPatient.first_name} ${selectedPatient.last_name} (${selectedPatient.patient_number})`)
        setPatientId(selectedPatient.id)
      }
      setSelectedPatient(null)
      setModalPatientQ('')
      setSelectedTeeth([])
    },
    onError: () => toast.error('Failed to create record'),
  })

  // Prescription mutation
  const prescribeMutation = useMutation({
    mutationFn: ({ procedureId, payload }: { procedureId: string; payload: unknown }) =>
      api.post(`/dental/procedures/${procedureId}/prescriptions`, payload),
    onSuccess: () => {
      toast.success('Prescription created')
      qc.invalidateQueries({ queryKey: ['dental', 'actions', viewRecord?.id] })
      setActiveActionTab(null)
      setRxItems([{ medication_name: '', dosage: '', frequency: '', duration: '', route: 'Oral' }])
    },
    onError: () => toast.error('Failed to create prescription'),
  })

  function updateRxItem(idx: number, field: keyof PrescriptionItem, val: string) {
    setRxItems((prev) => { const updated = [...prev]; (updated[idx] as unknown as Record<string, string>)[field] = val; return updated })
  }

  function fillFromDrug(idx: number, drug: DrugResult) {
    setRxItems((prev) => {
      const updated = [...prev]
      updated[idx] = {
        ...updated[idx],
        medication_name: `${drug.drug_name}${drug.strength ? ` ${drug.strength}` : ''}`,
        dosage: drug.strength ?? updated[idx].dosage,
        route: drug.dosage_form?.toLowerCase().includes('inject') ? 'IV'
          : drug.dosage_form?.toLowerCase().includes('topical') ? 'Topical'
          : drug.dosage_form?.toLowerCase().includes('gel') || drug.dosage_form?.toLowerCase().includes('ointment') ? 'Topical'
          : drug.dosage_form?.toLowerCase().includes('sublingual') ? 'Sublingual'
          : 'Oral',
      }
      return updated
    })
  }

  // X-ray request mutation
  const xrayMutation = useMutation({
    mutationFn: ({ procedureId, payload }: { procedureId: string; payload: unknown }) =>
      api.post(`/dental/procedures/${procedureId}/xray-request`, payload),
    onSuccess: () => {
      toast.success('X-ray request submitted')
      qc.invalidateQueries({ queryKey: ['dental', 'actions', viewRecord?.id] })
      setActiveActionTab(null)
      actionForm.reset()
    },
    onError: () => toast.error('Failed to submit X-ray request'),
  })

  // File upload mutation
  const attachMutation = useMutation({
    mutationFn: ({ procedureId, formData }: { procedureId: string; formData: FormData }) =>
      api.post(`/dental/procedures/${procedureId}/attachments`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }),
    onSuccess: () => {
      toast.success('File attached successfully')
      qc.invalidateQueries({ queryKey: ['dental', 'actions', viewRecord?.id] })
      setActiveActionTab(null)
      setUploadFile(null)
      actionForm.reset()
    },
    onError: () => toast.error('Failed to upload file'),
  })

  const addForm = useForm()
  const actionForm = useForm()

  // Procedure actions (prescriptions, X-ray requests, attachments) for the viewed record
  const { data: procedureActions } = useQuery<ProcedureActions>({
    queryKey: ['dental', 'actions', viewRecord?.id],
    queryFn: () => api.get(`/dental/procedures/${viewRecord!.id}/actions`).then((r) => r.data.data as ProcedureActions),
    enabled: !!viewRecord?.id,
  })

  // Patient dental charts
  const { data: chartsData, isLoading: chartsLoading } = useQuery<DentalChartData[]>({
    queryKey: ['dental', 'charts', patientId],
    queryFn: () => api.get(`/dental/patients/${patientId}/charts`).then((r) => r.data.data as DentalChartData[]),
    enabled: !!patientId,
  })

  // Full chart with teeth (for odontogram view)
  const { data: fullChart, isLoading: fullChartLoading } = useQuery<DentalChartData>({
    queryKey: ['dental', 'chart', 'full', selectedChartId],
    queryFn: () => api.get(`/dental/charts/${selectedChartId}/full`).then((r) => r.data.data as DentalChartData),
    enabled: !!selectedChartId,
  })

  // Treatment plans
  const { data: plansData, isLoading: plansLoading } = useQuery<TreatmentPlan[]>({
    queryKey: ['dental', 'plans', patientId],
    queryFn: () => api.get(`/dental/patients/${patientId}/treatment-plans`).then((r) => r.data.data as TreatmentPlan[]),
    enabled: !!patientId,
  })

  // Create chart mutation
  const createChartMutation = useMutation({
    mutationFn: (payload: unknown) => api.post('/dental/charts', payload),
    onSuccess: () => {
      toast.success('Dental chart created')
      qc.invalidateQueries({ queryKey: ['dental', 'charts', patientId] })
      setCreateChartOpen(false)
      chartForm.reset()
    },
    onError: () => toast.error('Failed to create chart'),
  })

  // Update tooth mutation
  const updateToothMutation = useMutation({
    mutationFn: ({ chartId, toothNumber, payload }: { chartId: string; toothNumber: number; payload: unknown }) =>
      api.put(`/dental/charts/${chartId}/teeth/${toothNumber}`, payload),
    onSuccess: () => {
      toast.success('Tooth updated')
      qc.invalidateQueries({ queryKey: ['dental', 'chart', 'full', selectedChartId] })
      setEditTooth(null)
      toothForm.reset()
    },
    onError: () => toast.error('Failed to update tooth'),
  })

  // Create treatment plan mutation
  const createPlanMutation = useMutation({
    mutationFn: ({ chartId, payload }: { chartId: string; payload: unknown }) =>
      api.post(`/dental/charts/${chartId}/treatment-plan`, payload),
    onSuccess: () => {
      toast.success('Treatment plan created')
      qc.invalidateQueries({ queryKey: ['dental', 'plans', patientId] })
      setAddPlanOpen(false)
      planForm.reset()
    },
    onError: () => toast.error('Failed to create treatment plan'),
  })

  // Update treatment plan mutation
  const updatePlanMutation = useMutation({
    mutationFn: ({ planId, payload }: { planId: string; payload: unknown }) =>
      api.patch(`/dental/treatment-plans/${planId}`, payload),
    onSuccess: () => {
      toast.success('Treatment plan updated')
      qc.invalidateQueries({ queryKey: ['dental', 'plans', patientId] })
      setEditPlanId(null)
      planForm.reset()
    },
    onError: () => toast.error('Failed to update treatment plan'),
  })

  // BPE queries and mutations
  const { data: bpeData, isLoading: bpeLoading } = useQuery<BPEExamination[]>({
    queryKey: ['dental', 'bpe', bpeChartId],
    queryFn: () => api.get(`/dental/charts/${bpeChartId}/bpe`).then((r) => r.data.data as BPEExamination[]),
    enabled: !!bpeChartId && bpeOpen,
  })

  const createBPEMutation = useMutation({
    mutationFn: ({ chartId, payload }: { chartId: string; payload: unknown }) =>
      api.post(`/dental/charts/${chartId}/bpe`, payload),
    onSuccess: () => {
      toast.success('BPE examination recorded')
      qc.invalidateQueries({ queryKey: ['dental', 'bpe', bpeChartId] })
      bpeForm.reset()
    },
    onError: () => toast.error('Failed to record BPE examination'),
  })

  function pickPatient(p: PatientResult) {
    setSelectedPatient(p)
    setModalPatientQ(`${p.first_name} ${p.last_name} (${p.patient_number})`)
    setShowPatientDropdown(false)
    addForm.setValue('patientId', p.id)
  }

  const columns = [
    { key: 'patientName', header: 'Patient', render: (r: DentalRecord) => (
      <span>
        {r.patientName ?? '—'}
        {r.patientNumber && <span className="ml-1.5 font-mono text-xs text-blue-600">{r.patientNumber}</span>}
      </span>
    )},
    { key: 'procedureType', header: 'Procedure' },
    { key: 'toothNumber', header: 'Tooth #', render: (r: DentalRecord) => r.toothNumber ?? '—' },
    { key: 'dentistName', header: 'Dentist', render: (r: DentalRecord) => r.dentistName ?? '—' },
    { key: 'status', header: 'Status', render: (r: DentalRecord) => <span className={statusColor(r.status)}>{r.status}</span> },
    { key: 'visitDate', header: 'Date', render: (r: DentalRecord) => formatDate(r.visitDate) },
    { key: 'nextAppointment', header: 'Next Visit', render: (r: DentalRecord) => r.nextAppointment ? formatDate(r.nextAppointment) : '—' },
    { key: 'actions', header: '', render: (r: DentalRecord) => (
      <button onClick={() => setViewRecord(r)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
        <FileText className="w-4 h-4" />
      </button>
    )},
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="Dental Clinic"
        subtitle="Dental procedures and patient records"
        actions={
          <div className="flex items-center gap-2">
            {patientId && pageTab === 'charts' && (
              <Button variant="secondary" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setCreateChartOpen(true)} size="sm">
                New Chart
              </Button>
            )}
            {patientId && pageTab === 'plans' && (
              <Button variant="secondary" leftIcon={<Plus className="w-4 h-4" />} onClick={() => { setAddPlanOpen(true); setSelectedPlanChart(chartsData?.[0]?.id ?? null) }} size="sm">
                New Plan
              </Button>
            )}
            <Button leftIcon={<Plus className="w-4 h-4" />} onClick={() => setAddOpen(true)} size="sm">
              New Record
            </Button>
          </div>
        }
      />

      {/* Dashboard stats */}
      {dashboardData && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="card p-4 flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg"><Calendar className="w-5 h-5 text-blue-600" /></div>
            <div>
              <p className="text-xs text-gray-500">Today's Appointments</p>
              <p className="text-xl font-bold text-gray-900">{dashboardData.today_appointments ?? 0}</p>
            </div>
          </div>
          <div className="card p-4 flex items-center gap-3">
            <div className="p-2 bg-yellow-100 rounded-lg"><AlertCircle className="w-5 h-5 text-yellow-600" /></div>
            <div>
              <p className="text-xs text-gray-500">Pending Follow-ups</p>
              <p className="text-xl font-bold text-gray-900">{dashboardData.pending_followups ?? 0}</p>
            </div>
          </div>
          <div className="card p-4 flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg"><Activity className="w-5 h-5 text-green-600" /></div>
            <div>
              <p className="text-xs text-gray-500">Top Procedure (30d)</p>
              <p className="text-sm font-semibold text-gray-900 truncate">
                {dashboardData.top_procedures?.[0]?.procedure_name ?? '—'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Patient search bar */}
      <div className="card p-3" ref={topSearchRef}>
        <div className="relative flex items-center gap-3">
          <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <input
            value={topPatientQ}
            onChange={(e) => {
              setTopPatientQ(e.target.value)
              setShowTopDropdown(true)
              if (!e.target.value) { setTopSelectedPatient(null); setPatientId('') }
            }}
            onFocus={() => setShowTopDropdown(true)}
            placeholder="Search patient by name or number to view dental records…"
            className="flex-1 text-sm outline-none bg-transparent placeholder-gray-400"
          />
          {topSelectedPatient && <UserCheck className="w-4 h-4 text-green-500 flex-shrink-0" />}
          {patientId && (
            <button onClick={() => { setPatientId(''); setTopPatientQ(''); setTopSelectedPatient(null) }} className="text-xs text-gray-400 hover:text-gray-600 flex-shrink-0">
              Clear
            </button>
          )}
          {showTopDropdown && topPatientQ.length >= 3 && topPatientResults && topPatientResults.length > 0 && (
            <div className="absolute left-0 right-0 top-full z-30 mt-1 border border-gray-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto shadow-lg bg-white">
              {topPatientResults.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setTopSelectedPatient(p)
                    setTopPatientQ(`${p.first_name} ${p.last_name} (${p.patient_number})`)
                    setPatientId(p.id)
                    setShowTopDropdown(false)
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50 text-left text-sm border-b border-gray-50 last:border-0"
                >
                  <span className="font-mono text-xs text-blue-600 w-24 shrink-0">{p.patient_number}</span>
                  <span className="flex-1 font-medium text-gray-800">{p.first_name} {p.last_name}</span>
                  {p.gender && <span className="text-xs text-gray-400">{p.gender}</span>}
                  {p.phone_number && <span className="text-xs text-gray-400 shrink-0">{p.phone_number}</span>}
                </button>
              ))}
            </div>
          )}
          {showTopDropdown && topPatientQ.length >= 3 && topPatientResults?.length === 0 && (
            <div className="absolute left-0 right-0 top-full z-30 mt-1 border border-gray-100 rounded-xl bg-white shadow p-3 text-sm text-gray-400 text-center">
              No patients found
            </div>
          )}
        </div>
        {topSelectedPatient && (
          <p className="text-xs text-green-600 mt-2 flex items-center gap-1">
            <UserCheck className="w-3 h-3" /> Showing records for <strong>{topSelectedPatient.first_name} {topSelectedPatient.last_name}</strong> · {topSelectedPatient.patient_number}
          </p>
        )}
      </div>

      {/* Today's appointments */}
      {todayAppointments.length > 0 && (
        <div className="card p-3 space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <Calendar className="w-4 h-4 text-indigo-500" />
            <span className="text-sm font-semibold text-gray-700">Today's Appointments</span>
            <span className="ml-auto text-xs text-gray-400">{todayAppointments.length} appointment{todayAppointments.length === 1 ? '' : 's'}</span>
          </div>
          <div className="overflow-x-auto rounded-lg border border-gray-100">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-3 py-2 font-medium text-gray-500">Time</th>
                  <th className="px-3 py-2 font-medium text-gray-500">Patient</th>
                  <th className="px-3 py-2 font-medium text-gray-500">Type</th>
                  <th className="px-3 py-2 font-medium text-gray-500">Doctor</th>
                  <th className="px-3 py-2 font-medium text-gray-500">Status</th>
                  <th className="px-3 py-2 font-medium text-gray-500"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {todayAppointments.map((a) => (
                  <tr key={a.id} className="hover:bg-indigo-50 transition-colors">
                    <td className="px-3 py-2 whitespace-nowrap font-medium text-gray-700">
                      {a.start_time ? a.start_time.slice(0, 5) : '—'}
                    </td>
                    <td className="px-3 py-2">
                      <p className="font-medium text-gray-800">{a.first_name} {a.last_name}</p>
                      <p className="font-mono text-blue-600">{a.patient_number}</p>
                    </td>
                    <td className="px-3 py-2 text-gray-500">{a.appointment_type ?? '—'}</td>
                    <td className="px-3 py-2 text-gray-500">{a.doctor_name ? `Dr. ${a.doctor_name}` : '—'}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-block px-1.5 py-0.5 rounded-full text-[10px] font-medium ${statusColor(a.status)}`}>
                        {a.status}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        title="Load patient records"
                        onClick={() => {
                          setTopSelectedPatient({ id: a.patient_id, patient_number: a.patient_number, first_name: a.first_name, last_name: a.last_name, gender: a.gender, phone_number: a.phone_number })
                          setTopPatientQ(`${a.first_name} ${a.last_name} (${a.patient_number})`)
                          setPatientId(a.patient_id)
                          setShowTopDropdown(false)
                        }}
                        className="text-indigo-600 hover:text-indigo-800 underline text-[10px]"
                      >
                        View records
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Today's patients */}
      {todayPatients.length > 0 && (
        <div className="card p-3 space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <Calendar className="w-4 h-4 text-blue-500" />
            <span className="text-sm font-semibold text-gray-700">
              Today's Patients
            </span>
            <span className="ml-auto text-xs text-gray-400">{todayPatients.length} visit{todayPatients.length === 1 ? '' : 's'}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {todayPatients.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setTopSelectedPatient({ id: p.id, patient_number: p.patient_number, first_name: p.first_name, last_name: p.last_name, gender: p.gender, phone_number: p.phone_number })
                  setTopPatientQ(`${p.first_name} ${p.last_name} (${p.patient_number})`)
                  setPatientId(p.id)
                  setShowTopDropdown(false)
                }}
                className={`flex items-start gap-3 p-2.5 rounded-lg border text-left transition-colors hover:bg-blue-50 hover:border-blue-300 ${
                  patientId === p.id ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-white'
                }`}
              >
                <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                  {p.first_name[0]}{p.last_name[0]}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{p.first_name} {p.last_name}</p>
                  <p className="text-xs text-blue-600 font-mono">{p.patient_number}</p>
                  <p className="text-xs text-gray-500 truncate">{p.last_procedure}</p>
                  {p.dentist_name && <p className="text-xs text-gray-400 truncate">Dr. {p.dentist_name}</p>}
                </div>
                <span className={`ml-auto mt-0.5 shrink-0 inline-block px-1.5 py-0.5 rounded-full text-[10px] font-medium ${statusColor(p.status)}`}>
                  {p.status}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Page tabs */}
      {patientId && (
        <div className="flex gap-1 border-b border-gray-200">
          {([
            { key: 'procedures', label: 'Procedures', icon: <FileText className="w-4 h-4" /> },
            { key: 'charts',     label: 'Charts & Odontogram', icon: <ClipboardList className="w-4 h-4" /> },
            { key: 'plans',      label: 'Treatment Plans', icon: <Activity className="w-4 h-4" /> },
          ] as const).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setPageTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                pageTab === tab.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.icon}{tab.label}
            </button>
          ))}
        </div>
      )}

      {/* PROCEDURES TAB */}
      {(!patientId || pageTab === 'procedures') && (
        patientId ? (
          <DataTable columns={columns} data={records} keyField="id" isLoading={isLoading} emptyMessage="No dental records found for this patient" />
        ) : (
          <div className="card p-8 text-center text-gray-400">
            <FileText className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">Search for a patient above to view their dental records</p>
          </div>
        )
      )}

      {/* CHARTS & ODONTOGRAM TAB */}
      {patientId && pageTab === 'charts' && (
        <div className="space-y-4">
          {chartsLoading ? (
            <div className="card p-6 text-center text-gray-400 text-sm">Loading charts…</div>
          ) : !chartsData?.length ? (
            <div className="card p-8 text-center text-gray-400">
              <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm mb-3">No dental charts yet for this patient</p>
              <Button size="sm" onClick={() => setCreateChartOpen(true)}>Create First Chart</Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {chartsData.map((chart) => (
                <div key={chart.id} className="card p-4 space-y-2 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{chart.chart_type} Chart</span>
                    <span className="text-xs text-gray-400">{formatDate(chart.chart_date)}</span>
                  </div>
                  {chart.notes && <p className="text-sm text-gray-600 truncate">{chart.notes}</p>}
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs text-blue-600 font-medium">{chart.procedure_count ?? 0} procedures</span>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => { setSelectedChartId(chart.id); setViewChartOpen(true) }}
                    >
                      View Odontogram
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TREATMENT PLANS TAB */}
      {patientId && pageTab === 'plans' && (
        <div className="space-y-4">
          {plansLoading ? (
            <div className="card p-6 text-center text-gray-400 text-sm">Loading plans…</div>
          ) : !plansData?.length ? (
            <div className="card p-8 text-center text-gray-400">
              <Activity className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm mb-3">No treatment plans yet for this patient</p>
              {chartsData?.length ? (
                <Button size="sm" onClick={() => { setAddPlanOpen(true); setSelectedPlanChart(chartsData[0].id) }}>Create Treatment Plan</Button>
              ) : (
                <p className="text-xs text-gray-400">Create a dental chart first before adding treatments plans</p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {plansData.map((plan) => (
                <div key={plan.id} className="card p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                          plan.status === 'Completed' ? 'bg-green-100 text-green-700' :
                          plan.status === 'In Progress' ? 'bg-blue-100 text-blue-700' :
                          plan.status === 'Approved' ? 'bg-teal-100 text-teal-700' :
                          'bg-yellow-100 text-yellow-700'
                        }`}>{plan.status}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          plan.priority === 'Urgent' ? 'bg-red-100 text-red-700' :
                          plan.priority === 'High' ? 'bg-orange-100 text-orange-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>{plan.priority}</span>
                        <span className="text-xs text-gray-400">{formatDate(plan.plan_date)}</span>
                        {plan.created_by_name && <span className="text-xs text-gray-400">by {plan.created_by_name}</span>}
                      </div>
                      <p className="text-sm font-medium text-gray-800 mb-1 truncate">{plan.diagnosis}</p>
                      <p className="text-sm text-gray-600 line-clamp-2">{plan.treatment_description}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                        {plan.estimated_cost && <span>Est. cost: <strong>₵{Number(plan.estimated_cost).toFixed(2)}</strong></span>}
                        {plan.estimated_duration && <span>Duration: <strong>{plan.estimated_duration} mins</strong></span>}
                      </div>
                      {plan.notes && <p className="text-xs text-gray-400 mt-1 italic">{plan.notes}</p>}
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      {plan.status !== 'Completed' && (
                        <>
                          <button
                            onClick={() => {
                              setEditPlanId(plan.id)
                              planForm.setValue('plan_status', plan.status)
                              planForm.setValue('plan_notes', plan.notes ?? '')
                            }}
                            className="text-xs text-blue-600 hover:underline"
                          >Edit</button>
                          {plan.status !== 'In Progress' && (
                            <button
                              onClick={() => updatePlanMutation.mutate({ planId: plan.id, payload: { status: 'In Progress' } })}
                              className="text-xs text-teal-600 hover:underline"
                            >Start</button>
                          )}
                          <button
                            onClick={() => updatePlanMutation.mutate({ planId: plan.id, payload: { status: 'Completed' } })}
                            className="text-xs text-green-600 hover:underline"
                          >Mark Done</button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <Modal open={addOpen} onClose={() => { setAddOpen(false); setSelectedPatient(null); setModalPatientQ(''); setSelectedTeeth([]) }} title="New Dental Record" size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setAddOpen(false); setSelectedPatient(null); setModalPatientQ(''); setSelectedTeeth([]) }}>Cancel</Button>
            <Button
              onClick={addForm.handleSubmit((d) => {
                if (!selectedPatient) { toast.error('Please select a patient'); return }
                if (!d.procedureType) { toast.error('Please select a procedure'); return }
                const firstTooth = selectedTeeth[0]
                const extraTeeth = selectedTeeth.slice(1)
                const teethNote = extraTeeth.length > 0 ? `\nAdditional teeth: ${[firstTooth, ...extraTeeth].join(', ')}` : ''
                createMutation.mutate({
                  patient_id: selectedPatient.id,
                  procedure_id: d.procedureType,
                  tooth_number: firstTooth ?? undefined,
                  procedure_date: d.visitDate || undefined,
                  findings: d.diagnosisNotes ? `${d.diagnosisNotes}${teethNote}` : (teethNote.trim() || undefined),
                  notes: d.treatmentNotes || undefined,
                  follow_up_date: d.nextAppointment || undefined,
                  follow_up_required: !!d.nextAppointment,
                })
              })}
              isLoading={createMutation.isPending}
            >
              Save Record
            </Button>
          </>
        }
      >
        <form className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Hidden real patient ID field */}
          <input type="hidden" {...addForm.register('patientId', { required: true })} />

          {/* Patient search */}
          <FormField label="Search Patient" required className="sm:col-span-2">
            <div className="relative" ref={patientSearchRef}>
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
              <input
                className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 bg-white"
                placeholder="Type patient name or patient number…"
                value={modalPatientQ}
                onChange={(e) => { setModalPatientQ(e.target.value); setShowPatientDropdown(true); if (!e.target.value) { setSelectedPatient(null); addForm.setValue('patientId', '') } }}
                onFocus={() => setShowPatientDropdown(true)}
              />
              {selectedPatient && (
                <UserCheck className="absolute right-3 top-2.5 w-4 h-4 text-green-500" />
              )}
              {showPatientDropdown && modalPatientQ.length >= 3 && patientSearchResults && patientSearchResults.length > 0 && (
                <div className="absolute z-30 w-full mt-1 border border-gray-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto shadow-lg bg-white">
                  {patientSearchResults.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => pickPatient(p)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50 text-left text-sm border-b border-gray-50 last:border-0"
                    >
                      <span className="font-mono text-xs text-blue-600 w-24 shrink-0">{p.patient_number}</span>
                      <span className="flex-1 font-medium text-gray-800">{p.first_name} {p.last_name}</span>
                      {p.gender && <span className="text-xs text-gray-400">{p.gender}</span>}
                      {p.phone_number && <span className="text-xs text-gray-400 shrink-0">{p.phone_number}</span>}
                    </button>
                  ))}
                </div>
              )}
              {showPatientDropdown && modalPatientQ.length >= 3 && patientSearchResults?.length === 0 && (
                <div className="absolute z-30 w-full mt-1 border border-gray-100 rounded-xl bg-white shadow p-3 text-sm text-gray-400 text-center">
                  No patients found
                </div>
              )}
            </div>
            {selectedPatient && (
              <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                <UserCheck className="w-3 h-3" /> Patient selected: <strong>{selectedPatient.first_name} {selectedPatient.last_name}</strong> · {selectedPatient.patient_number}
              </p>
            )}
          </FormField>
          <FormField label="Procedure Type" required>
            <Select options={procedureOptions} placeholder="Select" {...addForm.register('procedureType')} />
          </FormField>
          <FormField label="Tooth Number (FDI)" className="sm:col-span-2">
            <ToothPicker selected={selectedTeeth} onChange={setSelectedTeeth} />
            {selectedTeeth.length > 0 && (
              <p className="text-xs text-blue-600 mt-1">
                Selected: <strong>{[...selectedTeeth].sort((a, b) => a - b).join(', ')}</strong>
                <button type="button" onClick={() => setSelectedTeeth([])} className="ml-2 text-gray-400 hover:text-red-500">Clear</button>
              </p>
            )}
          </FormField>
          <FormField label="Visit Date">
            <Input type="date" {...addForm.register('visitDate')} />
          </FormField>
          <FormField label="Next Appointment">
            <Input type="date" {...addForm.register('nextAppointment')} />
          </FormField>
          <FormField label="Diagnosis / Notes" className="sm:col-span-2">
            <Textarea {...addForm.register('diagnosisNotes')} />
          </FormField>
          <FormField label="Treatment Notes" className="sm:col-span-2">
            <Textarea {...addForm.register('treatmentNotes')} />
          </FormField>
        </form>
      </Modal>

      {viewRecord && (
        <Modal open={!!viewRecord} onClose={() => { setViewRecord(null); setActiveActionTab(null); setRxItems([{ medication_name: '', dosage: '', frequency: '', duration: '', route: 'Oral' }]); setUploadFile(null) }} title="Dental Record" size="lg">
          <div className="space-y-4 text-sm">
            {/* Record details */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Patient', value: viewRecord.patientName ?? viewRecord.patientId },
                { label: 'Procedure', value: viewRecord.procedureType },
                { label: 'Tooth Number', value: viewRecord.toothNumber ?? '—' },
                { label: 'Status', value: viewRecord.status },
                { label: 'Dentist', value: viewRecord.dentistName ?? '—' },
                { label: 'Visit Date', value: formatDate(viewRecord.visitDate) },
                { label: 'Next Appointment', value: viewRecord.nextAppointment ? formatDate(viewRecord.nextAppointment) : '—' },
              ].map((f) => (
                <div key={f.label}>
                  <p className="text-xs text-gray-400 mb-0.5">{f.label}</p>
                  <p className="font-medium">{f.value}</p>
                </div>
              ))}
            </div>
            {viewRecord.diagnosisNotes && (
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-400 mb-1">Diagnosis Notes</p>
                <p>{viewRecord.diagnosisNotes}</p>
              </div>
            )}
            {viewRecord.treatmentNotes && (
              <div className="p-3 bg-blue-50 rounded-lg">
                <p className="text-xs text-blue-400 mb-1">Treatment Notes</p>
                <p>{viewRecord.treatmentNotes}</p>
              </div>
            )}

            {/* Existing actions summary */}
            {procedureActions && (
              <div className="border border-gray-100 rounded-xl divide-y divide-gray-50">
                {procedureActions.prescriptions.length > 0 && (
                  <div className="p-3">
                    <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1.5"><Pill className="w-3.5 h-3.5 text-green-600" /> Prescriptions ({procedureActions.prescriptions.length})</p>
                    {procedureActions.prescriptions.map((rx) => (
                      <div key={rx.id} className="text-xs text-gray-600 mb-1">
                        <span className="font-mono text-blue-600 mr-2">{rx.prescription_number}</span>
                        {rx.items?.map((item, i) => (
                          <span key={i} className="mr-2">{item.medication_name} {item.dosage} × {item.frequency}{item.duration ? ` (${item.duration})` : ''}</span>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
                {procedureActions.xray_requests.length > 0 && (
                  <div className="p-3">
                    <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1.5"><Scan className="w-3.5 h-3.5 text-purple-600" /> X-ray Requests ({procedureActions.xray_requests.length})</p>
                    {procedureActions.xray_requests.map((xr) => (
                      <div key={xr.id} className="text-xs text-gray-600 flex items-center gap-3">
                        <span className="font-medium">{xr.imaging_type}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${xr.status === 'Pending' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>{xr.status}</span>
                        {xr.notes && <span className="text-gray-400">{xr.notes}</span>}
                      </div>
                    ))}
                  </div>
                )}
                {procedureActions.attachments.length > 0 && (
                  <div className="p-3">
                    <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1.5"><Paperclip className="w-3.5 h-3.5 text-orange-600" /> Attachments ({procedureActions.attachments.length})</p>
                    {procedureActions.attachments.map((att) => (
                      <a key={att.id} href={att.url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-1.5 mb-1">
                        <Paperclip className="w-3 h-3" /> {att.file_name}
                        {att.description && <span className="text-gray-400">— {att.description}</span>}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-2 flex-wrap border-t border-gray-100 pt-3">
              <button
                onClick={() => setActiveActionTab(activeActionTab === 'prescribe' ? null : 'prescribe')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${activeActionTab === 'prescribe' ? 'bg-green-600 text-white border-green-600' : 'border-green-300 text-green-700 hover:bg-green-50'}`}
              >
                <Pill className="w-3.5 h-3.5" /> Prescribe{activeActionTab === 'prescribe' ? <XIcon className="w-3 h-3 ml-0.5" /> : <ChevronDown className="w-3 h-3 ml-0.5" />}
              </button>
              <button
                onClick={() => setActiveActionTab(activeActionTab === 'xray' ? null : 'xray')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${activeActionTab === 'xray' ? 'bg-purple-600 text-white border-purple-600' : 'border-purple-300 text-purple-700 hover:bg-purple-50'}`}
              >
                <Scan className="w-3.5 h-3.5" /> Request X-ray{activeActionTab === 'xray' ? <XIcon className="w-3 h-3 ml-0.5" /> : <ChevronDown className="w-3 h-3 ml-0.5" />}
              </button>
              <button
                onClick={() => setActiveActionTab(activeActionTab === 'attach' ? null : 'attach')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${activeActionTab === 'attach' ? 'bg-orange-600 text-white border-orange-600' : 'border-orange-300 text-orange-700 hover:bg-orange-50'}`}
              >
                <Paperclip className="w-3.5 h-3.5" /> Attach File{activeActionTab === 'attach' ? <XIcon className="w-3 h-3 ml-0.5" /> : <ChevronDown className="w-3 h-3 ml-0.5" />}
              </button>
            </div>

            {/* Prescribe form */}
            {activeActionTab === 'prescribe' && (
              <div className="border border-green-200 rounded-xl p-4 bg-green-50 space-y-3">
                <p className="text-xs font-semibold text-green-700">New Prescription</p>
                {rxItems.map((item, idx) => (
                  <div key={idx} className="bg-white rounded-lg border border-green-100 p-3 space-y-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="sm:col-span-2">
                        <label className="text-[10px] text-gray-500 mb-0.5 block">Medicine <span className="text-red-400">*</span></label>
                        <DrugSearch
                          value={item.medication_name}
                          onChange={(val) => updateRxItem(idx, 'medication_name', val)}
                          onSelect={(drug) => fillFromDrug(idx, drug)}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-500 mb-0.5 block">Dosage <span className="text-red-400">*</span></label>
                        <input
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-green-400 bg-white"
                          placeholder="e.g. 500mg"
                          value={item.dosage}
                          onChange={(e) => updateRxItem(idx, 'dosage', e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-500 mb-0.5 block">Frequency <span className="text-red-400">*</span></label>
                        <input
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-green-400 bg-white"
                          placeholder="e.g. TDS, BD, OD"
                          value={item.frequency}
                          onChange={(e) => updateRxItem(idx, 'frequency', e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-500 mb-0.5 block">Duration</label>
                        <input
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-green-400 bg-white"
                          placeholder="e.g. 5 days"
                          value={item.duration}
                          onChange={(e) => updateRxItem(idx, 'duration', e.target.value)}
                        />
                      </div>
                      <div className="flex items-end gap-2">
                        <div className="flex-1">
                          <label className="text-[10px] text-gray-500 mb-0.5 block">Route</label>
                          <select
                            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-green-400 bg-white"
                            value={item.route}
                            onChange={(e) => updateRxItem(idx, 'route', e.target.value)}
                          >
                            <option value="Oral">Oral</option>
                            <option value="Topical">Topical</option>
                            <option value="IV">IV</option>
                            <option value="IM">IM</option>
                            <option value="Sublingual">Sublingual</option>
                          </select>
                        </div>
                        {rxItems.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setRxItems(rxItems.filter((_, i) => i !== idx))}
                            className="mb-0.5 p-1.5 rounded hover:bg-red-50 text-red-400 hover:text-red-600"
                          ><XIcon className="w-3.5 h-3.5" /></button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setRxItems([...rxItems, { medication_name: '', dosage: '', frequency: '', duration: '', route: 'Oral' }])}
                    className="text-xs text-green-600 hover:text-green-800 font-medium flex items-center gap-0.5"
                  ><Plus className="w-3 h-3" /> Add medication</button>
                  <Button
                    size="sm"
                    variant="primary"
                    isLoading={prescribeMutation.isPending}
                    onClick={() => {
                      const invalid = rxItems.find((it) => !it.medication_name || !it.dosage || !it.frequency)
                      if (invalid) { toast.error('Fill in medication name, dosage, and frequency for all items'); return }
                      prescribeMutation.mutate({ procedureId: viewRecord!.id, payload: { items: rxItems } })
                    }}
                    className="ml-auto"
                  >Save Prescription</Button>
                </div>
              </div>
            )}

            {/* X-ray request form */}
            {activeActionTab === 'xray' && (
              <form
                className="border border-purple-200 rounded-xl p-4 bg-purple-50 space-y-3"
                onSubmit={actionForm.handleSubmit((d) => {
                  xrayMutation.mutate({ procedureId: viewRecord!.id, payload: { imaging_type: d.imaging_type, notes: d.xray_notes || undefined } })
                })}
              >
                <p className="text-xs font-semibold text-purple-700">X-ray / Imaging Request</p>
                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Imaging Type" required>
                    <Select
                      {...actionForm.register('imaging_type', { required: true })}
                      options={[
                        { value: 'Periapical', label: 'Periapical' },
                        { value: 'Bitewing', label: 'Bitewing' },
                        { value: 'Panoramic', label: 'Panoramic (OPG)' },
                        { value: 'CBCT', label: 'CBCT (3D)' },
                        { value: 'Occlusal', label: 'Occlusal' },
                      ]}
                      placeholder="Select type"
                    />
                  </FormField>
                  <FormField label="Notes">
                    <Input placeholder="Clinical indication…" {...actionForm.register('xray_notes')} />
                  </FormField>
                </div>
                <div className="flex justify-end">
                  <Button size="sm" type="submit" isLoading={xrayMutation.isPending}>Submit Request</Button>
                </div>
              </form>
            )}

            {/* Attach file form */}
            {activeActionTab === 'attach' && (
              <div className="border border-orange-200 rounded-xl p-4 bg-orange-50 space-y-3">
                <p className="text-xs font-semibold text-orange-700">Attach X-ray / Result File</p>
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">File (JPG, PNG, PDF — max 20MB)</label>
                    <input
                      type="file"
                      accept=".jpg,.jpeg,.png,.pdf"
                      className="text-xs w-full border border-gray-200 rounded-lg p-2 bg-white"
                      onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                    />
                  </div>
                  <FormField label="Description (optional)">
                    <Input placeholder="e.g. Post-op panoramic X-ray" {...actionForm.register('attach_description')} />
                  </FormField>
                </div>
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    isLoading={attachMutation.isPending}
                    onClick={() => {
                      if (!uploadFile) { toast.error('Please select a file'); return }
                      const fd = new FormData()
                      fd.append('file', uploadFile)
                      const desc = actionForm.getValues('attach_description')
                      if (desc) fd.append('description', desc)
                      attachMutation.mutate({ procedureId: viewRecord!.id, formData: fd })
                    }}
                  >Upload File</Button>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* ── Create Chart modal ── */}
      <Modal
        open={createChartOpen}
        onClose={() => { setCreateChartOpen(false); chartForm.reset() }}
        title="Create Dental Chart"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setCreateChartOpen(false); chartForm.reset() }}>Cancel</Button>
            <Button
              isLoading={createChartMutation.isPending}
              onClick={chartForm.handleSubmit((d) => {
                createChartMutation.mutate({
                  patient_id: patientId,
                  chart_type: d.chart_type || 'Adult',
                  notes: d.chart_notes || undefined,
                })
              })}
            >Create Chart</Button>
          </>
        }
      >
        <form className="space-y-4">
          <FormField label="Chart Type" required>
            <Select
              {...chartForm.register('chart_type')}
              options={[
                { value: 'Adult', label: 'Adult (32 teeth)' },
                { value: 'Child', label: 'Child (20 deciduous)' },
              ]}
              placeholder="Select"
            />
          </FormField>
          <FormField label="Notes (optional)">
            <Textarea placeholder="Initial clinical notes…" {...chartForm.register('chart_notes')} />
          </FormField>
        </form>
      </Modal>

      {/* ── Odontogram view modal ── */}
      <Modal
        open={viewChartOpen}
        onClose={() => { setViewChartOpen(false); setSelectedChartId(null); setEditTooth(null) }}
        title="Dental Chart — Odontogram"
        size="xl"
      >
        {fullChartLoading ? (
          <div className="text-center py-8 text-gray-400 text-sm">Loading odontogram…</div>
        ) : fullChart?.teeth ? (
          <div className="space-y-5">
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>{fullChart.chart_type} chart · {formatDate(fullChart.chart_date)}</span>
              <span>{fullChart.teeth.length} teeth loaded</span>
            </div>
            <OdontogramDisplay
              teeth={fullChart.teeth}
              onToothClick={(td) => {
                setEditTooth(td)
                toothForm.setValue('tooth_status', td.status)
                toothForm.setValue('tooth_notes', td.condition_notes ?? '')
              }}
            />
            <p className="text-xs text-gray-400 text-center">Click any tooth to update its status</p>

            {/* Edit tooth inline */}
            {editTooth && (
              <div className="border border-blue-200 rounded-xl p-4 bg-blue-50 space-y-3">
                <p className="text-sm font-semibold text-blue-700">Update Tooth {editTooth.tooth_number} ({editTooth.tooth_type})</p>
                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Status" required>
                    <Select
                      {...toothForm.register('tooth_status')}
                      options={Object.keys(TOOTH_STATUS_COLORS).map((s) => ({ value: s, label: s }))}
                      placeholder="Select status"
                    />
                  </FormField>
                  <FormField label="Condition Notes">
                    <Input placeholder="e.g. Mesial caries" {...toothForm.register('tooth_notes')} />
                  </FormField>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setEditTooth(null)}>Cancel</Button>
                  <Button
                    size="sm"
                    isLoading={updateToothMutation.isPending}
                    onClick={toothForm.handleSubmit((d) => {
                      if (!d.tooth_status) { toast.error('Select a status'); return }
                      updateToothMutation.mutate({
                        chartId: fullChart.id,
                        toothNumber: editTooth.tooth_number,
                        payload: { status: d.tooth_status, condition_notes: d.tooth_notes || undefined },
                      })
                    })}
                  >Save</Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-400 text-sm">Chart data unavailable</div>
        )}

        {/* Next: BPE button */}
        {fullChart?.teeth && (
          <div className="flex justify-end pt-4 border-t border-gray-100">
            <Button
              size="sm"
              onClick={() => {
                setBpeChartId(fullChart.id)
                setBpeOpen(true)
                setViewChartOpen(false)
                setEditTooth(null)
              }}
              className="gap-1.5"
            >
              Next: BPE Examination
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </Modal>

      {/* ── BPE (Basic Periodontal Examination) modal ── */}
      <Modal
        open={bpeOpen}
        onClose={() => { setBpeOpen(false); setBpeChartId(null); bpeForm.reset() }}
        title="BPE — Basic Periodontal Examination"
        size="xl"
      >
        <div className="space-y-6">
          {/* Back to Odontogram link */}
          <button
            type="button"
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 transition-colors"
            onClick={() => {
              setBpeOpen(false)
              if (bpeChartId) {
                setSelectedChartId(bpeChartId)
                setViewChartOpen(true)
              }
            }}
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Back to Odontogram
          </button>

          {/* BPE Scoring Guide */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-2">
            <p className="text-xs font-semibold text-gray-700">BPE Scoring Guide</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {Object.entries(BPE_SCORE_DESCRIPTIONS).map(([code, desc]) => (
                <div key={code} className="flex items-start gap-1.5 text-[10px] text-gray-600">
                  <span className={`inline-flex items-center justify-center w-5 h-5 rounded font-bold text-[10px] border flex-shrink-0 ${BPE_SCORE_COLORS[code] ?? 'bg-gray-100 border-gray-300 text-gray-700'}`}>
                    {code}
                  </span>
                  <span>{desc}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Sextant Grid — record new BPE */}
          <div className="space-y-3">
            <p className="text-sm font-semibold text-gray-700">Record New Examination</p>

            {/* Visual sextant grid mimicking mouth layout */}
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              {/* Upper row */}
              <div className="grid grid-cols-3 border-b-2 border-dashed border-gray-300">
                {BPE_SEXTANT_LABELS.slice(0, 3).map((s) => {
                  const val = bpeForm.watch(s.key as 'sextant_1' | 'sextant_2' | 'sextant_3') as string | undefined
                  return (
                    <div key={s.key} className={`p-3 ${s.key === 'sextant_2' ? 'border-x border-gray-200' : ''}`}>
                      <div className="text-center space-y-1.5">
                        <p className="text-[10px] text-gray-500 font-medium">{s.region}</p>
                        <p className="text-[10px] text-gray-400">Teeth {s.teeth}</p>
                        <div className="flex flex-wrap justify-center gap-1">
                          {BPE_SCORE_OPTIONS.map((score) => (
                            <button
                              key={score}
                              type="button"
                              title={`Score ${score}`}
                              onClick={() => bpeForm.setValue(s.key, val === score ? '' : score)}
                              className={`w-7 h-7 rounded text-[10px] font-bold border-2 transition-all hover:scale-110 ${
                                val === score
                                  ? BPE_SCORE_COLORS[score] + ' ring-2 ring-offset-1 ring-blue-400'
                                  : 'bg-white border-gray-200 text-gray-400 hover:border-gray-400'
                              }`}
                            >
                              {score}
                            </button>
                          ))}
                        </div>
                        {val && (
                          <p className="text-[10px] text-gray-500">{BPE_SCORE_DESCRIPTIONS[val.replace('*', '')] ?? ''}</p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
              {/* Lower row — note: ordering matches dental view (right, anterior, left) */}
              <div className="grid grid-cols-3">
                {BPE_SEXTANT_LABELS.slice(3, 6).map((s) => {
                  const val = bpeForm.watch(s.key as 'sextant_4' | 'sextant_5' | 'sextant_6') as string | undefined
                  return (
                    <div key={s.key} className={`p-3 ${s.key === 'sextant_5' ? 'border-x border-gray-200' : ''}`}>
                      <div className="text-center space-y-1.5">
                        <p className="text-[10px] text-gray-500 font-medium">{s.region}</p>
                        <p className="text-[10px] text-gray-400">Teeth {s.teeth}</p>
                        <div className="flex flex-wrap justify-center gap-1">
                          {BPE_SCORE_OPTIONS.map((score) => (
                            <button
                              key={score}
                              type="button"
                              title={`Score ${score}`}
                              onClick={() => bpeForm.setValue(s.key, val === score ? '' : score)}
                              className={`w-7 h-7 rounded text-[10px] font-bold border-2 transition-all hover:scale-110 ${
                                val === score
                                  ? BPE_SCORE_COLORS[score] + ' ring-2 ring-offset-1 ring-blue-400'
                                  : 'bg-white border-gray-200 text-gray-400 hover:border-gray-400'
                              }`}
                            >
                              {score}
                            </button>
                          ))}
                        </div>
                        {val && (
                          <p className="text-[10px] text-gray-500">{BPE_SCORE_DESCRIPTIONS[val.replace('*', '')] ?? ''}</p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <FormField label="Clinical Notes">
              <Textarea placeholder="Additional periodontal observations…" {...bpeForm.register('bpe_notes')} />
            </FormField>

            <div className="flex justify-end">
              <Button
                size="sm"
                isLoading={createBPEMutation.isPending}
                onClick={bpeForm.handleSubmit((d) => {
                  if (!bpeChartId) { toast.error('No chart selected'); return }
                  const hasScore = [d.sextant_1, d.sextant_2, d.sextant_3, d.sextant_4, d.sextant_5, d.sextant_6].some(Boolean)
                  if (!hasScore) { toast.error('Record at least one sextant score'); return }
                  createBPEMutation.mutate({
                    chartId: bpeChartId,
                    payload: {
                      sextant_1: d.sextant_1 || undefined,
                      sextant_2: d.sextant_2 || undefined,
                      sextant_3: d.sextant_3 || undefined,
                      sextant_4: d.sextant_4 || undefined,
                      sextant_5: d.sextant_5 || undefined,
                      sextant_6: d.sextant_6 || undefined,
                      clinical_notes: d.bpe_notes || undefined,
                    },
                  })
                })}
              >Record BPE</Button>
            </div>
          </div>

          {/* Previous BPE results */}
          <div className="space-y-3">
            <p className="text-sm font-semibold text-gray-700">Previous BPE Examinations</p>
            {bpeLoading ? (
              <div className="text-center py-4 text-gray-400 text-sm">Loading…</div>
            ) : bpeData && bpeData.length > 0 ? (
              <div className="space-y-3">
                {bpeData.map((bpe) => (
                  <div key={bpe.id} className="border border-gray-200 rounded-xl p-4 space-y-2 bg-white">
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>{formatDate(bpe.examination_date)}</span>
                      <span>{bpe.examined_by_name ?? '—'}</span>
                    </div>
                    {/* Sextant scores in grid */}
                    <div className="grid grid-cols-6 gap-1">
                      {(['sextant_1', 'sextant_2', 'sextant_3', 'sextant_6', 'sextant_5', 'sextant_4'] as const).map((k, i) => {
                        const score = bpe[k]
                        const label = BPE_SEXTANT_LABELS[i]
                        return (
                          <div key={k} className="text-center">
                            <p className="text-[9px] text-gray-400 mb-0.5">{label.label}</p>
                            <span className={`inline-flex items-center justify-center w-7 h-7 rounded text-xs font-bold border ${score ? BPE_SCORE_COLORS[score] ?? 'bg-gray-100 border-gray-300' : 'bg-gray-50 border-gray-200 text-gray-300'}`}>
                              {score ?? '—'}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500">
                        Overall: <span className={`font-bold ${bpe.overall_score ? 'text-gray-800' : 'text-gray-400'}`}>{bpe.overall_score ?? '—'}</span>
                      </span>
                      {bpe.treatment_need && (
                        <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full text-[10px] font-medium">
                          {bpe.treatment_need}
                        </span>
                      )}
                    </div>
                    {bpe.clinical_notes && (
                      <p className="text-xs text-gray-500 italic">{bpe.clinical_notes}</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4 text-gray-400 text-sm">No previous BPE examinations</div>
            )}
          </div>
        </div>
      </Modal>

      {/* ── New Treatment Plan modal ── */}
      <Modal
        open={addPlanOpen}
        onClose={() => { setAddPlanOpen(false); planForm.reset() }}
        title="New Treatment Plan"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setAddPlanOpen(false); planForm.reset() }}>Cancel</Button>
            <Button
              isLoading={createPlanMutation.isPending}
              onClick={planForm.handleSubmit((d) => {
                if (!selectedPlanChart) { toast.error('No chart selected'); return }
                createPlanMutation.mutate({
                  chartId: selectedPlanChart,
                  payload: {
                    diagnosis: d.diagnosis,
                    treatment_description: d.treatment_description,
                    estimated_cost: d.estimated_cost ? Number(d.estimated_cost) : undefined,
                    estimated_duration: d.estimated_duration ? Number(d.estimated_duration) : undefined,
                    priority: d.priority || 'Normal',
                    notes: d.plan_notes || undefined,
                  },
                })
              })}
            >Save Plan</Button>
          </>
        }
      >
        <form className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {chartsData && chartsData.length > 0 && (
            <FormField label="Link to Chart" className="sm:col-span-2">
              <Select
                value={selectedPlanChart ?? ''}
                onChange={(e) => setSelectedPlanChart(e.target.value)}
                options={chartsData.map((c) => ({ value: c.id, label: `${c.chart_type} chart — ${formatDate(c.chart_date)}` }))}
                placeholder="Select chart"
              />
            </FormField>
          )}
          <FormField label="Diagnosis" required className="sm:col-span-2">
            <Textarea placeholder="Clinical diagnosis…" {...planForm.register('diagnosis', { required: true })} />
          </FormField>
          <FormField label="Treatment Description" required className="sm:col-span-2">
            <Textarea placeholder="Planned treatment details…" {...planForm.register('treatment_description', { required: true })} />
          </FormField>
          <FormField label="Estimated Cost (₵)">
            <Input type="number" step="0.01" placeholder="0.00" {...planForm.register('estimated_cost')} />
          </FormField>
          <FormField label="Est. Duration (mins)">
            <Input type="number" placeholder="60" {...planForm.register('estimated_duration')} />
          </FormField>
          <FormField label="Priority">
            <Select
              {...planForm.register('priority')}
              options={[
                { value: 'Low', label: 'Low' },
                { value: 'Normal', label: 'Normal' },
                { value: 'High', label: 'High' },
                { value: 'Urgent', label: 'Urgent' },
              ]}
              placeholder="Normal"
            />
          </FormField>
          <FormField label="Notes">
            <Input placeholder="Additional notes…" {...planForm.register('plan_notes')} />
          </FormField>
        </form>
      </Modal>

      {/* ── Edit Treatment Plan modal ── */}
      {editPlanId && (
        <Modal
          open={!!editPlanId}
          onClose={() => { setEditPlanId(null); planForm.reset() }}
          title="Update Treatment Plan"
          size="sm"
          footer={
            <>
              <Button variant="secondary" onClick={() => { setEditPlanId(null); planForm.reset() }}>Cancel</Button>
              <Button
                isLoading={updatePlanMutation.isPending}
                onClick={planForm.handleSubmit((d) => {
                  updatePlanMutation.mutate({
                    planId: editPlanId,
                    payload: { status: d.plan_status, notes: d.plan_notes || undefined },
                  })
                })}
              >Update</Button>
            </>
          }
        >
          <form className="space-y-4">
            <FormField label="Status" required>
              <Select
                {...planForm.register('plan_status')}
                options={[
                  { value: 'Active', label: 'Active (Proposed)' },
                  { value: 'Approved', label: 'Approved' },
                  { value: 'In Progress', label: 'In Progress' },
                  { value: 'Completed', label: 'Completed' },
                  { value: 'Cancelled', label: 'Cancelled' },
                ]}
                placeholder="Select"
              />
            </FormField>
            <FormField label="Notes">
              <Textarea placeholder="Progress notes…" {...planForm.register('plan_notes')} />
            </FormField>
          </form>
        </Modal>
      )}
    </div>
  )
}
