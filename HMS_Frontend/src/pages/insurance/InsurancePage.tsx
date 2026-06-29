import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search as SearchIcon, Shield, CheckCircle, Clock, XCircle, UploadCloud, AlertTriangle, FileText, X, History, Activity } from 'lucide-react'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import PageHeader from '@/components/ui/PageHeader'
import DataTable from '@/components/ui/DataTable'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { FormField, Input, Select, Textarea } from '@/components/ui/Form'
import { formatDate, formatCurrency } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

interface PatientResult {
  id: string
  patient_number: string
  first_name: string
  last_name: string
  phone_number?: string
  nhis_number?: string
}

interface PatientInsurance {
  id: string
  insurance_provider: string
  policy_number: string
  insurance_type?: string
  plan_name?: string
  expiry_date?: string
  is_active?: boolean
  is_verified?: boolean
}

interface Invoice {
  id: string
  invoice_number: string
  total_amount: number
  payment_status?: string
  invoice_date?: string
}

interface ClaimItem {
  id: string
  service_code?: string
  service_description: string
  quantity: number
  unit_price: number
  total_price: number
  approved_price?: number
  rejection_reason?: string
}

interface ClaimHistory {
  id: string
  status: string
  notes?: string
  changed_at: string
  changed_by?: string
}

interface InsuranceClaim {
  id: string
  claim_number: string
  patient_id: string
  patient_name?: string
  patient_number?: string
  insurance_provider?: string
  total_amount: number
  approved_amount?: number
  paid_amount?: number
  status: string
  claim_date?: string
  submission_date?: string
  rejection_reason?: string
  notes?: string
  patient?: { id: string; name: string; patient_number: string; nhis_number?: string }
  patient_insurance?: { id: string; provider: string; policy_number: string }
  invoice?: { id: string; invoice_number: string; total_amount: number }
  items?: ClaimItem[]
  status_history?: ClaimHistory[]
}

interface DashSummary {
  pending_claims?: number
  submitted_claims?: number
  approved_claims?: number
  rejected_claims?: number
  total_amount?: number
  total_paid?: number
}

// ── Constants ─────────────────────────────────────────────────────────────────

const providerOptions = [
  { value: 'NHIS', label: 'NHIS (National Health Insurance)' },
  { value: 'GLICO', label: 'GLICO Healthcare' },
  { value: 'SIC', label: 'SIC Life' },
  { value: 'Enterprise', label: 'Enterprise Life' },
  { value: 'Metropolitan', label: 'Metropolitan Life' },
  { value: 'Nationwide', label: 'Nationwide Medical Insurance' },
  { value: 'Premier', label: 'Premier Insurance' },
  { value: 'Hollard', label: 'Hollard Insurance' },
  { value: 'Prudential', label: 'Prudential Life Insurance' },
  { value: 'StarLife', label: 'Star Life Assurance' },
  { value: 'OldMutual', label: 'Old Mutual Ghana' },
  { value: 'PhoenixLife', label: 'Phoenix Life Assurance' },
  { value: 'Acacia', label: 'Acacia Health Insurance' },
  { value: 'Equity', label: 'Equity Health Insurance' },
  { value: 'Other', label: 'Other' },
]

const insuranceTypeOptions = [
  { value: 'NHIS', label: 'NHIS' },
  { value: 'Private', label: 'Private' },
  { value: 'Corporate', label: 'Corporate' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusBadge(s: string): string {
  const map: Record<string, string> = {
    Draft: 'badge-gray',
    Validated: 'badge-blue',
    Submitted: 'badge-yellow',
    Approved: 'badge-green',
    Rejected: 'badge-red',
    Paid: 'badge-purple',
  }
  return map[s] ?? 'badge-gray'
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function InsurancePage() {
  const qc = useQueryClient()

  const [pageTab, setPageTab] = useState<'queue' | 'patient'>('queue')

  // Modals
  const [addOpen, setAddOpen] = useState(false)
  const [approveModal, setApproveModal] = useState<InsuranceClaim | null>(null)
  const [rejectModal, setRejectModal] = useState<InsuranceClaim | null>(null)
  const [paidModal, setPaidModal] = useState<InsuranceClaim | null>(null)
  const [verifyOpen, setVerifyOpen] = useState(false)
  const [addInsuranceOpen, setAddInsuranceOpen] = useState(false)
  const [viewClaim, setViewClaim] = useState<InsuranceClaim | null>(null)

  // New Claim — patient search
  const [newClaimInput, setNewClaimInput] = useState('')
  const [newClaimDebounced, setNewClaimDebounced] = useState('')
  const [newClaimDropdown, setNewClaimDropdown] = useState(false)
  const [newClaimPatient, setNewClaimPatient] = useState<PatientResult | null>(null)
  const newClaimRef = useRef<HTMLDivElement>(null)

  // Patient Lookup tab — patient search
  const [lookupInput, setLookupInput] = useState('')
  const [lookupDebounced, setLookupDebounced] = useState('')
  const [lookupDropdown, setLookupDropdown] = useState(false)
  const [lookupPatient, setLookupPatient] = useState<PatientResult | null>(null)
  const lookupRef = useRef<HTMLDivElement>(null)

  // Debounce
  useEffect(() => {
    const t = setTimeout(() => setNewClaimDebounced(newClaimInput), 300)
    return () => clearTimeout(t)
  }, [newClaimInput])

  useEffect(() => {
    const t = setTimeout(() => setLookupDebounced(lookupInput), 300)
    return () => clearTimeout(t)
  }, [lookupInput])

  // Outside-click handlers
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (newClaimRef.current && !newClaimRef.current.contains(e.target as Node)) setNewClaimDropdown(false)
      if (lookupRef.current && !lookupRef.current.contains(e.target as Node)) setLookupDropdown(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ── Queries ───────────────────────────────────────────────────────────────

  const { data: dashData } = useQuery<{ summary?: DashSummary }>({
    queryKey: ['insurance', 'dashboard'],
    queryFn: () => api.get('/insurance/dashboard').then((r) => r.data.data),
  })
  const dash: DashSummary = dashData?.summary ?? {}

  const { data: pendingClaims, isLoading: pendingLoading } = useQuery<InsuranceClaim[]>({
    queryKey: ['insurance', 'claims', 'pending'],
    queryFn: () => api.get('/insurance/claims/pending').then((r) => (r.data.data ?? []) as InsuranceClaim[]),
    enabled: pageTab === 'queue',
  })

  // New Claim: patient search
  const { data: newClaimPatientResults } = useQuery<PatientResult[]>({
    queryKey: ['patients', 'search', newClaimDebounced],
    queryFn: () => api.get('/patients/search', { params: { q: newClaimDebounced } }).then((r) => r.data.data ?? []),
    enabled: newClaimDebounced.length >= 3 && !newClaimPatient,
  })

  // New Claim: active insurance for selected patient
  const { data: newClaimInsurance } = useQuery<PatientInsurance | null>({
    queryKey: ['insurance', 'active', newClaimPatient?.id],
    queryFn: () => api.get(`/insurance/patients/${newClaimPatient!.id}/active`).then((r) => r.data.data ?? null),
    enabled: !!newClaimPatient,
  })

  // New Claim: invoices for selected patient (services rendered)
  const { data: newClaimInvoices } = useQuery<Invoice[]>({
    queryKey: ['billing', 'invoices', newClaimPatient?.id],
    queryFn: () => api.get(`/billing/patients/${newClaimPatient!.id}/invoices`).then((r) => (r.data.data ?? []) as Invoice[]),
    enabled: !!newClaimPatient,
  })

  // Patient Lookup: search
  const { data: lookupPatientResults } = useQuery<PatientResult[]>({
    queryKey: ['patients', 'search', lookupDebounced],
    queryFn: () => api.get('/patients/search', { params: { q: lookupDebounced } }).then((r) => r.data.data ?? []),
    enabled: lookupDebounced.length >= 3 && !lookupPatient,
  })

  // Patient Lookup: their claims
  const { data: lookupClaims, isLoading: lookupClaimsLoading } = useQuery<InsuranceClaim[]>({
    queryKey: ['insurance', 'patient', 'claims', lookupPatient?.id],
    queryFn: () =>
      api.get(`/insurance/patients/${lookupPatient!.id}/claims`, { params: { limit: 20 } })
        .then((r) => (r.data.data ?? []) as InsuranceClaim[]),
    enabled: !!lookupPatient && pageTab === 'patient',
  })

  // Patient Lookup: active insurance
  const { data: lookupInsurance } = useQuery<PatientInsurance | null>({
    queryKey: ['insurance', 'active', lookupPatient?.id],
    queryFn: () => api.get(`/insurance/patients/${lookupPatient!.id}/active`).then((r) => r.data.data ?? null),
    enabled: !!lookupPatient && pageTab === 'patient',
  })

  // Patient Lookup: NHIS history
  const { data: nhisHistory } = useQuery<Record<string, unknown>[]>({
    queryKey: ['insurance', 'nhis-history', lookupPatient?.id],
    queryFn: () =>
      api.get(`/insurance/patients/${lookupPatient!.id}/nhis-history`).then((r) => r.data.data ?? []),
    enabled: !!lookupPatient && pageTab === 'patient',
  })

  // Claim detail
  const { data: claimDetail, isLoading: claimDetailLoading } = useQuery<InsuranceClaim>({
    queryKey: ['insurance', 'claim', viewClaim?.id],
    queryFn: () => api.get(`/insurance/claims/${viewClaim!.id}`).then((r) => r.data.data as InsuranceClaim),
    enabled: !!viewClaim,
  })

  // ── Mutations ─────────────────────────────────────────────────────────────

  const addForm = useForm()
  const approveForm = useForm<{ approved_amount: string }>()
  const rejectForm = useForm<{ reason: string }>()
  const paidForm = useForm<{ paid_amount: string }>()
  const verifyForm = useForm<{ nhis_number: string; patient_id: string }>()
  const addInsuranceForm = useForm()

  function invalidate() { qc.invalidateQueries({ queryKey: ['insurance'] }) }

  const createClaim = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post('/insurance/claims', payload),
    onSuccess: () => {
      toast.success('Claim created')
      invalidate()
      closeNewClaim()
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Failed to create claim'
      toast.error(msg)
    },
  })

  const submitClaim = useMutation({
    mutationFn: (id: string) => api.post(`/insurance/claims/${id}/submit`),
    onSuccess: () => { toast.success('Claim submitted'); invalidate() },
    onError: () => toast.error('Failed to submit claim'),
  })

  const validateClaim = useMutation({
    mutationFn: (id: string) => api.post(`/insurance/claims/${id}/validate`),
    onSuccess: () => { toast.success('Claim validated'); invalidate() },
    onError: () => toast.error('Failed to validate claim'),
  })

  const approveClaim = useMutation({
    mutationFn: ({ id, approved_amount }: { id: string; approved_amount: number }) =>
      api.put(`/insurance/claims/${id}/approve`, { approved_amount }),
    onSuccess: () => { toast.success('Claim approved'); invalidate(); setApproveModal(null) },
    onError: () => toast.error('Failed to approve'),
  })

  const rejectClaim = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.put(`/insurance/claims/${id}/reject`, { reason }),
    onSuccess: () => { toast.success('Claim rejected'); invalidate(); setRejectModal(null) },
    onError: () => toast.error('Failed to reject'),
  })

  const markPaid = useMutation({
    mutationFn: ({ id, paid_amount }: { id: string; paid_amount: number }) =>
      api.put(`/insurance/claims/${id}/paid`, { paid_amount }),
    onSuccess: () => { toast.success('Marked as paid'); invalidate(); setPaidModal(null) },
    onError: () => toast.error('Failed to mark paid'),
  })

  const verifyNHIS = useMutation({
    mutationFn: (payload: { nhis_number: string; patient_id: string }) =>
      api.post('/insurance/verify-nhis', payload),
    onSuccess: (res) => {
      const d = res.data?.data ?? res.data
      toast.success(`NHIS status: ${d?.status ?? 'Active'}`)
      setVerifyOpen(false)
      verifyForm.reset()
    },
    onError: () => toast.error('NHIS verification failed'),
  })

  const addInsurance = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post('/insurance/patient-insurance', payload),
    onSuccess: () => {
      toast.success('Patient insurance added')
      invalidate()
      setAddInsuranceOpen(false)
      addInsuranceForm.reset()
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Failed'
      toast.error(msg)
    },
  })

  // ── Helpers ───────────────────────────────────────────────────────────────

  function selectNewClaimPatient(p: PatientResult) {
    setNewClaimPatient(p)
    setNewClaimInput(`${p.first_name} ${p.last_name} (${p.patient_number})`)
    setNewClaimDropdown(false)
  }

  function closeNewClaim() {
    setAddOpen(false)
    setNewClaimPatient(null)
    setNewClaimInput('')
    setNewClaimDebounced('')
    addForm.reset()
  }

  function selectLookupPatient(p: PatientResult) {
    setLookupPatient(p)
    setLookupInput(`${p.first_name} ${p.last_name} (${p.patient_number})`)
    setLookupDropdown(false)
  }

  function clearLookupPatient() {
    setLookupPatient(null)
    setLookupInput('')
    setLookupDebounced('')
  }

  // ── Watch invoice selection to auto-fill amount ───────────────────────────

  const watchedInvoiceId = addForm.watch('invoice_id')
  const selectedInvoice = newClaimInvoices?.find((inv) => inv.id === watchedInvoiceId)

  useEffect(() => {
    if (selectedInvoice) addForm.setValue('total_amount', String(selectedInvoice.total_amount))
  }, [selectedInvoice, addForm])

  useEffect(() => {
    if (newClaimInsurance?.id) addForm.setValue('patient_insurance_id', newClaimInsurance.id)
  }, [newClaimInsurance, addForm])

  // ── Columns ───────────────────────────────────────────────────────────────

  const pendingColumns = [
    {
      key: 'claim_number', header: 'Claim #',
      render: (r: InsuranceClaim) => <span className="font-mono text-xs font-semibold">{r.claim_number}</span>,
    },
    {
      key: 'patient', header: 'Patient',
      render: (r: InsuranceClaim) => (
        <div>
          <p className="font-medium text-gray-900">{r.patient_name ?? r.patient?.name ?? '—'}</p>
          <p className="text-xs font-mono text-gray-400">{r.patient_number ?? r.patient?.patient_number ?? ''}</p>
        </div>
      ),
    },
    {
      key: 'insurance_provider', header: 'Provider',
      render: (r: InsuranceClaim) => (
        <span className="flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5 text-blue-500" />
          {r.insurance_provider ?? r.patient_insurance?.provider ?? '—'}
        </span>
      ),
    },
    { key: 'total_amount', header: 'Claimed', render: (r: InsuranceClaim) => formatCurrency(r.total_amount) },
    {
      key: 'approved_amount', header: 'Approved',
      render: (r: InsuranceClaim) => r.approved_amount ? formatCurrency(r.approved_amount) : '—',
    },
    {
      key: 'status', header: 'Status',
      render: (r: InsuranceClaim) => <span className={statusBadge(r.status)}>{r.status}</span>,
    },
    { key: 'claim_date', header: 'Date', render: (r: InsuranceClaim) => formatDate(r.claim_date ?? '') },
    {
      key: 'actions', header: '',
      render: (r: InsuranceClaim) => (
        <div className="flex items-center gap-1.5 flex-wrap">
          <button onClick={() => setViewClaim(r)} className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100">
            <FileText className="w-4 h-4" />
          </button>
          {r.status === 'Draft' && (
            <button onClick={() => validateClaim.mutate(r.id)} className="text-xs text-blue-600 hover:underline">Validate</button>
          )}
          {(r.status === 'Draft' || r.status === 'Validated') && (
            <button onClick={() => submitClaim.mutate(r.id)} className="text-xs text-primary-600 hover:underline">Submit</button>
          )}
          {r.status === 'Submitted' && (
            <>
              <button
                onClick={() => { approveForm.setValue('approved_amount', String(r.total_amount)); setApproveModal(r) }}
                className="text-xs text-green-600 hover:underline"
              >Approve</button>
              <button onClick={() => setRejectModal(r)} className="text-xs text-red-500 hover:underline">Reject</button>
            </>
          )}
          {r.status === 'Approved' && (
            <button
              onClick={() => { paidForm.setValue('paid_amount', String(r.approved_amount ?? r.total_amount)); setPaidModal(r) }}
              className="text-xs text-blue-600 hover:underline"
            >Mark Paid</button>
          )}
        </div>
      ),
    },
  ]

  const patientClaimColumns = [
    { key: 'claim_number', header: 'Claim #', render: (r: InsuranceClaim) => <span className="font-mono text-xs font-semibold">{r.claim_number}</span> },
    { key: 'total_amount', header: 'Claimed', render: (r: InsuranceClaim) => formatCurrency(r.total_amount) },
    { key: 'approved_amount', header: 'Approved', render: (r: InsuranceClaim) => r.approved_amount ? formatCurrency(r.approved_amount) : '—' },
    { key: 'status', header: 'Status', render: (r: InsuranceClaim) => <span className={statusBadge(r.status)}>{r.status}</span> },
    { key: 'claim_date', header: 'Date', render: (r: InsuranceClaim) => formatDate(r.claim_date ?? '') },
    {
      key: 'rejection_reason', header: 'Rejection',
      render: (r: InsuranceClaim) => r.rejection_reason ? <span className="text-red-500 text-xs">{r.rejection_reason}</span> : '—',
    },
    {
      key: 'actions', header: '',
      render: (r: InsuranceClaim) => (
        <button onClick={() => setViewClaim(r)} className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100">
          <FileText className="w-4 h-4" />
        </button>
      ),
    },
  ]

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      <PageHeader
        title="Insurance"
        subtitle="Claims management, NHIS verification and patient insurance"
        actions={
          <>
            <Button variant="secondary" leftIcon={<Activity className="w-4 h-4" />} size="sm" onClick={() => setAddInsuranceOpen(true)}>
              Add Insurance
            </Button>
            <Button variant="secondary" leftIcon={<SearchIcon className="w-4 h-4" />} size="sm" onClick={() => setVerifyOpen(true)}>
              Verify NHIS
            </Button>
            <Button leftIcon={<Plus className="w-4 h-4" />} onClick={() => setAddOpen(true)} size="sm">
              New Claim
            </Button>
          </>
        }
      />

      {/* Dashboard Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-50"><Shield className="w-5 h-5 text-blue-600" /></div>
          <div><p className="text-xs text-gray-500">Pending / Draft</p><p className="text-xl font-bold">{(dash.pending_claims ?? 0)}</p></div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-amber-50"><UploadCloud className="w-5 h-5 text-amber-600" /></div>
          <div><p className="text-xs text-gray-500">Submitted</p><p className="text-xl font-bold">{dash.submitted_claims ?? 0}</p></div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-green-50"><CheckCircle className="w-5 h-5 text-green-600" /></div>
          <div><p className="text-xs text-gray-500">Approved</p><p className="text-xl font-bold">{dash.approved_claims ?? 0}</p></div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-red-50"><AlertTriangle className="w-5 h-5 text-red-500" /></div>
          <div><p className="text-xs text-gray-500">Rejected</p><p className="text-xl font-bold">{dash.rejected_claims ?? 0}</p></div>
        </div>
      </div>

      {/* Page tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {([
          { label: 'Pending Queue', value: 'queue' as const, icon: <Clock className="w-3.5 h-3.5" /> },
          { label: 'Patient Lookup', value: 'patient' as const, icon: <SearchIcon className="w-3.5 h-3.5" /> },
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

      {/* ── Pending Queue tab ──────────────────────────────────────────── */}
      {pageTab === 'queue' && (
        <DataTable
          columns={pendingColumns}
          data={pendingClaims ?? []}
          keyField="id"
          isLoading={pendingLoading}
          emptyMessage="No pending claims"
        />
      )}

      {/* ── Patient Lookup tab ─────────────────────────────────────────── */}
      {pageTab === 'patient' && (
        <>
          <div className="card p-3 relative" ref={lookupRef}>
            <div className="flex items-center gap-3">
              <SearchIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <input
                value={lookupInput}
                onChange={(e) => { setLookupInput(e.target.value); if (lookupPatient) setLookupPatient(null); setLookupDropdown(true) }}
                onFocus={() => setLookupDropdown(true)}
                placeholder="Search patient by name or patient number…"
                className="flex-1 text-sm outline-none bg-transparent placeholder-gray-400"
              />
              {lookupPatient && (
                <button onClick={clearLookupPatient} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
              )}
            </div>
            {lookupDropdown && !lookupPatient && lookupDebounced.length >= 3 && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 max-h-60 overflow-y-auto">
                {!lookupPatientResults || lookupPatientResults.length === 0 ? (
                  <p className="p-3 text-sm text-gray-400">No patients found</p>
                ) : (
                  lookupPatientResults.map((p) => (
                    <button key={p.id} onMouseDown={() => selectLookupPatient(p)} className="w-full text-left px-4 py-2.5 hover:bg-gray-50 flex items-center justify-between">
                      <span className="font-medium text-gray-900">{p.first_name} {p.last_name}</span>
                      <span className="text-xs font-mono text-gray-400">{p.patient_number}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {lookupPatient ? (
            <div className="space-y-5">
              {/* Patient + insurance cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="card p-4 flex items-center gap-4 bg-blue-50 border border-blue-100">
                  <div className="p-2.5 bg-blue-200 rounded-xl"><Shield className="w-5 h-5 text-blue-700" /></div>
                  <div>
                    <p className="font-semibold text-gray-900">{lookupPatient.first_name} {lookupPatient.last_name}</p>
                    <p className="text-sm font-mono text-gray-500">{lookupPatient.patient_number}</p>
                    {lookupPatient.nhis_number && <p className="text-xs text-gray-400">NHIS: {lookupPatient.nhis_number}</p>}
                  </div>
                </div>

                {lookupInsurance ? (
                  <div className="card p-4">
                    <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Active Insurance</p>
                    <p className="font-semibold text-gray-900">{lookupInsurance.insurance_provider}</p>
                    <p className="text-sm text-gray-500">Policy: <span className="font-mono">{lookupInsurance.policy_number}</span></p>
                    {lookupInsurance.expiry_date && (
                      <p className="text-xs text-gray-400">Expires: {formatDate(lookupInsurance.expiry_date)}</p>
                    )}
                    <span className={`text-xs mt-1 inline-block ${lookupInsurance.is_verified ? 'badge-green' : 'badge-yellow'}`}>
                      {lookupInsurance.is_verified ? 'Verified' : 'Unverified'}
                    </span>
                  </div>
                ) : (
                  <div className="card p-4 flex items-center justify-center text-gray-400">
                    <div className="text-center">
                      <Shield className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <p className="text-xs">No active insurance on file</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Claims history */}
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-2">Claims History</p>
                <DataTable
                  columns={patientClaimColumns}
                  data={lookupClaims ?? []}
                  keyField="id"
                  isLoading={lookupClaimsLoading}
                  emptyMessage="No claims found for this patient"
                />
              </div>

              {/* NHIS Verification History */}
              {nhisHistory && nhisHistory.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-2">NHIS Verification History</p>
                  <div className="card overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-100">
                        <tr>
                          {['Date', 'NHIS Number', 'Status'].map((h) => (
                            <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {nhisHistory.map((row, i) => (
                          <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                            <td className="px-4 py-3">{formatDate(String(row.verification_date ?? row.verified_at ?? ''))}</td>
                            <td className="px-4 py-3 font-mono text-xs">{String(row.nhis_number ?? '—')}</td>
                            <td className="px-4 py-3">
                              <span className={row.verification_status === 'Active' ? 'badge-green' : 'badge-red'}>
                                {String(row.verification_status ?? '—')}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="card p-10 text-center text-gray-400">
              <Shield className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Search for a patient to view their insurance and claims history</p>
            </div>
          )}
        </>
      )}

      {/* ── New Claim Modal ────────────────────────────────────────────── */}
      <Modal
        open={addOpen}
        onClose={closeNewClaim}
        title="New Insurance Claim"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={closeNewClaim}>Cancel</Button>
            <Button
              onClick={addForm.handleSubmit((d) => {
                if (!newClaimPatient) { toast.error('Select a patient'); return }
                if (!d.patient_insurance_id) { toast.error('Patient has no active insurance'); return }
                createClaim.mutate({
                  patient_id: newClaimPatient.id,
                  patient_insurance_id: d.patient_insurance_id,
                  invoice_id: d.invoice_id || undefined,
                  total_amount: d.total_amount ? Number(d.total_amount) : undefined,
                  notes: d.notes || undefined,
                })
              })}
              isLoading={createClaim.isPending}
            >
              Create Claim
            </Button>
          </>
        }
      >
        <form className="space-y-5">
          {/* Patient search */}
          <FormField label="Patient" required>
            <div className="relative" ref={newClaimRef}>
              <div className={`flex items-center gap-2 border rounded-lg px-3 py-2 transition-colors ${newClaimPatient ? 'border-primary-300 bg-primary-50' : 'border-gray-200'}`}>
                <SearchIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <input
                  value={newClaimInput}
                  onChange={(e) => {
                    setNewClaimInput(e.target.value)
                    if (newClaimPatient) setNewClaimPatient(null)
                    setNewClaimDropdown(true)
                  }}
                  onFocus={() => setNewClaimDropdown(true)}
                  placeholder="Search by name or patient number…"
                  className="flex-1 text-sm outline-none bg-transparent"
                />
                {newClaimPatient && (
                  <button type="button" onClick={() => { setNewClaimPatient(null); setNewClaimInput(''); setNewClaimDebounced('') }} className="text-gray-400 hover:text-gray-600">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {newClaimDropdown && !newClaimPatient && newClaimDebounced.length >= 3 && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-30 max-h-52 overflow-y-auto">
                  {!newClaimPatientResults || newClaimPatientResults.length === 0 ? (
                    <p className="p-3 text-sm text-gray-400">No patients found</p>
                  ) : (
                    newClaimPatientResults.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onMouseDown={() => selectNewClaimPatient(p)}
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

          {/* Insurance status */}
          {newClaimPatient && (
            <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-sm">
              {newClaimInsurance ? (
                <>
                  <p className="text-xs font-semibold text-blue-600 uppercase mb-1">Active Insurance</p>
                  <p className="font-medium">{newClaimInsurance.insurance_provider} — Policy: <span className="font-mono">{newClaimInsurance.policy_number}</span></p>
                  {newClaimInsurance.expiry_date && (
                    <p className="text-xs text-gray-500">Expires: {formatDate(newClaimInsurance.expiry_date)}</p>
                  )}
                  <input type="hidden" {...addForm.register('patient_insurance_id')} />
                </>
              ) : (
                <p className="text-amber-600 text-xs font-medium">⚠ No active insurance found. Please add patient insurance first.</p>
              )}
            </div>
          )}

          {/* Invoice selection — services rendered */}
          {newClaimPatient && newClaimInsurance && (
            <FormField label="Services Rendered (Invoice)">
              <Select
                options={[
                  { value: '', label: 'No invoice — enter amount manually' },
                  ...(newClaimInvoices ?? []).map((inv) => ({
                    value: inv.id,
                    label: `${inv.invoice_number} — GH₵ ${Number(inv.total_amount).toFixed(2)}${inv.payment_status ? ` · ${inv.payment_status}` : ''}`,
                  })),
                ]}
                {...addForm.register('invoice_id')}
                placeholder="Select invoice…"
              />
            </FormField>
          )}

          {/* Claim amount — auto-filled from invoice */}
          {newClaimPatient && newClaimInsurance && (
            <FormField label="Claim Amount (GH₵)" required>
              <Input
                type="number"
                step="0.01"
                {...addForm.register('total_amount', { required: !watchedInvoiceId })}
                readOnly={!!selectedInvoice}
                placeholder="0.00"
              />
              {selectedInvoice && (
                <p className="text-xs text-gray-400 mt-1">
                  Auto-filled from invoice {selectedInvoice.invoice_number}
                </p>
              )}
            </FormField>
          )}

          <FormField label="Notes">
            <Textarea {...addForm.register('notes')} rows={2} placeholder="Additional notes…" />
          </FormField>
        </form>
      </Modal>

      {/* ── Claim Detail Modal ─────────────────────────────────────────── */}
      {viewClaim && (
        <Modal
          open={!!viewClaim}
          onClose={() => setViewClaim(null)}
          title={`Claim — ${viewClaim.claim_number}`}
          size="lg"
        >
          {claimDetailLoading ? (
            <div className="h-40 flex items-center justify-center text-gray-400 text-sm">Loading…</div>
          ) : claimDetail ? (
            <div className="space-y-5 text-sm">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-gray-50 rounded-xl">
                <div>
                  <p className="text-xs text-gray-400">Patient</p>
                  <p className="font-medium">{claimDetail.patient?.name ?? claimDetail.patient_name ?? '—'}</p>
                  <p className="text-xs font-mono text-gray-400">{claimDetail.patient?.patient_number ?? claimDetail.patient_number ?? ''}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Provider</p>
                  <p className="font-medium">{claimDetail.patient_insurance?.provider ?? claimDetail.insurance_provider ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Amounts</p>
                  <p className="font-mono text-xs">
                    Claimed: {formatCurrency(claimDetail.total_amount)}<br />
                    {claimDetail.approved_amount ? `Approved: ${formatCurrency(claimDetail.approved_amount)}` : ''}
                    {claimDetail.paid_amount ? ` Paid: ${formatCurrency(claimDetail.paid_amount)}` : ''}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Status</p>
                  <span className={statusBadge(claimDetail.status)}>{claimDetail.status}</span>
                </div>
              </div>

              {/* Claim items */}
              {claimDetail.items && claimDetail.items.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Services Billed</p>
                  <div className="border border-gray-100 rounded-xl overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 border-b border-gray-100">
                        <tr>
                          {['Code', 'Description', 'Qty', 'Unit', 'Total', 'Approved'].map((h) => (
                            <th key={h} className="px-3 py-2.5 text-left font-semibold text-gray-500">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {claimDetail.items.map((item) => (
                          <tr key={item.id} className="border-b border-gray-50 hover:bg-gray-50">
                            <td className="px-3 py-2 font-mono">{item.service_code ?? '—'}</td>
                            <td className="px-3 py-2">{item.service_description}</td>
                            <td className="px-3 py-2">{item.quantity}</td>
                            <td className="px-3 py-2">{formatCurrency(item.unit_price)}</td>
                            <td className="px-3 py-2 font-medium">{formatCurrency(item.total_price)}</td>
                            <td className="px-3 py-2">{item.approved_price != null ? formatCurrency(item.approved_price) : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Status history */}
              {claimDetail.status_history && claimDetail.status_history.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase mb-2 flex items-center gap-1.5">
                    <History className="w-3.5 h-3.5" /> Status History
                  </p>
                  <div className="space-y-1.5">
                    {claimDetail.status_history.map((h, i) => (
                      <div key={i} className="flex items-start gap-3 p-2.5 bg-gray-50 rounded-lg">
                        <span className={`${statusBadge(h.status)} flex-shrink-0 mt-0.5 text-xs`}>{h.status}</span>
                        <div className="flex-1 min-w-0">
                          {h.notes && <p className="text-xs text-gray-600">{h.notes}</p>}
                          <p className="text-xs text-gray-400">{formatDate(h.changed_at)}{h.changed_by ? ` · ${h.changed_by}` : ''}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {claimDetail.rejection_reason && (
                <div className="p-3 bg-red-50 border border-red-100 rounded-xl">
                  <p className="text-xs font-semibold text-red-600 mb-1">Rejection Reason</p>
                  <p className="text-sm text-red-700">{claimDetail.rejection_reason}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
                {claimDetail.status === 'Draft' && (
                  <Button size="sm" variant="secondary" onClick={() => { validateClaim.mutate(claimDetail.id); setViewClaim(null) }}>
                    Validate
                  </Button>
                )}
                {(claimDetail.status === 'Draft' || claimDetail.status === 'Validated') && (
                  <Button size="sm" onClick={() => { submitClaim.mutate(claimDetail.id); setViewClaim(null) }}>
                    Submit to Insurer
                  </Button>
                )}
                {claimDetail.status === 'Submitted' && (
                  <>
                    <Button size="sm" onClick={() => { approveForm.setValue('approved_amount', String(claimDetail.total_amount)); setApproveModal(claimDetail); setViewClaim(null) }}>
                      Approve
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => { setRejectModal(claimDetail); setViewClaim(null) }}>
                      Reject
                    </Button>
                  </>
                )}
                {claimDetail.status === 'Approved' && (
                  <Button size="sm" onClick={() => { paidForm.setValue('paid_amount', String(claimDetail.approved_amount ?? claimDetail.total_amount)); setPaidModal(claimDetail); setViewClaim(null) }}>
                    Mark Paid
                  </Button>
                )}
              </div>
            </div>
          ) : null}
        </Modal>
      )}

      {/* ── Approve Modal ──────────────────────────────────────────────── */}
      <Modal
        open={!!approveModal}
        onClose={() => setApproveModal(null)}
        title={`Approve Claim — ${approveModal?.claim_number ?? ''}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setApproveModal(null)}>Cancel</Button>
            <Button
              onClick={approveForm.handleSubmit((d) => {
                if (approveModal) approveClaim.mutate({ id: approveModal.id, approved_amount: Number(d.approved_amount) })
              })}
              isLoading={approveClaim.isPending}
            >
              Approve Claim
            </Button>
          </>
        }
      >
        <FormField label="Approved Amount (GH₵)" required>
          <Input type="number" step="0.01" {...approveForm.register('approved_amount', { required: true })} />
        </FormField>
      </Modal>

      {/* ── Reject Modal ───────────────────────────────────────────────── */}
      <Modal
        open={!!rejectModal}
        onClose={() => setRejectModal(null)}
        title={`Reject Claim — ${rejectModal?.claim_number ?? ''}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRejectModal(null)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={rejectForm.handleSubmit((d) => {
                if (rejectModal) rejectClaim.mutate({ id: rejectModal.id, reason: d.reason })
              })}
              isLoading={rejectClaim.isPending}
            >
              Reject Claim
            </Button>
          </>
        }
      >
        <FormField label="Rejection Reason" required>
          <Textarea {...rejectForm.register('reason', { required: true })} placeholder="Reason for rejection" rows={3} />
        </FormField>
      </Modal>

      {/* ── Mark Paid Modal ────────────────────────────────────────────── */}
      <Modal
        open={!!paidModal}
        onClose={() => setPaidModal(null)}
        title={`Mark as Paid — ${paidModal?.claim_number ?? ''}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPaidModal(null)}>Cancel</Button>
            <Button
              onClick={paidForm.handleSubmit((d) => {
                if (paidModal) markPaid.mutate({ id: paidModal.id, paid_amount: Number(d.paid_amount) })
              })}
              isLoading={markPaid.isPending}
            >
              Confirm Payment
            </Button>
          </>
        }
      >
        <FormField label="Paid Amount (GH₵)" required>
          <Input type="number" step="0.01" {...paidForm.register('paid_amount', { required: true })} />
        </FormField>
      </Modal>

      {/* ── Verify NHIS Modal ──────────────────────────────────────────── */}
      <Modal
        open={verifyOpen}
        onClose={() => setVerifyOpen(false)}
        title="Verify NHIS Number"
        footer={
          <>
            <Button variant="secondary" onClick={() => setVerifyOpen(false)}>Cancel</Button>
            <Button
              onClick={verifyForm.handleSubmit((d) => verifyNHIS.mutate(d))}
              isLoading={verifyNHIS.isPending}
              leftIcon={<SearchIcon className="w-4 h-4" />}
            >
              Verify
            </Button>
          </>
        }
      >
        <form className="space-y-4">
          <FormField label="NHIS Number" required>
            <Input {...verifyForm.register('nhis_number', { required: true })} placeholder="NHIS-XXXXXXXX" />
          </FormField>
          <FormField label="Patient ID (UUID)" required>
            <Input {...verifyForm.register('patient_id', { required: true })} placeholder="Patient UUID" />
          </FormField>
        </form>
      </Modal>

      {/* ── Add Patient Insurance Modal ────────────────────────────────── */}
      <Modal
        open={addInsuranceOpen}
        onClose={() => { setAddInsuranceOpen(false); addInsuranceForm.reset() }}
        title="Add Patient Insurance"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setAddInsuranceOpen(false); addInsuranceForm.reset() }}>Cancel</Button>
            <Button
              onClick={addInsuranceForm.handleSubmit((d) => addInsurance.mutate({ ...d, is_active: true }))}
              isLoading={addInsurance.isPending}
            >
              Save Insurance
            </Button>
          </>
        }
      >
        <form className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Patient ID" required className="sm:col-span-2">
            <Input {...addInsuranceForm.register('patient_id', { required: true })} placeholder="Patient UUID" />
          </FormField>
          <FormField label="Insurance Provider" required>
            <Select options={providerOptions} placeholder="Select provider" {...addInsuranceForm.register('insurance_provider', { required: true })} />
          </FormField>
          <FormField label="Insurance Type">
            <Select options={insuranceTypeOptions} placeholder="Type" {...addInsuranceForm.register('insurance_type')} />
          </FormField>
          <FormField label="Policy Number" required>
            <Input {...addInsuranceForm.register('policy_number', { required: true })} />
          </FormField>
          <FormField label="Plan Name">
            <Input {...addInsuranceForm.register('plan_name')} />
          </FormField>
          <FormField label="Start Date">
            <Input type="date" {...addInsuranceForm.register('start_date')} />
          </FormField>
          <FormField label="Expiry Date" required>
            <Input type="date" {...addInsuranceForm.register('expiry_date', { required: true })} />
          </FormField>
        </form>
      </Modal>

    </div>
  )
}
