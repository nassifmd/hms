import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, FileText, User, Plus } from 'lucide-react'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import PageHeader from '@/components/ui/PageHeader'
import ConsultModal, { type VisitSummary } from './ConsultModal'
import DataTable from '@/components/ui/DataTable'
import { FormField, Input, Textarea } from '@/components/ui/Form'
import { formatDate, formatDateTime, statusColor } from '@/lib/utils'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'

interface Visit {
  id: string
  patientName?: string
  patientNumber?: string
  patient_id?: string
  age?: number
  sex?: string
  visitDate: string
  checkInTime: string
  checkOutTime?: string
  chiefComplaint?: string
  diagnosis?: string
  doctorName?: string
  departmentName?: string
  isEmergency: boolean
  status: string
}

export default function ClinicalPage() {
  const qc = useQueryClient()
  const { user } = useAuth()
  const isNurse = user?.role === 'NURSE'
  const [tab, setTab] = useState<'all' | 'active'>('all')
  const [search, setSearch] = useState('')
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().slice(0, 10))
  const [selectedVisit, setSelectedVisit] = useState<Visit | null>(null)
  const [triageModal, setTriageModal] = useState<Visit | null>(null)
  const [dischargeModal, setDischargeModal] = useState<Visit | null>(null)
  const [diagnosisModal, setDiagnosisModal] = useState<VisitSummary | null>(null)
  const [newVisitModal, setNewVisitModal] = useState(false)
  const [patientSearch, setPatientSearch] = useState('')
  const [selectedPatient, setSelectedPatient] = useState<{ id: string; label: string } | null>(null)

  const newVisitForm = useForm<{
    visit_type: string
    department_id: string
    chief_complaint: string
    is_emergency: boolean
  }>({
    defaultValues: { visit_type: 'Outpatient', department_id: '', chief_complaint: '', is_emergency: false },
  })

  const { data: patientSearchData } = useQuery({
    queryKey: ['patients', 'search', patientSearch],
    queryFn: () =>
      api.get('/patients', { params: { search: patientSearch, limit: 6 } }).then((r) => {
        const rows = r.data?.data ?? r.data ?? []
        return rows as Array<{ id: string; patient_number: string; first_name: string; last_name: string }>
      }),
    enabled: patientSearch.length >= 2 && !selectedPatient,
  })

  const { data: departments } = useQuery({
    queryKey: ['departments'],
    queryFn: () => api.get('/departments').then((r) => r.data.data as Array<{ id: string; department_name: string }>),
  })

  const createVisit = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post('/clinical/visits', body),
    onSuccess: () => {
      toast.success('Visit created — patient is now in the clinical queue')
      qc.invalidateQueries({ queryKey: ['clinical'] })
      setNewVisitModal(false)
      setSelectedPatient(null)
      setPatientSearch('')
      newVisitForm.reset({ visit_type: 'Outpatient', department_id: '', chief_complaint: '', is_emergency: false })
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ??
        'Failed to create visit'
      toast.error(msg)
    },
  })

  const triageForm = useForm<{
    notes: string
    height_cm: string
    weight_kg: string
    temperature_celsius: string
    heart_rate: string
    respiratory_rate: string
    systolic_bp: string
    diastolic_bp: string
    oxygen_saturation: string
    pain_score: string
    blood_glucose: string
  }>()
  const dischargeForm = useForm<{ discharge_notes: string }>()

  const { data, isLoading } = useQuery({
    queryKey: ['clinical', 'visits', dateFilter, search],
    queryFn: () =>
      api.get('/clinical/visits', {
        params: { date: dateFilter || undefined, search: search || undefined, limit: 30 },
      }).then((r) => r.data),
    enabled: tab === 'all',
  })

  const { data: activeData, isLoading: activeLoading } = useQuery({
    queryKey: ['clinical', 'visits', 'active'],
    queryFn: () => api.get('/clinical/visits/active').then((r) => r.data),
    enabled: tab === 'active',
    refetchInterval: 30000,
  })

  function mapVisit(r: Record<string, unknown>): Visit {
    return {
      id: r.id as string,
      patientName: r.patient_name as string | undefined,
      patientNumber: r.patient_number as string | undefined,
      patient_id: r.patient_id as string | undefined,
      age: r.date_of_birth
        ? Math.floor((Date.now() - new Date(r.date_of_birth as string).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
        : undefined,
      sex: (r.gender ?? r.sex) as string | undefined,
      visitDate: (r.visit_date ?? r.visitDate) as string,
      checkInTime: (r.check_in_time ?? r.checkInTime) as string,
      checkOutTime: (r.check_out_time ?? r.checkOutTime) as string | undefined,
      chiefComplaint: (r.chief_complaint ?? r.chiefComplaint) as string | undefined,
      diagnosis: r.diagnosis as string | undefined,
      doctorName: (r.created_by_name ?? r.doctor_name ?? r.doctorName) as string | undefined,
      departmentName: (r.department_name ?? r.departmentName) as string | undefined,
      isEmergency: (r.is_emergency ?? r.isEmergency) as boolean,
      status: (r.visit_status ?? r.status) as string,
    }
  }

  const visits: Visit[] = tab === 'active'
    ? (activeData?.data ?? []).map(mapVisit)
    : (data?.data ?? []).map(mapVisit)

  const triage = useMutation({
    mutationFn: ({ id, notes, vitals }: { id: string; notes: string; vitals?: Record<string, number> }) =>
      api.put(`/clinical/visits/${id}/triage`, { notes, vitals }),
    onSuccess: () => {
      toast.success('Triage notes saved')
      qc.invalidateQueries({ queryKey: ['clinical'] })
      setTriageModal(null)
      triageForm.reset()
    },
    onError: () => toast.error('Failed to save triage'),
  })

  const discharge = useMutation({
    mutationFn: ({ id, discharge_notes }: { id: string; discharge_notes: string }) =>
      api.put(`/clinical/visits/${id}/discharge`, { discharge_notes }),
    onSuccess: () => {
      toast.success('Patient discharged')
      qc.invalidateQueries({ queryKey: ['clinical'] })
      setDischargeModal(null)
      dischargeForm.reset()
    },
    onError: () => toast.error('Failed to discharge patient'),
  })

  const isActive = (v: Visit) => !v.checkOutTime && v.status !== 'Discharged' && v.status !== 'Completed'

  const columns = [
    { key: 'patientName', header: 'Patient', render: (r: Visit) => (
      <div>
        <p className="font-medium text-gray-900 font-mono">{r.patientNumber ?? '—'}</p>
        {r.patientName && <p className="text-xs text-gray-500">{r.patientName}</p>}
      </div>
    )},
    { key: 'doctorName', header: 'Doctor', render: (r: Visit) => r.doctorName ?? '—' },
    { key: 'departmentName', header: 'Department', render: (r: Visit) => r.departmentName ?? '—' },
    { key: 'visitDate', header: 'Date', render: (r: Visit) => formatDate(r.visitDate) },
    { key: 'checkInTime', header: 'Check-In', render: (r: Visit) => formatDateTime(r.checkInTime) },
    { key: 'checkOutTime', header: 'Status', render: (r: Visit) => r.checkOutTime ? <span className={statusColor(r.status)}>{r.status}</span> : <span className="badge-yellow">Active</span> },
    { key: 'isEmergency', header: 'Type', render: (r: Visit) => r.isEmergency ? <span className="badge-red">Emergency</span> : <span className="badge-blue">Regular</span> },
    { key: 'actions', header: '', render: (r: Visit) => (
      <div className="flex items-center gap-1 flex-wrap">
        <button onClick={() => setSelectedVisit(r)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500" title="View details">
          <FileText className="w-4 h-4" />
        </button>
        {isActive(r) && (
          <>
            <button
              onClick={() => { setTriageModal(r); triageForm.reset() }}
              className="px-2 py-1 text-xs font-medium rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 whitespace-nowrap"
              title="Add triage notes"
            >
              Triage
            </button>
            {!isNurse && (
              <>
                <button
                  onClick={() => setDiagnosisModal(r)}
                  className="px-2 py-1 text-xs font-medium rounded-lg bg-purple-50 text-purple-700 hover:bg-purple-100 whitespace-nowrap"
                  title="Open consultation record"
                >
                  Diagnose
                </button>
                <button
                  onClick={() => { setDischargeModal(r); dischargeForm.reset() }}
                  className="px-2 py-1 text-xs font-medium rounded-lg bg-green-50 text-green-700 hover:bg-green-100 whitespace-nowrap"
                  title="Discharge patient"
                >
                  Discharge
                </button>
              </>
            )}
          </>
        )}
      </div>
    )},
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="Clinical"
        subtitle="Visit records and patient consultations"
        actions={
          <Button onClick={() => setNewVisitModal(true)} leftIcon={<Plus className="w-4 h-4" />}>
            New Walk-in Visit
          </Button>
        }
      />

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {[{ label: 'All Visits', value: 'all' as const }, { label: 'Active Visits', value: 'active' as const }].map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === t.value ? 'bg-white shadow-sm text-primary-700' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {t.label}
            {t.value === 'active' && (activeData?.data?.length ?? 0) > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 text-xs rounded-full bg-primary-100 text-primary-700">
                {activeData!.data.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 'all' && (
        <div className="card p-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-48">
            <Search className="w-4 h-4 text-gray-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by patient name or ID…" className="flex-1 text-sm outline-none bg-transparent placeholder-gray-400" />
          </div>
          <Input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="w-40 text-sm py-1.5" />
        </div>
      )}

      <DataTable columns={columns} data={visits} keyField="id" isLoading={tab === 'all' ? isLoading : activeLoading} emptyMessage="No visits found" />

      {/* Visit Details Modal */}
      {selectedVisit && (
        <Modal open={!!selectedVisit} onClose={() => setSelectedVisit(null)} title="Visit Details" size="lg">
          <div className="space-y-4">
            <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl">
              <div className="p-3 bg-primary-100 rounded-xl">
                <User className="w-6 h-6 text-primary-600" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">{selectedVisit.patientName ?? 'Unknown Patient'}</p>
                <p className="text-sm text-gray-500">{selectedVisit.patientNumber} · {selectedVisit.departmentName}</p>
              </div>
              {selectedVisit.isEmergency && <span className="badge-red ml-auto">Emergency</span>}
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <InfoRow label="Doctor" value={selectedVisit.doctorName ?? '—'} />
              <InfoRow label="Visit Date" value={formatDate(selectedVisit.visitDate)} />
              <InfoRow label="Check-In" value={formatDateTime(selectedVisit.checkInTime)} />
              <InfoRow label="Check-Out" value={selectedVisit.checkOutTime ? formatDateTime(selectedVisit.checkOutTime) : 'Still Active'} />
              <InfoRow label="Status" value={selectedVisit.status} />
              <InfoRow label="Chief Complaint" value={selectedVisit.chiefComplaint ?? '—'} className="col-span-2" />
              <InfoRow label="Diagnosis" value={selectedVisit.diagnosis ?? '—'} className="col-span-2" />
            </div>
          </div>
        </Modal>
      )}

      {/* Triage Modal */}
      <Modal
        open={!!triageModal}
        onClose={() => setTriageModal(null)}
        title="Triage — Vital Signs & Notes"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setTriageModal(null)}>Cancel</Button>
            <Button
              onClick={triageForm.handleSubmit((d) => {
                if (!triageModal) return
                const vitals: Record<string, number> = {}
                if (d.height_cm)           vitals.height_cm           = Number.parseFloat(d.height_cm)
                if (d.weight_kg)           vitals.weight_kg           = Number.parseFloat(d.weight_kg)
                if (d.temperature_celsius)  vitals.temperature_celsius  = Number.parseFloat(d.temperature_celsius)
                if (d.heart_rate)           vitals.heart_rate           = Number.parseInt(d.heart_rate, 10)
                if (d.respiratory_rate)     vitals.respiratory_rate     = Number.parseInt(d.respiratory_rate, 10)
                if (d.systolic_bp)          vitals.systolic_bp          = Number.parseInt(d.systolic_bp, 10)
                if (d.diastolic_bp)         vitals.diastolic_bp         = Number.parseInt(d.diastolic_bp, 10)
                if (d.oxygen_saturation)    vitals.oxygen_saturation    = Number.parseFloat(d.oxygen_saturation)
                if (d.pain_score)           vitals.pain_scale           = Number.parseInt(d.pain_score, 10)
                if (d.blood_glucose)        vitals.blood_glucose        = Number.parseFloat(d.blood_glucose)
                triage.mutate({ id: triageModal.id, notes: d.notes, vitals: Object.keys(vitals).length ? vitals : undefined })
              })}
              isLoading={triage.isPending}
            >
              Save Triage
            </Button>
          </>
        }
      >
        {triageModal && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <p className="text-sm text-gray-600">Patient: <strong>{triageModal.patientName}</strong></p>
              {triageModal.age !== undefined && (
                <span className="text-sm text-gray-500">Age: <strong>{triageModal.age} yrs</strong></span>
              )}
              {triageModal.sex && (
                <span className="text-sm text-gray-500">Sex: <strong className="capitalize">{triageModal.sex}</strong></span>
              )}
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Vital Signs</p>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Height (cm)">
                  <Input type="number" step="0.1" {...triageForm.register('height_cm')} placeholder="e.g. 170" />
                </FormField>
                <FormField label="Weight (kg)">
                  <Input type="number" step="0.1" {...triageForm.register('weight_kg')} placeholder="e.g. 70" />
                </FormField>
                <FormField label="Temperature (°C)">
                  <Input type="number" step="0.1" {...triageForm.register('temperature_celsius')} placeholder="e.g. 37.5" />
                </FormField>
                <FormField label="Heart Rate (bpm)">
                  <Input type="number" {...triageForm.register('heart_rate')} placeholder="e.g. 80" />
                </FormField>
                <FormField label="Respiratory Rate (/min)">
                  <Input type="number" {...triageForm.register('respiratory_rate')} placeholder="e.g. 16" />
                </FormField>
                <FormField label="Oxygen Saturation / SpO₂ (%)">
                  <Input type="number" step="0.1" {...triageForm.register('oxygen_saturation')} placeholder="e.g. 98" />
                </FormField>
                <FormField label="Blood Pressure — Systolic (mmHg)">
                  <Input type="number" {...triageForm.register('systolic_bp')} placeholder="e.g. 120" />
                </FormField>
                <FormField label="Blood Pressure — Diastolic (mmHg)">
                  <Input type="number" {...triageForm.register('diastolic_bp')} placeholder="e.g. 80" />
                </FormField>
                <FormField label="Pain Score (0–10)">
                  <Input type="number" min="0" max="10" step="1" {...triageForm.register('pain_score')} placeholder="0 = none, 10 = worst" />
                </FormField>
                <FormField label="Blood Glucose (mmol/L)">
                  <Input type="number" step="0.1" {...triageForm.register('blood_glucose')} placeholder="e.g. 5.5" />
                </FormField>
              </div>
            </div>

            <FormField label="Triage Notes">
              <Textarea rows={3} {...triageForm.register('notes')} placeholder="Observations, priority level, additional notes…" />
            </FormField>
          </div>
        )}
      </Modal>

      {/* Discharge Modal */}
      <Modal
        open={!!dischargeModal}
        onClose={() => setDischargeModal(null)}
        title="Discharge Patient"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDischargeModal(null)}>Cancel</Button>
            <Button
              onClick={dischargeForm.handleSubmit((d) => dischargeModal && discharge.mutate({ id: dischargeModal.id, discharge_notes: d.discharge_notes }))}
              isLoading={discharge.isPending}
            >
              Discharge
            </Button>
          </>
        }
      >
        {dischargeModal && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">Discharging: <strong>{dischargeModal.patientName}</strong></p>
            <FormField label="Discharge Notes" required>
              <Textarea rows={4} {...dischargeForm.register('discharge_notes', { required: 'Required' })} placeholder="Discharge summary, follow-up instructions…" />
            </FormField>
          </div>
        )}
      </Modal>

      {/* Full Consultation Modal */}
      {diagnosisModal && (
        <ConsultModal
          visit={diagnosisModal}
          onClose={() => setDiagnosisModal(null)}
        />
      )}

      {/* New Walk-in Visit Modal */}
      <Modal
        open={newVisitModal}
        onClose={() => { setNewVisitModal(false); setSelectedPatient(null); setPatientSearch(''); newVisitForm.reset({ visit_type: 'Outpatient', department_id: '', chief_complaint: '', is_emergency: false }) }}
        title="New Walk-in Visit"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setNewVisitModal(false); setSelectedPatient(null); setPatientSearch(''); newVisitForm.reset({ visit_type: 'Outpatient', department_id: '', chief_complaint: '', is_emergency: false }) }}>
              Cancel
            </Button>
            <Button
              isLoading={createVisit.isPending}
              disabled={!selectedPatient}
              onClick={newVisitForm.handleSubmit((d) =>
                createVisit.mutate({
                  patient_id: selectedPatient!.id,
                  visit_type: d.visit_type,
                  department_id: d.department_id || undefined,
                  chief_complaint: d.chief_complaint || undefined,
                  is_emergency: d.is_emergency,
                })
              )}
            >
              Create Visit
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {/* Patient search */}
          <FormField label="Patient" required>
            <div className="relative">
              <input
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Search by name or patient number…"
                value={selectedPatient ? selectedPatient.label : patientSearch}
                onChange={(e) => { setSelectedPatient(null); setPatientSearch(e.target.value) }}
              />
              {!selectedPatient && (patientSearchData?.length ?? 0) > 0 && (
                <ul className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {patientSearchData!.map((p) => {
                    const label = `${p.first_name} ${p.last_name} (${p.patient_number})`
                    return (
                      <button
                        type="button"
                        key={p.id}
                        className="w-full text-left px-3 py-2 text-sm cursor-pointer hover:bg-primary-50"
                        onMouseDown={() => { setSelectedPatient({ id: p.id, label }); setPatientSearch('') }}
                      >\n                        {label}\n                      </button>
                    )
                  })}
                </ul>
              )}
            </div>
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Visit Type" required>
              <select
                {...newVisitForm.register('visit_type')}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500"
              >
                {['Outpatient', 'Inpatient', 'Emergency', 'Review', 'Consultation'].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Department">
              <select
                {...newVisitForm.register('department_id')}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">— None —</option>
                {(departments ?? []).map((d) => (
                  <option key={d.id} value={d.id}>{d.department_name}</option>
                ))}
              </select>
            </FormField>
          </div>

          <FormField label="Chief Complaint">
            <Textarea rows={3} {...newVisitForm.register('chief_complaint')} placeholder="Reason for visit…" />
          </FormField>

          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input type="checkbox" {...newVisitForm.register('is_emergency')} className="w-4 h-4 accent-red-500" />
            <span className="font-medium text-gray-700">Mark as Emergency</span>
          </label>
        </div>
      </Modal>
    </div>
  )
}

function InfoRow({ label, value, className }: Readonly<{ label: string; value: string; className?: string }>) {
  return (
    <div className={className}>
      <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">{label}</p>
      <p className="text-gray-800 font-medium">{value}</p>
    </div>
  )
}
