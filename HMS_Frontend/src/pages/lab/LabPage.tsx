import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, Clock, CheckCircle, AlertTriangle, Activity, FileText, Download, ExternalLink } from 'lucide-react'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import type { LabOrder } from '@/types'
import PageHeader from '@/components/ui/PageHeader'
import DataTable from '@/components/ui/DataTable'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { FormField, Input, Select, Textarea } from '@/components/ui/Form'
import { formatDate, statusColor } from '@/lib/utils'

const priorityOptions = [
  { value: 'Routine', label: 'Routine' },
  { value: 'Urgent', label: 'Urgent' },
  { value: 'STAT', label: 'STAT (Immediate)' },
]

interface LabOrderDetail {
  id: string
  items?: Array<{ id: string; test_name?: string; status?: string }>
}

interface LabResult {
  id: string
  test_name: string
  test_code: string
  result_value?: string
  unit?: string
  reference_range?: string
  is_abnormal?: boolean
  is_critical?: boolean
  status: string
  attachments?: Array<{ url: string; originalName?: string; mimetype?: string; size?: number }>
  performed_by_user?: { id: string; name: string }
  verified_by_user?: { id: string; name: string }
}

interface LabDashboard {
  pending_orders?: number
  completed_today?: number
  critical_alerts?: number
  average_turnaround?: number
}

interface PatientResult {
  id: string
  patient_number: string
  first_name: string
  last_name: string
}

interface TestResult {
  id: string
  test_name: string
  test_code: string
  test_category?: string
}

export default function LabPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('Pending')
  const [addOpen, setAddOpen] = useState(false)
  const [resultModal, setResultModal] = useState<LabOrder | null>(null)
  const [viewResultsOrder, setViewResultsOrder] = useState<LabOrder | null>(null)
  const [orderDetail, setOrderDetail] = useState<LabOrderDetail | null>(null)
  const [selectedItemId, setSelectedItemId] = useState<string>('')
  const [resultFiles, setResultFiles] = useState<File[]>([])

  // Patient search state
  const [patientQuery, setPatientQuery] = useState('')
  const [selectedPatient, setSelectedPatient] = useState<PatientResult | null>(null)
  const [showPatientDrop, setShowPatientDrop] = useState(false)

  // Test search state
  const [testQuery, setTestQuery] = useState('')
  const [selectedTests, setSelectedTests] = useState<TestResult[]>([])
  const [showTestDrop, setShowTestDrop] = useState(false)

  // Dashboard stats
  const { data: dashboardData } = useQuery<LabDashboard>({
    queryKey: ['lab', 'dashboard'],
    queryFn: () => api.get('/lab/dashboard').then((r) => r.data.data as LabDashboard),
  })

  const { data, isLoading } = useQuery({
    queryKey: ['lab', 'orders', statusFilter, search],
    queryFn: () =>
      api.get('/lab/orders', {
        params: { status: statusFilter || undefined, search: search || undefined, limit: 30 },
      }).then((r) => r.data),
  })

  const orders: LabOrder[] = data?.data ?? []

  // Patient search
  const { data: patientResults } = useQuery<PatientResult[]>({
    queryKey: ['patients', 'search', patientQuery],
    queryFn: () => api.get('/patients/search', { params: { q: patientQuery } }).then((r) => r.data.data),
    enabled: patientQuery.length >= 3,
    staleTime: 30_000,
  })

  // Lab test search
  const { data: testResults } = useQuery<TestResult[]>({
    queryKey: ['lab', 'tests', 'search', testQuery],
    queryFn: () => api.get('/lab/tests/search', { params: { q: testQuery } }).then((r) => r.data.data),
    enabled: testQuery.length >= 2,
    staleTime: 60_000,
  })

  const createMutation = useMutation({
    mutationFn: (payload: unknown) => api.post('/lab/orders', payload),
    onSuccess: () => {
      toast.success('Lab order created')
      qc.invalidateQueries({ queryKey: ['lab'] })
      setAddOpen(false)
      addForm.reset()
      setSelectedPatient(null)
      setSelectedTests([])
      setPatientQuery('')
      setTestQuery('')
    },
    onError: () => toast.error('Failed to create lab order'),
  })

  // When result modal is opened, fetch order detail to get item IDs
  const { data: orderDetailData, isLoading: detailLoading } = useQuery<LabOrderDetail>({
    queryKey: ['lab', 'order', resultModal?.id],
    queryFn: () => api.get(`/lab/orders/${resultModal!.id}`).then((r) => {
      const detail = r.data.data as LabOrderDetail
      setOrderDetail(detail)
      // Auto-select first pending item
      const firstItem = detail.items?.find((i) => i.status !== 'Completed')
      if (firstItem) setSelectedItemId(firstItem.id)
      return detail
    }),
    enabled: !!resultModal,
  })

  // Fetch results for view-results modal
  const { data: resultsData, isLoading: resultsLoading } = useQuery<LabResult[]>({
    queryKey: ['lab', 'results', viewResultsOrder?.id],
    queryFn: () =>
      api.get(`/lab/orders/${viewResultsOrder!.id}/results`).then((r) => (r.data.data ?? []) as LabResult[]),
    enabled: !!viewResultsOrder,
  })

  const resultMutation = useMutation({
    mutationFn: ({ orderId, itemId, result }: { orderId: string; itemId: string; result: string }) => {
      const fd = new FormData()
      fd.append('result_value', result)
      resultFiles.forEach((f) => fd.append('attachments', f))
      return api.put(`/lab/orders/${orderId}/items/${itemId}/result`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
    },
    onSuccess: () => {
      toast.success('Result recorded')
      qc.invalidateQueries({ queryKey: ['lab'] })
      setResultModal(null)
      setOrderDetail(null)
      setResultFiles([])
      resultForm.reset()
    },
    onError: () => toast.error('Failed to record result'),
  })

  const addForm = useForm()
  const resultForm = useForm<{ result: string }>()

  const removeResultFile = (idx: number) => setResultFiles((prev) => prev.filter((_, j) => j !== idx))

  const priorityBadge = (p: string) => {
    if (p === 'STAT') return <span className="badge-red">{p}</span>
    if (p === 'Urgent') return <span className="badge-yellow">{p}</span>
    return <span className="badge-blue">{p}</span>
  }

  const itemOptions = (orderDetailData ?? orderDetail)?.items?.map((i) => ({
    value: i.id,
    label: i.test_name ?? i.id.slice(0, 8),
  })) ?? []

  const columns = [
    { key: 'id', header: 'Order #', render: (r: LabOrder) => <span className="font-mono text-xs">{r.id.slice(0, 8)}</span> },
    { key: 'patientName', header: 'Patient', render: (r: LabOrder) => r.patientName ?? r.patientId },
    { key: 'testName', header: 'Test' },
    { key: 'priority', header: 'Priority', render: (r: LabOrder) => priorityBadge(r.priority) },
    { key: 'status', header: 'Status', render: (r: LabOrder) => <span className={statusColor(r.status)}>{r.status}</span> },
    { key: 'requestedBy', header: 'Requested By', render: (r: LabOrder) => r.requestedBy },
    { key: 'createdAt', header: 'Date', render: (r: LabOrder) => formatDate(r.createdAt) },
    { key: 'actions', header: '', render: (r: LabOrder) => (
      <div className="flex items-center gap-2">
        {(r.status === 'Processing' || r.status === 'Pending') && (
          <button
            onClick={() => { setResultModal(r); setSelectedItemId('') }}
            className="text-xs text-primary-600 hover:underline"
          >
            Enter Result
          </button>
        )}
        {(r.status === 'Completed' || r.status === 'Processing') && (
          <button
            onClick={() => setViewResultsOrder(r)}
            className="flex items-center gap-1 text-xs text-green-600 hover:underline"
          >
            <FileText className="w-3.5 h-3.5" /> View Results
          </button>
        )}
        {r.status === 'Pending' && (
          <span className="text-xs text-gray-400">—</span>
        )}
      </div>
    )},
  ]

  const tabs = [
    { label: 'Pending', value: 'Pending' },
    { label: 'Processing', value: 'Processing' },
    { label: 'Completed', value: 'Completed' },
    { label: 'All', value: '' },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="Laboratory"
        subtitle="Lab orders and test results"
        actions={
          <Button leftIcon={<Plus className="w-4 h-4" />} onClick={() => setAddOpen(true)} size="sm">
            New Order
          </Button>
        }
      />

      {/* Dashboard stats */}
      {dashboardData && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Pending Orders', value: dashboardData.pending_orders ?? 0, icon: <Clock className="w-5 h-5 text-amber-500" />, bg: 'bg-amber-50' },
            { label: 'Completed Today', value: dashboardData.completed_today ?? 0, icon: <CheckCircle className="w-5 h-5 text-green-500" />, bg: 'bg-green-50' },
            { label: 'Critical Alerts', value: dashboardData.critical_alerts ?? 0, icon: <AlertTriangle className="w-5 h-5 text-red-500" />, bg: 'bg-red-50' },
            { label: 'Avg Turnaround (min)', value: dashboardData.average_turnaround ?? 0, icon: <Activity className="w-5 h-5 text-primary-500" />, bg: 'bg-primary-50' },
          ].map((s) => (
            <div key={s.label} className={`card p-4 flex items-center gap-3 ${s.bg}`}>
              {s.icon}
              <div>
                <p className="text-xs text-gray-500">{s.label}</p>
                <p className="text-xl font-bold text-gray-800">{s.value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {tabs.map((t) => (
          <button
            key={t.value}
            onClick={() => setStatusFilter(t.value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              statusFilter === t.value ? 'bg-white shadow-sm text-primary-700' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="card p-3 flex items-center gap-3">
        <Search className="w-4 h-4 text-gray-400" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search orders…" className="flex-1 text-sm outline-none bg-transparent" />
      </div>

      <DataTable columns={columns} data={orders} keyField="id" isLoading={isLoading} emptyMessage="No lab orders found" />

      {/* Create Order Modal */}
      <Modal
        open={addOpen}
        onClose={() => {
          setAddOpen(false)
          setSelectedPatient(null)
          setSelectedTests([])
          setPatientQuery('')
          setTestQuery('')
          addForm.reset()
        }}
        title="New Lab Order"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => {
              setAddOpen(false)
              setSelectedPatient(null)
              setSelectedTests([])
              setPatientQuery('')
              setTestQuery('')
              addForm.reset()
            }}>Cancel</Button>
            <Button
              onClick={() => {
                if (!selectedPatient) { toast.error('Please select a patient'); return }
                if (!selectedTests.length) { toast.error('Please select at least one test'); return }
                createMutation.mutate({
                  patient_id: selectedPatient.id,
                  tests: selectedTests.map((t) => ({ test_id: t.id })),
                  priority: addForm.getValues('priority') || 'Routine',
                  notes: addForm.getValues('clinicalNotes') || undefined,
                })
              }}
              isLoading={createMutation.isPending}
            >
              Create Order
            </Button>
          </>
        }
      >
        <form className="space-y-4">
          {/* Patient search */}
          <FormField label="Patient" required>
            <div className="relative">
              {selectedPatient ? (
                <div className="flex items-center justify-between px-3 py-2 border border-gray-200 rounded-lg bg-primary-50">
                  <span className="text-sm font-medium text-primary-800">
                    {selectedPatient.first_name} {selectedPatient.last_name}
                    <span className="ml-2 text-xs text-primary-600 font-mono">#{selectedPatient.patient_number}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => { setSelectedPatient(null); setPatientQuery('') }}
                    className="text-xs text-primary-600 hover:text-primary-800 ml-2"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <>
                  <Input
                    value={patientQuery}
                    onChange={(e) => { setPatientQuery(e.target.value); setShowPatientDrop(true) }}
                    onFocus={() => setShowPatientDrop(true)}
                    onBlur={() => setTimeout(() => setShowPatientDrop(false), 200)}
                    placeholder="Search by name or patient number…"
                  />
                  {showPatientDrop && patientResults && patientResults.length > 0 && (
                    <div className="absolute z-50 w-full bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
                      {patientResults.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm border-b border-gray-100 last:border-0"
                          onMouseDown={() => {
                            setSelectedPatient(p)
                            setPatientQuery('')
                            setShowPatientDrop(false)
                          }}
                        >
                          <span className="font-medium">{p.first_name} {p.last_name}</span>
                          <span className="ml-2 text-xs text-gray-500 font-mono">#{p.patient_number}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {showPatientDrop && patientQuery.length >= 3 && (!patientResults || patientResults.length === 0) && (
                    <div className="absolute z-50 w-full bg-white border border-gray-200 rounded-lg shadow-lg mt-1 px-3 py-2 text-sm text-gray-400">
                      No patients found
                    </div>
                  )}
                </>
              )}
            </div>
          </FormField>

          {/* Test search */}
          <FormField label="Tests" required>
            <div className="space-y-2">
              {selectedTests.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {selectedTests.map((t) => (
                    <span key={t.id} className="inline-flex items-center gap-1 px-2 py-1 bg-primary-100 text-primary-800 rounded text-xs font-medium">
                      {t.test_name}
                      {t.test_code && <span className="text-primary-500 font-mono">{t.test_code}</span>}
                      <button
                        type="button"
                        onClick={() => setSelectedTests((prev) => prev.filter((x) => x.id !== t.id))} // eslint-disable-line sonarjs/no-nested-functions
                        className="text-primary-500 hover:text-primary-800 font-bold leading-none ml-0.5"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="relative">
                <Input
                  value={testQuery}
                  onChange={(e) => { setTestQuery(e.target.value); setShowTestDrop(true) }}
                  onFocus={() => setShowTestDrop(true)}
                  onBlur={() => setTimeout(() => setShowTestDrop(false), 200)}
                  placeholder="Search for a test (e.g. Full Blood Count)…"
                />
                {showTestDrop && testResults && testResults.some((t) => !selectedTests.some((s) => s.id === t.id)) && (
                  <div className="absolute z-50 w-full bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
                    {testResults.filter((t) => !selectedTests.some((s) => s.id === t.id)).map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm border-b border-gray-100 last:border-0"
                        onMouseDown={() => {
                          setSelectedTests((prev) => [...prev, t])
                          setTestQuery('')
                          setShowTestDrop(false)
                        }}
                      >
                        <span className="font-medium">{t.test_name}</span>
                        {t.test_code && <span className="ml-2 text-xs text-gray-500 font-mono">{t.test_code}</span>}
                        {t.test_category && <span className="ml-1 text-xs text-gray-400">· {t.test_category}</span>}
                      </button>
                    ))}
                  </div>
                )}
                {showTestDrop && testQuery.length >= 2 && !testResults?.some((t) => !selectedTests.some((s) => s.id === t.id)) && (
                  <div className="absolute z-50 w-full bg-white border border-gray-200 rounded-lg shadow-lg mt-1 px-3 py-2 text-sm text-gray-400">
                    No tests found
                  </div>
                )}
              </div>
            </div>
          </FormField>

          <FormField label="Priority">
            <Select options={priorityOptions} placeholder="Select priority" {...addForm.register('priority')} />
          </FormField>
          <FormField label="Clinical Notes">
            <Textarea {...addForm.register('clinicalNotes')} placeholder="Clinical context or notes…" />
          </FormField>
        </form>
      </Modal>

      {/* View Results Modal */}
      {viewResultsOrder && (
        <Modal
          open={!!viewResultsOrder}
          onClose={() => setViewResultsOrder(null)}
          title="Lab Results"
          size="lg"
          footer={
            <Button variant="secondary" onClick={() => setViewResultsOrder(null)}>Close</Button>
          }
        >
          <div className="space-y-4">
            {/* Order summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-gray-50 rounded-xl text-sm">
              <div>
                <p className="text-xs text-gray-400">Patient</p>
                <p className="font-medium">{viewResultsOrder.patientName ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Test(s)</p>
                <p className="font-medium">{viewResultsOrder.testName ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Priority</p>
                {priorityBadge(viewResultsOrder.priority)}
              </div>
              <div>
                <p className="text-xs text-gray-400">Order Date</p>
                <p className="font-medium">{formatDate(viewResultsOrder.createdAt)}</p>
              </div>
            </div>

            {resultsLoading && (
              <p className="text-sm text-gray-400 text-center py-6">Loading results…</p>
            )}

            {!resultsLoading && (!resultsData || resultsData.length === 0) && (
              <p className="text-sm text-gray-400 text-center py-6">No results recorded yet</p>
            )}

            {resultsData && resultsData.length > 0 && (
              <div className="space-y-3">
                {resultsData.map((r) => {
                  let rowBorder = 'border-gray-200 bg-white'
                  if (r.is_critical) rowBorder = 'border-red-300 bg-red-50'
                  else if (r.is_abnormal) rowBorder = 'border-yellow-300 bg-yellow-50'

                  let valueColor = 'text-gray-900'
                  if (r.is_critical) valueColor = 'text-red-700'
                  else if (r.is_abnormal) valueColor = 'text-yellow-700'

                  let statusBg = 'bg-gray-100 text-gray-600'
                  if (r.status === 'Completed') statusBg = 'bg-green-100 text-green-700'
                  else if (r.status === 'Collected') statusBg = 'bg-blue-100 text-blue-700'

                  return (
                  <div key={r.id} className={`p-4 border rounded-xl ${rowBorder}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <p className="font-semibold text-gray-900">{r.test_name}</p>
                          <span className="font-mono text-xs text-gray-400">{r.test_code}</span>
                          {r.is_critical && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-red-100 text-red-700 rounded text-xs font-bold">
                              <AlertTriangle className="w-3 h-3" /> CRITICAL
                            </span>
                          )}
                          {r.is_abnormal && !r.is_critical && (
                            <span className="px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded text-xs font-bold">ABNORMAL</span>
                          )}
                        </div>

                        {r.result_value ? (
                          <div className="flex flex-wrap items-baseline gap-2">
                            <span className={`text-2xl font-bold ${valueColor}`}>{r.result_value}</span>
                            {r.unit && <span className="text-sm text-gray-500">{r.unit}</span>}
                            {r.reference_range && (
                              <span className="text-xs text-gray-400">Ref: {r.reference_range}</span>
                            )}
                          </div>
                        ) : (
                          <p className="text-sm text-gray-400 italic">Result not yet entered</p>
                        )}

                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-gray-500">
                          {r.performed_by_user?.name && (
                            <span>Performed by: <span className="font-medium">{r.performed_by_user.name}</span></span>
                          )}
                          {r.verified_by_user?.name && (
                            <span>Verified by: <span className="font-medium">{r.verified_by_user.name}</span></span>
                          )}
                        </div>
                      </div>

                      <span className={`shrink-0 text-xs px-2 py-1 rounded-full font-medium ${statusBg}`}>{r.status}</span>
                    </div>

                    {/* Attachments */}
                    {r.attachments && r.attachments.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <p className="text-xs font-semibold text-gray-500 mb-1.5">Attachments</p>
                        <div className="flex flex-wrap gap-2">
                          {r.attachments.map((att) => (
                            <a
                              key={att.url}
                              href={att.url}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-xs text-primary-600 hover:bg-primary-50 hover:border-primary-300 transition-colors"
                            >
                              {att.mimetype?.startsWith('image/')
                                ? <ExternalLink className="w-3 h-3" />
                                : <Download className="w-3 h-3" />}
                              <span className="truncate max-w-[160px]">{att.originalName ?? 'Attachment'}</span>
                              {att.size && (
                                <span className="text-gray-400 shrink-0">{(att.size / 1024).toFixed(0)} KB</span>
                              )}
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  )
                })}
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Enter Result Modal */}
      {resultModal && (
        <Modal
          open={!!resultModal}
          onClose={() => { setResultModal(null); setOrderDetail(null); setResultFiles([]) }}
          title="Enter Lab Result"
          size="md"
          footer={
            <>
              <Button variant="secondary" onClick={() => { setResultModal(null); setOrderDetail(null); setResultFiles([]) }}>Cancel</Button>
              <Button
                onClick={resultForm.handleSubmit((d) => {
                  const itemId = selectedItemId || (orderDetailData ?? orderDetail)?.items?.[0]?.id
                  if (!itemId) { toast.error('No test item found'); return }
                  resultMutation.mutate({ orderId: resultModal.id, itemId, result: d.result })
                })}
                isLoading={resultMutation.isPending}
                disabled={detailLoading || itemOptions.length === 0}
              >
                Save Result
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <div className="p-3 bg-gray-50 rounded-lg text-sm">
              <p><span className="text-gray-500">Order:</span> <strong className="font-mono">{resultModal.id.slice(0, 8)}</strong></p>
              <p><span className="text-gray-500">Priority:</span> {priorityBadge(resultModal.priority)}</p>
            </div>

            {detailLoading && <p className="text-sm text-gray-400 text-center py-2">Loading order items…</p>}

            {itemOptions.length > 1 && (
              <FormField label="Test Item">
                <Select
                  options={itemOptions}
                  placeholder="Select test item"
                  value={selectedItemId}
                  onChange={(e) => setSelectedItemId(e.target.value)}
                />
              </FormField>
            )}

            {itemOptions.length === 1 && (
              <div className="p-2 bg-blue-50 rounded text-sm text-blue-700">
                Test: <strong>{itemOptions[0].label}</strong>
              </div>
            )}

            <FormField label="Result" required>
              <Textarea rows={5} {...resultForm.register('result', { required: 'Required' })} placeholder="Enter test result details…" />
            </FormField>

            <FormField label="Attachments">
              <label className="flex items-center gap-2 cursor-pointer w-fit px-3 py-2 bg-gray-50 border border-dashed border-gray-300 rounded-lg hover:bg-gray-100 text-sm text-gray-600">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                Attach files (JPG, PNG, PDF, DOCX — max 5)
                <input
                  type="file"
                  multiple
                  accept=".jpg,.jpeg,.png,.pdf,.doc,.docx"
                  className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? [])
                    setResultFiles((prev) => {
                      const combined = [...prev, ...files]
                      return combined.slice(0, 5)
                    })
                    e.target.value = ''
                  }}
                />
              </label>
              {resultFiles.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {resultFiles.map((f, i) => ( // eslint-disable-line sonarjs/no-nested-functions
                    <li key={`${f.name}-${f.size}-${i}`} className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded px-2 py-1 text-xs">
                      <span className="truncate max-w-[260px] text-gray-700">{f.name}</span>
                      <span className="text-gray-400 ml-2 shrink-0">{(f.size / 1024).toFixed(0)} KB</span>
                      <button
                        type="button"
                        onClick={() => removeResultFile(i)}
                        className="ml-2 text-red-400 hover:text-red-600 font-bold leading-none"
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </FormField>
          </div>
        </Modal>
      )}
    </div>
  )
}
