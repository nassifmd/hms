import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, FileText, Eye, Calendar, ClipboardList, Package, X, CheckCircle, Pill, Trash2 } from 'lucide-react'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import PageHeader from '@/components/ui/PageHeader'
import DataTable from '@/components/ui/DataTable'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { FormField, Input, Select, Textarea } from '@/components/ui/Form'
import { formatDate } from '@/lib/utils'

// ── Types ────────────────────────────────────────────────────────────────────

interface PatientResult {
  id: string
  patient_number: string
  first_name: string
  last_name: string
  gender?: string
  phone_number?: string
}

interface EyeExam {
  id: string
  patient_id: string
  examination_date: string
  examiner_name?: string
  va_distance_right_uncorrected?: string
  va_distance_left_uncorrected?: string
  va_distance_right_corrected?: string
  va_distance_left_corrected?: string
  sphere_right?: number
  sphere_left?: number
  cylinder_right?: number
  cylinder_left?: number
  axis_right?: number
  axis_left?: number
  iop_right?: number
  iop_left?: number
  iop_method?: string
  diagnosis_right?: string
  diagnosis_left?: string
  diagnosis_binocular?: string
  treatment_plan?: string
  glasses_prescribed?: boolean
  follow_up_required?: boolean
  follow_up_period?: string
  notes?: string
}

interface EyeRx {
  id: string
  patient_id: string
  eye_examination_id?: string
  prescription_date: string
  glasses_type?: string
  lens_type?: string
  distance_sphere_right?: number
  distance_sphere_left?: number
  distance_cylinder_right?: number
  distance_cylinder_left?: number
  distance_axis_right?: number
  distance_axis_left?: number
  near_sphere_right?: number
  near_sphere_left?: number
  pupil_distance?: number
  notes?: string
  is_dispensed?: boolean
  dispensed_date?: string
}

interface InventoryItem {
  id: string
  item_type: string
  item_code?: string
  item_name: string
  brand?: string
  model?: string
  color?: string
  quantity_on_hand: number
  selling_price?: number
  reorder_level?: number
  is_active: boolean
}

interface EyeDashboard {
  today_appointments?: number
  pending_prescriptions?: number
  exams_last_30_days?: number
  average_iop?: number
}

interface MedicinePrescription {
  id: string
  prescription_number: string
  prescription_date: string
  doctor_name?: string
  is_dispensed: boolean
  notes?: string
  visit_date?: string
  items?: { medication_name: string; dosage?: string; quantity?: number }[]
}

interface PatientVisit {
  id: string
  visit_number: string
  visit_date: string
  visit_type?: string
  department_name?: string
}

interface DrugResult {
  id: string
  drug_code: string
  drug_name: string
  dosage_form?: string
  strength?: string
}

interface MedItem {
  medication_name: string
  dosage: string
  frequency: string
  duration: string
  route: string
  quantity: string
  instructions: string
}

// ── Constants ────────────────────────────────────────────────────────────────

const glassesTypes = [
  { value: 'Single Vision', label: 'Single Vision' },
  { value: 'Bifocal', label: 'Bifocal' },
  { value: 'Progressive', label: 'Progressive' },
]

const inventoryTypes = [
  { value: 'Frame', label: 'Frame' },
  { value: 'Lens', label: 'Lens' },
  { value: 'Contact Lens', label: 'Contact Lens' },
  { value: 'Solution', label: 'Solution' },
]

const iopMethods = [
  { value: 'Non-Contact', label: 'Non-Contact (Air Puff)' },
  { value: 'Goldmann', label: 'Goldmann Applanation' },
  { value: 'Rebound', label: 'Rebound' },
]

function fmtRefraction(s?: number, c?: number, a?: number): string {
  if (s == null) return '—'
  const sph = `${s > 0 ? '+' : ''}${Number(s).toFixed(2)}`
  const cyl = c == null ? '—' : Number(c).toFixed(2)
  return `${sph} / ${cyl} × ${a ?? '—'}`
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function EyeClinicPage() {
  const qc = useQueryClient()

  // Page-level tab
  const [pageTab, setPageTab] = useState<'records' | 'inventory'>('records')

  // Patient search
  const [searchInput, setSearchInput] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [selectedPatient, setSelectedPatient] = useState<PatientResult | null>(null)
  const searchRef = useRef<HTMLDivElement>(null)

  // Record sub-tab
  const [recordTab, setRecordTab] = useState<'examinations' | 'prescriptions' | 'medicine'>('examinations')

  // Modals
  const [examModal, setExamModal] = useState(false)
  const [rxModal, setRxModal] = useState(false)
  const [invModal, setInvModal] = useState(false)
  const [medRxModal, setMedRxModal] = useState(false)
  const [viewExam, setViewExam] = useState<EyeExam | null>(null)
  const [viewRx, setViewRx] = useState<EyeRx | null>(null)
  const [viewMedRx, setViewMedRx] = useState<MedicinePrescription | null>(null)

  // Medicine Rx form state
  const [medItems, setMedItems] = useState<MedItem[]>([{ medication_name: '', dosage: '', frequency: '', duration: '', route: '', quantity: '', instructions: '' }])
  const [drugSearch, setDrugSearch] = useState('')
  const [debouncedDrugSearch, setDebouncedDrugSearch] = useState('')
  const [drugDropdownIdx, setDrugDropdownIdx] = useState<number | null>(null)
  const [selectedVisitId, setSelectedVisitId] = useState('')
  // Medicine Rx modal — own patient search (independent of main page search)
  const [medRxPatientInput, setMedRxPatientInput] = useState('')
  const [medRxPatientDebounced, setMedRxPatientDebounced] = useState('')
  const [medRxShowPatientDrop, setMedRxShowPatientDrop] = useState(false)
  const [medRxPatient, setMedRxPatient] = useState<PatientResult | null>(null)
  const medRxPatientRef = useRef<HTMLDivElement>(null)

  // Inventory filters
  const [invSearch, setInvSearch] = useState('')
  const [invType, setInvType] = useState('')

  // ── Debounce patient search ──────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput), 300)
    return () => clearTimeout(t)
  }, [searchInput])

  // ── Debounce drug search ─────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setDebouncedDrugSearch(drugSearch), 350)
    return () => clearTimeout(t)
  }, [drugSearch])

  // ── Debounce med-rx patient search ───────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setMedRxPatientDebounced(medRxPatientInput), 300)
    return () => clearTimeout(t)
  }, [medRxPatientInput])

  // ── Close med-rx patient dropdown on outside click ───────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (medRxPatientRef.current && !medRxPatientRef.current.contains(e.target as Node)) {
        setMedRxShowPatientDrop(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ── Queries ──────────────────────────────────────────────────────────────

  const { data: dashboardData } = useQuery<EyeDashboard>({
    queryKey: ['eye', 'dashboard'],
    queryFn: () => api.get('/eye/dashboard').then((r) => r.data.data as EyeDashboard),
  })

  const { data: patientResults } = useQuery<PatientResult[]>({
    queryKey: ['patients', 'search', debouncedSearch],
    queryFn: () =>
      api.get('/patients/search', { params: { q: debouncedSearch } })
        .then((r) => (r.data.data ?? []) as PatientResult[]),
    enabled: debouncedSearch.length >= 3 && !selectedPatient,
  })

  const { data: examsData, isLoading: examsLoading } = useQuery({
    queryKey: ['eye', 'examinations', selectedPatient?.id],
    queryFn: () =>
      api.get(`/eye/patients/${selectedPatient!.id}/examinations`).then((r) => (r.data.data ?? []) as EyeExam[]),
    enabled: !!selectedPatient,
  })

  const { data: rxData, isLoading: rxLoading } = useQuery({
    queryKey: ['eye', 'prescriptions', selectedPatient?.id],
    queryFn: () =>
      api.get(`/eye/patients/${selectedPatient!.id}/prescriptions`).then((r) => (r.data.data ?? []) as EyeRx[]),
    enabled: !!selectedPatient && recordTab === 'prescriptions',
  })

  const { data: medRxData, isLoading: medRxLoading } = useQuery({
    queryKey: ['clinical', 'prescriptions', selectedPatient?.id],
    queryFn: () =>
      api.get(`/clinical/patients/${selectedPatient!.id}/prescriptions`).then((r) => (r.data.data ?? []) as MedicinePrescription[]),
    enabled: !!selectedPatient && recordTab === 'medicine',
  })

  const { data: medRxPatientResults } = useQuery<PatientResult[]>({
    queryKey: ['patients', 'search', 'medRx', medRxPatientDebounced],
    queryFn: () =>
      api.get('/patients/search', { params: { q: medRxPatientDebounced } })
        .then((r) => (r.data.data ?? []) as PatientResult[]),
    enabled: medRxPatientDebounced.length >= 3 && !medRxPatient,
  })

  const { data: patientVisits } = useQuery({
    queryKey: ['clinical', 'visits', medRxPatient?.id],
    queryFn: () =>
      api.get(`/clinical/patients/${medRxPatient!.id}/visits`).then((r) => (r.data.data ?? []) as PatientVisit[]),
    enabled: !!medRxPatient && medRxModal,
  })

  const { data: drugResults } = useQuery({
    queryKey: ['pharmacy', 'drugs', debouncedDrugSearch],
    queryFn: () =>
      api.get('/pharmacy/drugs/search', { params: { q: debouncedDrugSearch } }).then((r) => (r.data.data ?? []) as DrugResult[]),
    enabled: debouncedDrugSearch.length >= 2,
  })

  const { data: inventoryData, isLoading: invLoading } = useQuery({
    queryKey: ['eye', 'inventory', invType, invSearch],
    queryFn: () =>
      api.get('/eye/inventory', {
        params: {
          item_type: invType || undefined,
          search: invSearch || undefined,
        },
      }).then((r) => (r.data.data ?? []) as InventoryItem[]),
    enabled: pageTab === 'inventory',
  })

  // ── Mutations ─────────────────────────────────────────────────────────────

  const examForm = useForm()
  const rxForm = useForm()
  const invForm = useForm()
  const medRxForm = useForm()

  const createExam = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post('/eye/examinations', payload),
    onSuccess: () => {
      toast.success('Eye examination recorded')
      qc.invalidateQueries({ queryKey: ['eye', 'examinations', selectedPatient?.id] })
      qc.invalidateQueries({ queryKey: ['eye', 'dashboard'] })
      setExamModal(false)
      examForm.reset()
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Failed to create examination'
      toast.error(msg)
    },
  })

  const createRx = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post('/eye/prescriptions', payload),
    onSuccess: () => {
      toast.success('Glasses prescription created')
      qc.invalidateQueries({ queryKey: ['eye', 'prescriptions', selectedPatient?.id] })
      qc.invalidateQueries({ queryKey: ['eye', 'dashboard'] })
      setRxModal(false)
      rxForm.reset()
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Failed to create prescription'
      toast.error(msg)
    },
  })

  const dispenseRx = useMutation({
    mutationFn: (id: string) => api.put(`/eye/prescriptions/${id}/dispense`, {}),
    onSuccess: () => {
      toast.success('Glasses marked as dispensed')
      qc.invalidateQueries({ queryKey: ['eye', 'prescriptions', selectedPatient?.id] })
      qc.invalidateQueries({ queryKey: ['eye', 'dashboard'] })
      setViewRx(null)
    },
    onError: () => toast.error('Failed to dispense'),
  })

  const addInventory = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post('/eye/inventory', payload),
    onSuccess: () => {
      toast.success('Inventory item added')
      qc.invalidateQueries({ queryKey: ['eye', 'inventory'] })
      setInvModal(false)
      invForm.reset()
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Failed to add item'
      toast.error(msg)
    },
  })

  const createMedRx = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post('/clinical/prescriptions', payload),
    onSuccess: () => {
      toast.success('Medicine prescription created')
      qc.invalidateQueries({ queryKey: ['clinical', 'prescriptions', selectedPatient?.id] })
      qc.invalidateQueries({ queryKey: ['clinical', 'prescriptions', medRxPatient?.id] })
      closeMedRxModal()
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Failed to create prescription'
      toast.error(msg)
    },
  })

  // ── Helpers ───────────────────────────────────────────────────────────────

  function selectPatient(p: PatientResult) {
    setSelectedPatient(p)
    setSearchInput(`${p.first_name} ${p.last_name} (${p.patient_number})`)
    setShowDropdown(false)
  }

  function clearPatient() {
    setSelectedPatient(null)
    setSearchInput('')
    setDebouncedSearch('')
  }

  function closeMedRxModal() {
    setMedRxModal(false)
    medRxForm.reset()
    setMedItems([{ medication_name: '', dosage: '', frequency: '', duration: '', route: '', quantity: '', instructions: '' }])
    setSelectedVisitId('')
    setMedRxPatient(null)
    setMedRxPatientInput('')
    setMedRxPatientDebounced('')
  }

  function openMedRxModal() {
    // Pre-fill with the main page's selected patient if available
    if (selectedPatient) {
      setMedRxPatient(selectedPatient)
      setMedRxPatientInput(`${selectedPatient.first_name} ${selectedPatient.last_name} (${selectedPatient.patient_number})`)
    }
    setMedRxModal(true)
  }

  function updateMedItem(idx: number, field: keyof MedItem, value: string) {
    setMedItems((prev) => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item))
  }

  function addMedItem() {
    setMedItems((prev) => [...prev, { medication_name: '', dosage: '', frequency: '', duration: '', route: '', quantity: '', instructions: '' }])
  }

  function removeMedItem(idx: number) {
    setMedItems((prev) => prev.filter((_, i) => i !== idx))
  }

  // ── Columns ───────────────────────────────────────────────────────────────

  const examColumns = [
    {
      key: 'examination_date', header: 'Date',
      render: (r: EyeExam) => formatDate(r.examination_date),
    },
    {
      key: 'va', header: 'VA (R / L)',
      render: (r: EyeExam) => {
        const right = r.va_distance_right_uncorrected ?? '—'
        const left = r.va_distance_left_uncorrected ?? '—'
        return <span className="font-mono text-xs">{right} / {left}</span>
      },
    },
    {
      key: 'refraction', header: 'Refraction (R / L)',
      render: (r: EyeExam) => {
        if (r.sphere_right == null && r.sphere_left == null) return <span className="text-gray-400">—</span>
        return (
          <span className="font-mono text-xs">
            {fmtRefraction(r.sphere_right, r.cylinder_right, r.axis_right)}<br />
            {fmtRefraction(r.sphere_left, r.cylinder_left, r.axis_left)}
          </span>
        )
      },
    },
    {
      key: 'iop', header: 'IOP (R/L)',
      render: (r: EyeExam) => {
        if (r.iop_right == null && r.iop_left == null) return <span className="text-gray-400">—</span>
        return <span className="font-mono text-xs">{r.iop_right ?? '—'}/{r.iop_left ?? '—'} mmHg</span>
      },
    },
    {
      key: 'diagnosis_binocular', header: 'Diagnosis',
      render: (r: EyeExam) => r.diagnosis_binocular ?? r.diagnosis_right ?? '—',
    },
    {
      key: 'examiner_name', header: 'Examiner',
      render: (r: EyeExam) => r.examiner_name ?? '—',
    },
    {
      key: 'actions', header: '',
      render: (r: EyeExam) => (
        <button onClick={() => setViewExam(r)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
          <FileText className="w-4 h-4" />
        </button>
      ),
    },
  ]

  const rxColumns = [
    { key: 'prescription_date', header: 'Date', render: (r: EyeRx) => formatDate(r.prescription_date) },
    { key: 'glasses_type', header: 'Type', render: (r: EyeRx) => r.glasses_type ?? '—' },
    {
      key: 'distance_rx', header: 'Distance Rx (R / L)',
      render: (r: EyeRx) => (
        <span className="font-mono text-xs">
          {fmtRefraction(r.distance_sphere_right, r.distance_cylinder_right, r.distance_axis_right)}<br />
          {fmtRefraction(r.distance_sphere_left, r.distance_cylinder_left, r.distance_axis_left)}
        </span>
      ),
    },
    { key: 'pupil_distance', header: 'PD (mm)', render: (r: EyeRx) => r.pupil_distance ?? '—' },
    {
      key: 'is_dispensed', header: 'Status',
      render: (r: EyeRx) => r.is_dispensed
        ? <span className="badge-green">Dispensed</span>
        : <span className="badge-yellow">Pending</span>,
    },
    {
      key: 'actions', header: '',
      render: (r: EyeRx) => (
        <button onClick={() => setViewRx(r)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
          <FileText className="w-4 h-4" />
        </button>
      ),
    },
  ]

  const medRxColumns = [
    { key: 'prescription_date', header: 'Date', render: (r: MedicinePrescription) => formatDate(r.prescription_date) },
    { key: 'prescription_number', header: 'Rx #', render: (r: MedicinePrescription) => <span className="font-mono text-xs">{r.prescription_number}</span> },
    { key: 'doctor_name', header: 'Prescribed By', render: (r: MedicinePrescription) => r.doctor_name ?? '—' },
    {
      key: 'items', header: 'Medications',
      render: (r: MedicinePrescription) => {
        if (!r.items?.length) return <span className="text-gray-400">—</span>
        return (
          <div className="text-xs space-y-0.5">
            {r.items.slice(0, 3).map((it) => (
              <p key={it.medication_name} className="text-gray-700">
                {it.medication_name}{it.dosage ? ` ${it.dosage}` : ''}{it.quantity ? ` × ${it.quantity}` : ''}
              </p>
            ))}
            {r.items.length > 3 && <p className="text-gray-400">+{r.items.length - 3} more</p>}
          </div>
        )
      },
    },
    {
      key: 'status', header: 'Status',
      render: (r: MedicinePrescription) => r.is_dispensed
        ? <span className="badge-green">Dispensed</span>
        : <span className="badge-yellow">Pending</span>,
    },
    {
      key: 'actions', header: '',
      render: (r: MedicinePrescription) => (
        <button onClick={() => setViewMedRx(r)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
          <FileText className="w-4 h-4" />
        </button>
      ),
    },
  ]

  const invColumns = [
    { key: 'item_type', header: 'Type', render: (r: InventoryItem) => <span className="badge-blue">{r.item_type}</span> },
    { key: 'item_name', header: 'Item', render: (r: InventoryItem) => <span className="font-medium">{r.item_name}</span> },
    { key: 'brand', header: 'Brand', render: (r: InventoryItem) => r.brand ?? '—' },
    { key: 'item_code', header: 'Code', render: (r: InventoryItem) => <span className="font-mono text-xs">{r.item_code ?? '—'}</span> },
    {
      key: 'quantity_on_hand', header: 'Qty',
      render: (r: InventoryItem) => {
        const low = r.reorder_level != null && r.quantity_on_hand <= r.reorder_level
        return <span className={low ? 'text-red-600 font-bold' : ''}>{r.quantity_on_hand}</span>
      },
    },
    {
      key: 'selling_price', header: 'Price',
      render: (r: InventoryItem) => r.selling_price == null ? '—' : `GH₵ ${Number(r.selling_price).toFixed(2)}`,
    },
    {
      key: 'is_active', header: 'Active',
      render: (r: InventoryItem) => r.is_active
        ? <span className="badge-green">Active</span>
        : <span className="badge-red">Inactive</span>,
    },
  ]

  // ── Header action helper ──────────────────────────────────────────────────

  function headerActions() {
    if (pageTab === 'inventory') {
      return (
        <Button leftIcon={<Plus className="w-4 h-4" />} onClick={() => setInvModal(true)} size="sm">
          Add Item
        </Button>
      )
    }
    if (selectedPatient) {
      return (
        <div className="flex gap-2">
          {recordTab === 'medicine' && (
            <Button variant="secondary" leftIcon={<Pill className="w-4 h-4" />} onClick={openMedRxModal} size="sm">
              New Medicine Rx
            </Button>
          )}
          {recordTab !== 'medicine' && (
            <>
              <Button variant="secondary" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setRxModal(true)} size="sm">
                New Glasses Rx
              </Button>
              <Button leftIcon={<Plus className="w-4 h-4" />} onClick={() => setExamModal(true)} size="sm">
                New Examination
              </Button>
            </>
          )}
        </div>
      )
    }
    return null
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      <PageHeader
        title="Eye Clinic"
        subtitle="Ophthalmic examinations, prescriptions and optical inventory"
        actions={headerActions()}
      />

      {/* Dashboard stats */}
      {dashboardData && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="card p-4 flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg"><Calendar className="w-5 h-5 text-blue-600" /></div>
            <div>
              <p className="text-xs text-gray-500">Today's Appointments</p>
              <p className="text-xl font-bold text-gray-900">{dashboardData.today_appointments ?? 0}</p>
            </div>
          </div>
          <div className="card p-4 flex items-center gap-3">
            <div className="p-2 bg-yellow-100 rounded-lg"><ClipboardList className="w-5 h-5 text-yellow-600" /></div>
            <div>
              <p className="text-xs text-gray-500">Pending Prescriptions</p>
              <p className="text-xl font-bold text-gray-900">{dashboardData.pending_prescriptions ?? 0}</p>
            </div>
          </div>
          <div className="card p-4 flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg"><Eye className="w-5 h-5 text-green-600" /></div>
            <div>
              <p className="text-xs text-gray-500">Exams (30 days)</p>
              <p className="text-xl font-bold text-gray-900">{dashboardData.exams_last_30_days ?? 0}</p>
            </div>
          </div>
          <div className="card p-4 flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg"><Eye className="w-5 h-5 text-purple-600" /></div>
            <div>
              <p className="text-xs text-gray-500">Avg IOP</p>
              <p className="text-xl font-bold text-gray-900">
                {dashboardData.average_iop ? Number(dashboardData.average_iop).toFixed(1) : '—'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Page tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {([
          { label: 'Patient Records', value: 'records' as const, icon: <Eye className="w-3.5 h-3.5" /> },
          { label: 'Optical Inventory', value: 'inventory' as const, icon: <Package className="w-3.5 h-3.5" /> },
        ]).map((t) => (
          <button
            key={t.value}
            onClick={() => setPageTab(t.value)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${pageTab === t.value ? 'bg-white shadow-sm text-primary-700' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* ── Patient Records tab ───────────────────────────────────────── */}
      {pageTab === 'records' && (
        <>
          {/* Patient search */}
          <div className="card p-3 relative" ref={searchRef}>
            <div className="flex items-center gap-3">
              <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <input
                value={searchInput}
                onChange={(e) => {
                  setSearchInput(e.target.value)
                  if (selectedPatient) setSelectedPatient(null)
                  setShowDropdown(true)
                }}
                onFocus={() => setShowDropdown(true)}
                placeholder="Search patient by name or patient number…"
                className="flex-1 text-sm outline-none bg-transparent placeholder-gray-400"
              />
              {selectedPatient && (
                <button onClick={clearPatient} className="p-1 text-gray-400 hover:text-gray-600">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Dropdown results */}
            {showDropdown && !selectedPatient && debouncedSearch.length >= 3 && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 max-h-60 overflow-y-auto">
                {!patientResults || patientResults.length === 0 ? (
                  <p className="p-3 text-sm text-gray-400">No patients found</p>
                ) : (
                  patientResults.map((p) => (
                    <button
                      key={p.id}
                      onMouseDown={() => selectPatient(p)}
                      className="w-full text-left px-4 py-2.5 hover:bg-gray-50 flex items-center justify-between"
                    >
                      <span className="font-medium text-gray-900">{p.first_name} {p.last_name}</span>
                      <span className="text-xs font-mono text-gray-400">{p.patient_number}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {selectedPatient ? (
            <>
              {/* Patient banner */}
              <div className="card p-4 flex items-center gap-4 bg-blue-50 border border-blue-100">
                <div className="p-2.5 bg-blue-200 rounded-xl">
                  <Eye className="w-5 h-5 text-blue-700" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-gray-900">{selectedPatient.first_name} {selectedPatient.last_name}</p>
                  <p className="text-sm text-gray-500 font-mono">{selectedPatient.patient_number}</p>
                </div>
                {selectedPatient.phone_number && (
                  <p className="text-sm text-gray-500 hidden sm:block">{selectedPatient.phone_number}</p>
                )}
              </div>

              {/* Record sub-tabs */}
              <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
                {([
                  { label: 'Examinations', value: 'examinations' as const },
                  { label: 'Glasses Rx', value: 'prescriptions' as const },
                  { label: 'Medicine Rx', value: 'medicine' as const },
                ]).map((t) => (
                  <button
                    key={t.value}
                    onClick={() => setRecordTab(t.value)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${recordTab === t.value ? 'bg-white shadow-sm text-primary-700' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {recordTab === 'examinations' && (
                <DataTable
                  columns={examColumns}
                  data={examsData ?? []}
                  keyField="id"
                  isLoading={examsLoading}
                  emptyMessage="No eye examinations found for this patient"
                />
              )}

              {recordTab === 'prescriptions' && (
                <DataTable
                  columns={rxColumns}
                  data={rxData ?? []}
                  keyField="id"
                  isLoading={rxLoading}
                  emptyMessage="No glasses prescriptions found for this patient"
                />
              )}

              {recordTab === 'medicine' && (
                <DataTable
                  columns={medRxColumns}
                  data={medRxData ?? []}
                  keyField="id"
                  isLoading={medRxLoading}
                  emptyMessage="No medicine prescriptions found for this patient"
                />
              )}
            </>
          ) : (
            <div className="card p-10 text-center text-gray-400">
              <Eye className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Search for a patient by name or patient number to view their eye records</p>
            </div>
          )}
        </>
      )}

      {/* ── Inventory tab ─────────────────────────────────────────────── */}
      {pageTab === 'inventory' && (
        <>
          <div className="card p-3 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-40">
              <Search className="w-4 h-4 text-gray-400" />
              <input
                value={invSearch}
                onChange={(e) => setInvSearch(e.target.value)}
                placeholder="Search item name, code or brand…"
                className="flex-1 text-sm outline-none bg-transparent placeholder-gray-400"
              />
            </div>
            <select
              value={invType}
              onChange={(e) => setInvType(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white outline-none"
            >
              <option value="">All types</option>
              {inventoryTypes.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <DataTable
            columns={invColumns}
            data={inventoryData ?? []}
            keyField="id"
            isLoading={invLoading}
            emptyMessage="No optical inventory items found"
          />
        </>
      )}

      {/* ── New Examination Modal ─────────────────────────────────────── */}
      <Modal
        open={examModal}
        onClose={() => setExamModal(false)}
        title="New Eye Examination"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setExamModal(false)}>Cancel</Button>
            <Button
              onClick={examForm.handleSubmit((d) => {
                const num = (v: unknown) => v !== '' && v != null ? Number(v) : undefined
                createExam.mutate({
                  patient_id: selectedPatient!.id,
                  examination_date: d.examination_date || undefined,
                  va_distance_right_uncorrected: d.va_distance_right_uncorrected || undefined,
                  va_distance_left_uncorrected: d.va_distance_left_uncorrected || undefined,
                  va_distance_right_corrected: d.va_distance_right_corrected || undefined,
                  va_distance_left_corrected: d.va_distance_left_corrected || undefined,
                  sphere_right: num(d.sphere_right),
                  sphere_left: num(d.sphere_left),
                  cylinder_right: num(d.cylinder_right),
                  cylinder_left: num(d.cylinder_left),
                  axis_right: num(d.axis_right),
                  axis_left: num(d.axis_left),
                  iop_right: num(d.iop_right),
                  iop_left: num(d.iop_left),
                  iop_method: d.iop_method || undefined,
                  diagnosis_right: d.diagnosis_right || undefined,
                  diagnosis_left: d.diagnosis_left || undefined,
                  diagnosis_binocular: d.diagnosis_binocular || undefined,
                  treatment_plan: d.treatment_plan || undefined,
                  glasses_prescribed: !!d.glasses_prescribed,
                  follow_up_required: !!d.follow_up_required,
                  follow_up_period: d.follow_up_period || undefined,
                  notes: d.notes || undefined,
                })
              })}
              isLoading={createExam.isPending}
            >
              Save
            </Button>
          </>
        }
      >
        <form className="space-y-5">
          <FormField label="Examination Date">
            <Input type="date" {...examForm.register('examination_date')} defaultValue={new Date().toISOString().slice(0, 10)} />
          </FormField>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Visual Acuity (Distance)</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <FormField label="R Uncorrected"><Input {...examForm.register('va_distance_right_uncorrected')} placeholder="6/6" /></FormField>
              <FormField label="R Corrected"><Input {...examForm.register('va_distance_right_corrected')} placeholder="6/6" /></FormField>
              <FormField label="L Uncorrected"><Input {...examForm.register('va_distance_left_uncorrected')} placeholder="6/6" /></FormField>
              <FormField label="L Corrected"><Input {...examForm.register('va_distance_left_corrected')} placeholder="6/6" /></FormField>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Refraction</p>
            <div className="grid grid-cols-3 gap-3">
              <FormField label="Sphere R"><Input type="number" step="0.25" {...examForm.register('sphere_right')} placeholder="+1.00" /></FormField>
              <FormField label="Cylinder R"><Input type="number" step="0.25" {...examForm.register('cylinder_right')} placeholder="-0.50" /></FormField>
              <FormField label="Axis R"><Input type="number" {...examForm.register('axis_right')} placeholder="90" /></FormField>
              <FormField label="Sphere L"><Input type="number" step="0.25" {...examForm.register('sphere_left')} placeholder="+1.00" /></FormField>
              <FormField label="Cylinder L"><Input type="number" step="0.25" {...examForm.register('cylinder_left')} placeholder="-0.50" /></FormField>
              <FormField label="Axis L"><Input type="number" {...examForm.register('axis_left')} placeholder="90" /></FormField>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Intraocular Pressure (mmHg)</p>
            <div className="grid grid-cols-3 gap-3">
              <FormField label="IOP Right"><Input type="number" step="0.1" {...examForm.register('iop_right')} placeholder="14" /></FormField>
              <FormField label="IOP Left"><Input type="number" step="0.1" {...examForm.register('iop_left')} placeholder="14" /></FormField>
              <FormField label="Method"><Select options={iopMethods} placeholder="Method" {...examForm.register('iop_method')} /></FormField>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Diagnosis Right Eye"><Textarea rows={2} {...examForm.register('diagnosis_right')} /></FormField>
            <FormField label="Diagnosis Left Eye"><Textarea rows={2} {...examForm.register('diagnosis_left')} /></FormField>
            <FormField label="Diagnosis (Binocular)" className="sm:col-span-2"><Textarea rows={2} {...examForm.register('diagnosis_binocular')} /></FormField>
          </div>

          <FormField label="Treatment Plan"><Textarea rows={2} {...examForm.register('treatment_plan')} /></FormField>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Follow-up Period"><Input {...examForm.register('follow_up_period')} placeholder="e.g. 3 months" /></FormField>
            <FormField label="Notes"><Textarea rows={2} {...examForm.register('notes')} /></FormField>
          </div>

          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" {...examForm.register('glasses_prescribed')} className="rounded" />
              <span>Glasses Prescribed</span>
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" {...examForm.register('follow_up_required')} className="rounded" />
              <span>Follow-up Required</span>
            </label>
          </div>
        </form>
      </Modal>

      {/* ── New Prescription Modal ────────────────────────────────────── */}
      <Modal
        open={rxModal}
        onClose={() => setRxModal(false)}
        title="New Glasses Prescription"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRxModal(false)}>Cancel</Button>
            <Button
              onClick={rxForm.handleSubmit((d) => {
                const num = (v: unknown) => v !== '' && v != null ? Number(v) : undefined
                createRx.mutate({
                  patient_id: selectedPatient!.id,
                  prescription_date: d.prescription_date || undefined,
                  glasses_type: d.glasses_type || undefined,
                  lens_type: d.lens_type || undefined,
                  distance_sphere_right: num(d.distance_sphere_right),
                  distance_sphere_left: num(d.distance_sphere_left),
                  distance_cylinder_right: num(d.distance_cylinder_right),
                  distance_cylinder_left: num(d.distance_cylinder_left),
                  distance_axis_right: num(d.distance_axis_right),
                  distance_axis_left: num(d.distance_axis_left),
                  near_sphere_right: num(d.near_sphere_right),
                  near_sphere_left: num(d.near_sphere_left),
                  pupil_distance: num(d.pupil_distance),
                  notes: d.notes || undefined,
                })
              })}
              isLoading={createRx.isPending}
            >
              Save Prescription
            </Button>
          </>
        }
      >
        <form className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Prescription Date">
              <Input type="date" {...rxForm.register('prescription_date')} defaultValue={new Date().toISOString().slice(0, 10)} />
            </FormField>
            <FormField label="Glasses Type">
              <Select options={glassesTypes} placeholder="Select type" {...rxForm.register('glasses_type')} />
            </FormField>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Distance Prescription</p>
            <div className="grid grid-cols-3 gap-3">
              <FormField label="Sphere R"><Input type="number" step="0.25" {...rxForm.register('distance_sphere_right')} /></FormField>
              <FormField label="Cylinder R"><Input type="number" step="0.25" {...rxForm.register('distance_cylinder_right')} /></FormField>
              <FormField label="Axis R"><Input type="number" {...rxForm.register('distance_axis_right')} /></FormField>
              <FormField label="Sphere L"><Input type="number" step="0.25" {...rxForm.register('distance_sphere_left')} /></FormField>
              <FormField label="Cylinder L"><Input type="number" step="0.25" {...rxForm.register('distance_cylinder_left')} /></FormField>
              <FormField label="Axis L"><Input type="number" {...rxForm.register('distance_axis_left')} /></FormField>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Near Prescription (if applicable)</p>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Near Sphere R"><Input type="number" step="0.25" {...rxForm.register('near_sphere_right')} /></FormField>
              <FormField label="Near Sphere L"><Input type="number" step="0.25" {...rxForm.register('near_sphere_left')} /></FormField>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Pupil Distance (mm)">
              <Input type="number" step="0.5" {...rxForm.register('pupil_distance')} placeholder="63" />
            </FormField>
            <FormField label="Lens Type">
              <Input {...rxForm.register('lens_type')} placeholder="e.g. Anti-reflective" />
            </FormField>
          </div>

          <FormField label="Notes"><Textarea rows={2} {...rxForm.register('notes')} /></FormField>
        </form>
      </Modal>

      {/* ── View Examination Modal ────────────────────────────────────── */}
      {viewExam && (
        <Modal open={!!viewExam} onClose={() => setViewExam(null)} title="Eye Examination Detail" size="lg">
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-3 bg-gray-50 rounded-xl">
              <div><p className="text-xs text-gray-400">Date</p><p className="font-medium">{formatDate(viewExam.examination_date)}</p></div>
              <div><p className="text-xs text-gray-400">Examiner</p><p className="font-medium">{viewExam.examiner_name ?? '—'}</p></div>
              <div><p className="text-xs text-gray-400">IOP Right</p><p className="font-mono font-medium">{viewExam.iop_right == null ? '—' : `${viewExam.iop_right} mmHg`}</p></div>
              <div><p className="text-xs text-gray-400">IOP Left</p><p className="font-mono font-medium">{viewExam.iop_left == null ? '—' : `${viewExam.iop_left} mmHg`}</p></div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 border border-gray-100 rounded-xl">
                <p className="text-xs font-semibold text-gray-500 mb-2">RIGHT EYE</p>
                <p className="text-xs text-gray-400">VA (Uncorr / Corr)</p>
                <p className="font-mono">{viewExam.va_distance_right_uncorrected ?? '—'} / {viewExam.va_distance_right_corrected ?? '—'}</p>
                {viewExam.sphere_right != null && (
                  <>
                    <p className="text-xs text-gray-400 mt-2">Refraction</p>
                    <p className="font-mono text-xs">
                      Sph: {viewExam.sphere_right > 0 ? '+' : ''}{Number(viewExam.sphere_right).toFixed(2)}&ensp;
                      Cyl: {viewExam.cylinder_right == null ? '—' : Number(viewExam.cylinder_right).toFixed(2)}&ensp;
                      Ax: {viewExam.axis_right ?? '—'}°
                    </p>
                  </>
                )}
                {viewExam.diagnosis_right && (
                  <>
                    <p className="text-xs text-gray-400 mt-2">Diagnosis</p>
                    <p>{viewExam.diagnosis_right}</p>
                  </>
                )}
              </div>
              <div className="p-3 border border-gray-100 rounded-xl">
                <p className="text-xs font-semibold text-gray-500 mb-2">LEFT EYE</p>
                <p className="text-xs text-gray-400">VA (Uncorr / Corr)</p>
                <p className="font-mono">{viewExam.va_distance_left_uncorrected ?? '—'} / {viewExam.va_distance_left_corrected ?? '—'}</p>
                {viewExam.sphere_left != null && (
                  <>
                    <p className="text-xs text-gray-400 mt-2">Refraction</p>
                    <p className="font-mono text-xs">
                      Sph: {viewExam.sphere_left > 0 ? '+' : ''}{Number(viewExam.sphere_left).toFixed(2)}&ensp;
                      Cyl: {viewExam.cylinder_left == null ? '—' : Number(viewExam.cylinder_left).toFixed(2)}&ensp;
                      Ax: {viewExam.axis_left ?? '—'}°
                    </p>
                  </>
                )}
                {viewExam.diagnosis_left && (
                  <>
                    <p className="text-xs text-gray-400 mt-2">Diagnosis</p>
                    <p>{viewExam.diagnosis_left}</p>
                  </>
                )}
              </div>
            </div>

            {viewExam.diagnosis_binocular && (
              <div>
                <p className="text-xs text-gray-400">Binocular Diagnosis</p>
                <p className="font-medium">{viewExam.diagnosis_binocular}</p>
              </div>
            )}
            {viewExam.treatment_plan && (
              <div>
                <p className="text-xs text-gray-400">Treatment Plan</p>
                <p>{viewExam.treatment_plan}</p>
              </div>
            )}
            <div className="flex flex-wrap gap-3 pt-1">
              {viewExam.glasses_prescribed && <span className="badge-blue">Glasses Prescribed</span>}
              {viewExam.follow_up_required && (
                <span className="badge-yellow">Follow-up: {viewExam.follow_up_period ?? 'Required'}</span>
              )}
            </div>
            {viewExam.notes && (
              <div>
                <p className="text-xs text-gray-400">Notes</p>
                <p className="text-gray-600 italic">{viewExam.notes}</p>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* ── View Prescription Modal ───────────────────────────────────── */}
      {viewRx && (
        <Modal
          open={!!viewRx}
          onClose={() => setViewRx(null)}
          title="Glasses Prescription"
          size="md"
          footer={
            viewRx.is_dispensed ? (
              <Button variant="secondary" onClick={() => setViewRx(null)}>Close</Button>
            ) : (
              <>
                <Button variant="secondary" onClick={() => setViewRx(null)}>Close</Button>
                <Button
                  leftIcon={<CheckCircle className="w-4 h-4" />}
                  onClick={() => dispenseRx.mutate(viewRx.id)}
                  isLoading={dispenseRx.isPending}
                >
                  Mark as Dispensed
                </Button>
              </>
            )
          }
        >
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3 p-3 bg-gray-50 rounded-xl">
              <div><p className="text-xs text-gray-400">Date</p><p className="font-medium">{formatDate(viewRx.prescription_date)}</p></div>
              <div><p className="text-xs text-gray-400">Glasses Type</p><p className="font-medium">{viewRx.glasses_type ?? '—'}</p></div>
              <div><p className="text-xs text-gray-400">PD</p><p className="font-mono font-medium">{viewRx.pupil_distance == null ? '—' : `${viewRx.pupil_distance} mm`}</p></div>
              <div>
                <p className="text-xs text-gray-400">Status</p>
                {viewRx.is_dispensed
                  ? <span className="badge-green">Dispensed {viewRx.dispensed_date ? formatDate(viewRx.dispensed_date) : ''}</span>
                  : <span className="badge-yellow">Pending</span>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 border border-gray-100 rounded-xl">
                <p className="text-xs font-semibold text-gray-500 mb-2">RIGHT EYE</p>
                <p className="text-xs text-gray-400">Distance</p>
                <p className="font-mono text-xs">
                  {fmtRefraction(viewRx.distance_sphere_right, viewRx.distance_cylinder_right, viewRx.distance_axis_right)}
                </p>
                {viewRx.near_sphere_right == null ? null : (
                  <>
                    <p className="text-xs text-gray-400 mt-2">Near</p>
                    <p className="font-mono text-xs">Sph: {viewRx.near_sphere_right > 0 ? '+' : ''}{Number(viewRx.near_sphere_right).toFixed(2)}</p>
                  </>
                )}
              </div>
              <div className="p-3 border border-gray-100 rounded-xl">
                <p className="text-xs font-semibold text-gray-500 mb-2">LEFT EYE</p>
                <p className="text-xs text-gray-400">Distance</p>
                <p className="font-mono text-xs">
                  {fmtRefraction(viewRx.distance_sphere_left, viewRx.distance_cylinder_left, viewRx.distance_axis_left)}
                </p>
                {viewRx.near_sphere_left == null ? null : (
                  <>
                    <p className="text-xs text-gray-400 mt-2">Near</p>
                    <p className="font-mono text-xs">Sph: {viewRx.near_sphere_left > 0 ? '+' : ''}{Number(viewRx.near_sphere_left).toFixed(2)}</p>
                  </>
                )}
              </div>
            </div>

            {viewRx.notes && (
              <div>
                <p className="text-xs text-gray-400">Notes</p>
                <p className="text-gray-600 italic">{viewRx.notes}</p>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* ── New Medicine Rx Modal ─────────────────────────────────────── */}
      <Modal
        open={medRxModal}
        onClose={closeMedRxModal}
        title="New Medicine Prescription"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={closeMedRxModal}>Cancel</Button>
            <Button
              leftIcon={<Pill className="w-4 h-4" />}
              onClick={medRxForm.handleSubmit((d) => {
                const validItems = medItems.filter((it) => it.medication_name.trim())
                if (!medRxPatient) { toast.error('Please select a patient'); return }
                if (!validItems.length) { toast.error('Add at least one medication'); return }
                if (!selectedVisitId) { toast.error('Please select a visit'); return }
                createMedRx.mutate({
                  patient_id: medRxPatient.id,
                  visit_id: selectedVisitId,
                  notes: d.med_notes || undefined,
                  items: validItems.map((it) => ({
                    medication_name: it.medication_name,
                    dosage: it.dosage || undefined,
                    frequency: it.frequency || undefined,
                    duration: it.duration || undefined,
                    route: it.route || undefined,
                    quantity: it.quantity ? Number(it.quantity) : undefined,
                    instructions: it.instructions || undefined,
                  })),
                })
              })}
              isLoading={createMedRx.isPending}
            >
              Save Prescription
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          {/* Patient search */}
          <FormField label="Patient" required>
            <div className="relative" ref={medRxPatientRef}>
              <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 bg-white focus-within:ring-2 focus-within:ring-primary-500">
                <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <input
                  value={medRxPatientInput}
                  onChange={(e) => {
                    setMedRxPatientInput(e.target.value)
                    if (medRxPatient) {
                      setMedRxPatient(null)
                      setSelectedVisitId('')
                    }
                    setMedRxShowPatientDrop(true)
                  }}
                  onFocus={() => setMedRxShowPatientDrop(true)}
                  placeholder="Search by name or patient number…"
                  className="flex-1 text-sm outline-none bg-transparent placeholder-gray-400"
                />
                {medRxPatient && (
                  <button
                    type="button"
                    onClick={() => { setMedRxPatient(null); setMedRxPatientInput(''); setSelectedVisitId('') }}
                    className="p-0.5 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {medRxShowPatientDrop && !medRxPatient && medRxPatientDebounced.length >= 3 && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-30 max-h-52 overflow-y-auto">
                  {!medRxPatientResults || medRxPatientResults.length === 0 ? (
                    <p className="p-3 text-sm text-gray-400">No patients found</p>
                  ) : (
                    medRxPatientResults.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onMouseDown={() => {
                          setMedRxPatient(p)
                          setMedRxPatientInput(`${p.first_name} ${p.last_name} (${p.patient_number})`)
                          setMedRxShowPatientDrop(false)
                          setSelectedVisitId('')
                        }}
                        className="w-full text-left px-4 py-2.5 hover:bg-gray-50 flex items-center justify-between"
                      >
                        <span className="font-medium text-gray-900">{p.first_name} {p.last_name}</span>
                        <span className="text-xs font-mono text-gray-400">{p.patient_number}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </FormField>

          {/* Visit selector — shown only after patient is selected */}
          {medRxPatient && (
            <FormField label="Linked Visit" required>
              <select
                value={selectedVisitId}
                onChange={(e) => setSelectedVisitId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">Select a visit…</option>
                {(patientVisits ?? []).map((v) => (
                  <option key={v.id} value={v.id}>
                    {formatDate(v.visit_date)} — {v.visit_number}{v.visit_type ? ` (${v.visit_type})` : ''}
                  </option>
                ))}
              </select>
            </FormField>
          )}

          {/* Medication items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Medications</p>
              <button
                type="button"
                onClick={addMedItem}
                className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 font-medium"
              >
                <Plus className="w-3.5 h-3.5" /> Add medication
              </button>
            </div>

            <div className="space-y-4">
              {medItems.map((item, idx) => (
                // eslint-disable-next-line react/no-array-index-key
                <div key={`med-item-${idx}`} className="p-3 border border-gray-100 rounded-xl bg-gray-50 relative">
                  {medItems.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeMedItem(idx)}
                      className="absolute top-2 right-2 p-1 text-gray-400 hover:text-red-500"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {/* Drug name with search dropdown */}
                  <div className="relative mb-3">
                    <FormField label="Medication Name" required>
                      <Input
                        value={item.medication_name}
                        onChange={(e) => {
                          updateMedItem(idx, 'medication_name', e.target.value)
                          setDrugSearch(e.target.value)
                          setDrugDropdownIdx(idx)
                        }}
                        onFocus={() => setDrugDropdownIdx(idx)}
                        onBlur={() => setTimeout(() => setDrugDropdownIdx(null), 200)}
                        placeholder="Search drug or type name…"
                      />
                    </FormField>
                    {drugDropdownIdx === idx && debouncedDrugSearch.length >= 2 && drugResults && drugResults.length > 0 && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-30 max-h-48 overflow-y-auto">
                        {drugResults.map((drug) => (
                          <button
                            key={drug.id}
                            type="button"
                            onMouseDown={() => {
                              const strength = drug.strength ? ` ${drug.strength}` : ''
                              const name = drug.drug_name + strength
                              updateMedItem(idx, 'medication_name', name)
                              if (!item.dosage && drug.strength) updateMedItem(idx, 'dosage', drug.strength)
                              setDrugDropdownIdx(null)
                              setDrugSearch('')
                            }}
                            className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm"
                          >
                            <span className="font-medium">{drug.drug_name}</span>
                            {drug.strength && <span className="text-gray-400 ml-2">{drug.strength}</span>}
                            {drug.dosage_form && <span className="text-xs text-gray-400 ml-2">({drug.dosage_form})</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <FormField label="Dosage">
                      <Input
                        value={item.dosage}
                        onChange={(e) => updateMedItem(idx, 'dosage', e.target.value)}
                        placeholder="e.g. 500mg"
                      />
                    </FormField>
                    <FormField label="Frequency">
                      <Input
                        value={item.frequency}
                        onChange={(e) => updateMedItem(idx, 'frequency', e.target.value)}
                        placeholder="e.g. TDS"
                      />
                    </FormField>
                    <FormField label="Duration">
                      <Input
                        value={item.duration}
                        onChange={(e) => updateMedItem(idx, 'duration', e.target.value)}
                        placeholder="e.g. 5 days"
                      />
                    </FormField>
                    <FormField label="Route">
                      <Input
                        value={item.route}
                        onChange={(e) => updateMedItem(idx, 'route', e.target.value)}
                        placeholder="e.g. Oral"
                      />
                    </FormField>
                    <FormField label="Quantity">
                      <Input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => updateMedItem(idx, 'quantity', e.target.value)}
                        placeholder="e.g. 15"
                      />
                    </FormField>
                    <FormField label="Instructions">
                      <Input
                        value={item.instructions}
                        onChange={(e) => updateMedItem(idx, 'instructions', e.target.value)}
                        placeholder="After meals"
                      />
                    </FormField>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <FormField label="Notes">
            <Textarea rows={2} {...medRxForm.register('med_notes')} placeholder="Additional notes for pharmacist…" />
          </FormField>
        </div>
      </Modal>

      {/* ── View Medicine Rx Modal ────────────────────────────────────── */}
      {viewMedRx && (
        <Modal open={!!viewMedRx} onClose={() => setViewMedRx(null)} title="Medicine Prescription" size="md">
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3 p-3 bg-gray-50 rounded-xl">
              <div><p className="text-xs text-gray-400">Rx Number</p><p className="font-mono font-medium">{viewMedRx.prescription_number}</p></div>
              <div><p className="text-xs text-gray-400">Date</p><p className="font-medium">{formatDate(viewMedRx.prescription_date)}</p></div>
              <div><p className="text-xs text-gray-400">Prescribed By</p><p className="font-medium">{viewMedRx.doctor_name ?? '—'}</p></div>
              <div>
                <p className="text-xs text-gray-400">Status</p>
                {viewMedRx.is_dispensed
                  ? <span className="badge-green">Dispensed</span>
                  : <span className="badge-yellow">Pending</span>}
              </div>
            </div>

            {viewMedRx.items && viewMedRx.items.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Medications</p>
                <div className="space-y-2">
                  {viewMedRx.items.map((it) => (
                    <div key={it.medication_name} className="p-3 border border-gray-100 rounded-xl">
                      <p className="font-medium text-gray-900">{it.medication_name}</p>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-gray-500">
                        {it.dosage && <span>Dose: {it.dosage}</span>}
                        {it.quantity != null && <span>Qty: {it.quantity}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {viewMedRx.notes && (
              <div>
                <p className="text-xs text-gray-400">Notes</p>
                <p className="text-gray-600 italic">{viewMedRx.notes}</p>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* ── Add Inventory Modal ───────────────────────────────────────── */}
      <Modal
        open={invModal}
        onClose={() => setInvModal(false)}
        title="Add Optical Inventory Item"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setInvModal(false)}>Cancel</Button>
            <Button
              onClick={invForm.handleSubmit((d) =>
                addInventory.mutate({
                  ...d,
                  quantity_on_hand: d.quantity_on_hand ? Number(d.quantity_on_hand) : 0,
                  unit_cost: d.unit_cost ? Number(d.unit_cost) : undefined,
                  selling_price: d.selling_price ? Number(d.selling_price) : undefined,
                  reorder_level: d.reorder_level ? Number(d.reorder_level) : undefined,
                  is_active: true,
                })
              )}
              isLoading={addInventory.isPending}
            >
              Add Item
            </Button>
          </>
        }
      >
        <form className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Item Type" required>
            <Select options={inventoryTypes} placeholder="Select type" {...invForm.register('item_type', { required: true })} />
          </FormField>
          <FormField label="Item Code" required>
            <Input {...invForm.register('item_code', { required: true })} placeholder="e.g. FR-001" />
          </FormField>
          <FormField label="Item Name" required>
            <Input {...invForm.register('item_name', { required: true })} />
          </FormField>
          <FormField label="Brand"><Input {...invForm.register('brand')} /></FormField>
          <FormField label="Model"><Input {...invForm.register('model')} /></FormField>
          <FormField label="Color"><Input {...invForm.register('color')} /></FormField>
          <FormField label="Quantity"><Input type="number" min="0" {...invForm.register('quantity_on_hand')} defaultValue="0" /></FormField>
          <FormField label="Reorder Level"><Input type="number" min="0" {...invForm.register('reorder_level')} /></FormField>
          <FormField label="Unit Cost (GH₵)"><Input type="number" step="0.01" {...invForm.register('unit_cost')} /></FormField>
          <FormField label="Selling Price (GH₵)"><Input type="number" step="0.01" {...invForm.register('selling_price')} /></FormField>
          <FormField label="Location" className="sm:col-span-2">
            <Input {...invForm.register('location')} placeholder="e.g. Shelf A3" />
          </FormField>
        </form>
      </Modal>
    </div>
  )
}
