import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  BarChart3, Download, Calendar, TrendingUp, Users, DollarSign,
  Stethoscope, Activity, Building2, Pill, UserCheck, ClipboardCheck,
  Award, Printer, Mail, AlertTriangle, Shield, FileText,
  ChevronRight,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell,
} from 'recharts'
import api from '@/lib/api'
import PageHeader from '@/components/ui/PageHeader'
import Button from '@/components/ui/Button'
import { FormField, Input, Textarea } from '@/components/ui/Form'
import { formatCurrency, formatNumber, formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'

// ── CSV export helper ─────────────────────────────────────────────────────────
function downloadCSV(rows: Record<string, unknown>[], filename: string) {
  if (!rows.length) return
  const keys = Object.keys(rows[0])
  const lines = [
    keys.join(','),
    ...rows.map((r) => keys.map((k) => JSON.stringify(r[k] ?? '')).join(',')),
  ]
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' })),
    download: filename,
  })
  a.click()
  URL.revokeObjectURL(a.href)
}

// ── Backend export helper ─────────────────────────────────────────────────────
type ExportConfig = {
  endpoint: string
  params: Record<string, string>
  filename?: string
}

async function downloadFromBackend(
  endpoint: string,
  params: Record<string, string>,
  format: 'pdf' | 'excel',
  filename: string,
) {
  try {
    const response = await api.get(endpoint, {
      params: { ...params, format },
      responseType: 'blob',
    })
    const ext = format === 'pdf' ? 'pdf' : 'xlsx'
    const url = URL.createObjectURL(response.data as Blob)
    const a = Object.assign(document.createElement('a'), { href: url, download: `${filename}.${ext}` })
    a.click()
    URL.revokeObjectURL(url)
  } catch {
    toast.error(`Failed to export ${format.toUpperCase()}`)
  }
}

const CHART_COLORS = ['#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#ef4444', '#06b6d4']

// ── Tiny shared components ────────────────────────────────────────────────────
function StatCard({ label, value, color = 'text-gray-900' }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
    </div>
  )
}

function Empty({ Icon, msg }: { Icon: React.ElementType; msg: string }) {
  return (
    <div className="card p-12 text-center text-gray-400">
      <Icon className="w-10 h-10 mx-auto mb-3 opacity-40" />
      <p className="text-sm">{msg}</p>
    </div>
  )
}

function Loading() {
  return <div className="card p-10 text-center text-gray-400 text-sm">Generating report…</div>
}

function Note({ color = 'amber', text }: { color?: 'amber' | 'blue'; text: string }) {
  const c = color === 'blue' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-amber-50 border-amber-200 text-amber-700'
  return (
    // eslint-disable-next-line react/no-danger
    <div className={`card p-3 border text-xs leading-relaxed ${c}`} dangerouslySetInnerHTML={{ __html: text }} />
  )
}

// ── Email Report Panel ───────────────────────────────────────────────────────
function SendEmailPanel({ reportType, start, end, onClose }: {
  reportType: string; start: string; end: string; onClose: () => void
}) {
  const fmt = (d: string) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : ''
  const [senderEmail, setSenderEmail] = useState('')
  const [recipients, setRecipients] = useState('')
  const [subject, setSubject] = useState(`${reportType} — ${fmt(start)} to ${fmt(end)}`)
  const [notes, setNotes] = useState('')

  const sendMutation = useMutation({
    mutationFn: () =>
      api.post('/reports/schedule', {
        report_type: reportType.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
        schedule: { once: true, send_at: new Date().toISOString() },
        recipients: recipients.split(',').map((s) => s.trim()).filter(Boolean),
        params: { start_date: start, end_date: end, sender_email: senderEmail, subject, notes },
      }),
    onSuccess: () => { toast.success('Report sent successfully'); onClose() },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Failed to send report'
      toast.error(msg)
    },
  })

  return (
    <div className="card p-4 border border-blue-200 bg-blue-50 mt-2">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-blue-800 flex items-center gap-2">
          <Mail className="w-4 h-4" /> Send Report by Email
        </span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField label="From (Sender Email)">
          <Input type="email" placeholder="hospital@example.gh" value={senderEmail}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSenderEmail(e.target.value)} />
        </FormField>
        <FormField label="To (comma-separated)">
          <Input placeholder="rha@ghs.gov.gh, dhd@ghs.gov.gh" value={recipients}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRecipients(e.target.value)} />
        </FormField>
        <FormField label="Subject" className="sm:col-span-2">
          <Input value={subject} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSubject(e.target.value)} />
        </FormField>
        <FormField label="Notes (optional)" className="sm:col-span-2">
          <Textarea rows={2} placeholder="Additional notes to accompany the report…" value={notes}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)} />
        </FormField>
      </div>
      <div className="flex gap-2 mt-3">
        <Button size="sm" onClick={() => sendMutation.mutate()} isLoading={sendMutation.isPending}
          disabled={!recipients.trim()} leftIcon={<Mail className="w-3.5 h-3.5" />}>
          Send Report
        </Button>
        <Button size="sm" variant="secondary" onClick={onClose}>Cancel</Button>
      </div>
    </div>
  )
}

function ReportBar({
  title,
  csvData,
  csvFile,
  emailProps,
  exportConfig,
}: {
  title: string
  csvData?: Record<string, unknown>[]
  csvFile?: string
  emailProps?: { reportType: string; start: string; end: string }
  exportConfig?: ExportConfig
}) {
  const [emailOpen, setEmailOpen] = useState(false)
  const [exporting, setExporting] = useState<'pdf' | 'excel' | null>(null)

  async function handleExport(format: 'pdf' | 'excel') {
    if (!exportConfig) return
    setExporting(format)
    await downloadFromBackend(
      exportConfig.endpoint,
      exportConfig.params,
      format,
      exportConfig.filename ?? title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    )
    setExporting(null)
  }

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-800">{title}</h2>
        <div className="flex gap-2">
          {csvData && csvData.length > 0 && (
            <Button variant="secondary" size="sm" leftIcon={<Download className="w-3.5 h-3.5" />}
              onClick={() => downloadCSV(csvData, csvFile ?? 'report.csv')}>
              CSV
            </Button>
          )}
          {exportConfig && (
            <>
              <Button variant="secondary" size="sm" leftIcon={<FileText className="w-3.5 h-3.5" />}
                isLoading={exporting === 'excel'} disabled={exporting !== null}
                onClick={() => handleExport('excel')}>
                Excel
              </Button>
              <Button variant="secondary" size="sm" leftIcon={<Download className="w-3.5 h-3.5" />}
                isLoading={exporting === 'pdf'} disabled={exporting !== null}
                onClick={() => handleExport('pdf')}>
                PDF
              </Button>
            </>
          )}
          {emailProps && (
            <Button variant="secondary" size="sm" leftIcon={<Mail className="w-3.5 h-3.5" />}
              onClick={() => setEmailOpen(!emailOpen)}>
              Email
            </Button>
          )}
        </div>
      </div>
      {emailOpen && emailProps && (
        <SendEmailPanel {...emailProps} onClose={() => setEmailOpen(false)} />
      )}
    </div>
  )
}

function SubTabs<T extends string>({
  tabs,
  active,
  onChange,
  accent,
}: {
  tabs: { id: T; label: string }[]
  active: T
  onChange: (v: T) => void
  accent: string
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all ${
            active === t.id ? accent : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// 1. CLINICAL / MEDICAL
// ────────────────────────────────────────────────────────────────────────────
function ClinicalSection({ start, end }: { start: string; end: string }) {
  type Sub = 'opd' | 'inpatient' | 'emergency' | 'surgical' | 'mortality' | 'communicable' | 'maternal' | 'child'
  const [sub, setSub] = useState<Sub>('opd')

  const { data, isLoading } = useQuery({
    queryKey: ['rpt-clinical', start, end],
    queryFn: () =>
      api.get('/reports/clinical-activity', { params: { start_date: start, end_date: end } })
        .then((r) => r.data.data),
    enabled: !!start && !!end,
  })

  const { data: mortalityData, isLoading: mortalityLoading } = useQuery({
    queryKey: ['rpt-mortality', start, end],
    queryFn: () =>
      api.get('/reports/mortality', { params: { start_date: start, end_date: end } })
        .then((r) => r.data.data),
    enabled: sub === 'mortality' && !!start && !!end,
  })

  const subTabs: { id: Sub; label: string }[] = [
    { id: 'opd',          label: 'OPD Attendance' },
    { id: 'inpatient',    label: 'Admissions & Discharges' },
    { id: 'emergency',    label: 'Emergency Cases' },
    { id: 'surgical',     label: 'Surgical Operations' },
    { id: 'mortality',    label: 'Mortality Report' },
    { id: 'communicable', label: 'Communicable Diseases' },
    { id: 'maternal',     label: 'Maternal Health' },
    { id: 'child',        label: 'Child Health' },
  ]

  const summary = data?.summary ?? {}
  const daily: Record<string, unknown>[] = data?.daily_trend ?? []
  const byDept: Record<string, unknown>[] = data?.by_department ?? []
  const diagnoses: { diagnosis_name: string; count: number }[] = data?.top_diagnoses ?? []

  const COMM_KEYWORDS = ['malaria', 'tuberculosis', ' tb ', 'hiv', 'cholera', 'typhoid', 'meningitis', 'covid', 'hepatitis', 'measles', 'pneumonia', 'diarrhea', 'dysentery', 'dengue']
  const commDx = diagnoses.filter((d) => COMM_KEYWORDS.some((k) => (' ' + d.diagnosis_name + ' ').toLowerCase().includes(k)))

  const MATERNAL_KEYWORDS = ['antenatal', 'anc', 'prenatal', 'delivery', 'labour', 'labor', 'postnatal', 'puerperal', 'obstetric', 'pregnancy', 'maternal', 'miscarriage', 'abortion', 'caesarean', 'eclampsia']
  const maternalDx = diagnoses.filter((d) => MATERNAL_KEYWORDS.some((k) => d.diagnosis_name.toLowerCase().includes(k)))

  const CHILD_KEYWORDS = ['child', 'pediatric', 'paediatric', 'infant', 'neonatal', 'immunization', 'vaccination', 'under-5', 'malnutrition', 'kwashiorkor', 'stunting', 'wasting', 'epi']
  const childDx = diagnoses.filter((d) => CHILD_KEYWORDS.some((k) => d.diagnosis_name.toLowerCase().includes(k)))

  return (
    <div className="space-y-4">
      <SubTabs tabs={subTabs} active={sub} onChange={setSub} accent="bg-blue-50 border-blue-300 text-blue-700" />
      {(!start || !end) && <Note text="<strong>Select a date range</strong> above to generate this report." />}
      {isLoading && <Loading />}

      {data && (
        <>
          {sub === 'opd' && (
            <div className="space-y-4">
              <ReportBar title="OPD Attendance Report" csvData={daily} csvFile={`opd-${start}-${end}.csv`} emailProps={{ reportType: 'OPD Attendance Report', start, end }} exportConfig={{ endpoint: '/reports/clinical-activity', params: { start_date: start, end_date: end }, filename: `opd-attendance-${start}-${end}` }} />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="Total Outpatient Visits" value={formatNumber(summary.outpatient_visits ?? 0)} color="text-blue-600" />
                <StatCard label="Unique Patients" value={formatNumber(summary.unique_patients ?? 0)} />
                <StatCard label="Avg Daily Attendance" value={daily.length ? Math.round((summary.outpatient_visits ?? 0) / daily.length) : 0} />
                <StatCard label="Avg Visit Duration" value={`${Math.round(summary.avg_visit_duration ?? 0)} min`} />
              </div>
              {daily.length > 0 && (
                <div className="card p-5">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Daily OPD Attendance</h3>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={daily}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => formatDate(v)} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="visits" name="Visits" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
              {byDept.length > 0 && (
                <div className="card p-5">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Attendance by Department</h3>
                  <div className="space-y-2">
                    {byDept.map((d, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <span className="text-xs text-gray-500 w-36 truncate">{String(d.department_name)}</span>
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-400 rounded-full" style={{ width: `${Math.min(100, (Number(d.visit_count) / Number(byDept[0].visit_count ?? 1)) * 100)}%` }} />
                        </div>
                        <span className="text-xs font-semibold text-gray-700 w-8 text-right">{String(d.visit_count)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {sub === 'inpatient' && (
            <div className="space-y-4">
              <ReportBar title="Inpatient Admissions & Discharges Report" csvData={byDept} csvFile={`inpatient-${start}-${end}.csv`} emailProps={{ reportType: 'Inpatient Report', start, end }} exportConfig={{ endpoint: '/reports/clinical-activity', params: { start_date: start, end_date: end }, filename: `inpatient-${start}-${end}` }} />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="Total Inpatient" value={formatNumber(summary.inpatient_visits ?? 0)} color="text-indigo-600" />
                <StatCard label="Total Visits" value={formatNumber(summary.total_visits ?? 0)} />
                <StatCard label="Unique Patients" value={formatNumber(summary.unique_patients ?? 0)} />
                <StatCard label="Emergency Admissions" value={formatNumber(summary.emergency_visits ?? 0)} color="text-red-600" />
              </div>
              {byDept.length > 0 && (
                <div className="card p-5">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Admissions by Department</h3>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={byDept} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="department_name" tick={{ fontSize: 11 }} width={130} />
                      <Tooltip />
                      <Bar dataKey="visit_count" name="Admissions" fill="#6366f1" radius={[0, 3, 3, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
              <Note text="<strong>DHIMS2:</strong> Inpatient data (admissions, discharges, deaths) must be submitted monthly via DHIMS2." />
            </div>
          )}

          {sub === 'emergency' && (
            <div className="space-y-4">
              <ReportBar title="Emergency Cases Report" csvData={daily} csvFile={`emergency-${start}-${end}.csv`} emailProps={{ reportType: 'Emergency Cases Report', start, end }} exportConfig={{ endpoint: '/reports/clinical-activity', params: { start_date: start, end_date: end }, filename: `emergency-${start}-${end}` }} />
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <StatCard label="Emergency Cases" value={formatNumber(summary.emergency_visits ?? 0)} color="text-red-600" />
                <StatCard label="Total Visits" value={formatNumber(summary.total_visits ?? 0)} />
                <StatCard label="Emergency Rate" value={`${summary.total_visits ? Math.round(((summary.emergency_visits ?? 0) / summary.total_visits) * 100) : 0}%`} />
              </div>
              {daily.length > 0 && (
                <div className="card p-5">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Daily Emergency Trend</h3>
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={daily}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => formatDate(v)} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Line type="monotone" dataKey="visits" name="Total Visits" stroke="#ef4444" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}

          {sub === 'surgical' && (
            <div className="space-y-4">
              <ReportBar title="Surgical Operations Report" csvData={diagnoses.map((d) => ({ procedure: d.diagnosis_name, count: d.count }))} csvFile={`surgical-${start}-${end}.csv`} exportConfig={{ endpoint: '/reports/clinical-activity', params: { start_date: start, end_date: end }, filename: `surgical-${start}-${end}` }} />
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <StatCard label="Total Visits" value={formatNumber(summary.total_visits ?? 0)} color="text-purple-600" />
                <StatCard label="Unique Patients" value={formatNumber(summary.unique_patients ?? 0)} />
                <StatCard label="Period" value={`${formatDate(start)} – ${formatDate(end)}`} />
              </div>
              {diagnoses.length > 0 && (
                <div className="card p-5">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Top Diagnoses / Procedures</h3>
                  <div className="space-y-1.5">
                    {diagnoses.slice(0, 12).map((d, i) => (
                      <div key={i} className="flex justify-between py-1.5 border-b border-gray-50 text-sm">
                        <span className="text-gray-700">{i + 1}. {d.diagnosis_name}</span>
                        <span className="font-semibold text-gray-900">{d.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {sub === 'mortality' && (
            <div className="space-y-4">
              <ReportBar
                title="Mortality Report"
                csvData={(mortalityData?.by_cause ?? []).map((d: { cause: string; count: number }) => ({ cause: d.cause, count: d.count }))}
                csvFile={`mortality-${start}-${end}.csv`}
                emailProps={{ reportType: 'Mortality Report', start, end }}
                exportConfig={{ endpoint: '/reports/mortality', params: { start_date: start, end_date: end }, filename: `mortality-${start}-${end}` }}
              />
              {mortalityLoading && <Loading />}
              {mortalityData ? (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <StatCard label="Total Deaths" value={formatNumber(mortalityData.total_deaths ?? 0)} color="text-red-600" />
                    {(mortalityData.by_gender ?? []).map((g: { gender: string; count: number }) => (
                      <StatCard key={g.gender} label={`Deaths – ${g.gender}`} value={formatNumber(g.count)} />
                    ))}
                  </div>

                  {(mortalityData.by_cause ?? []).length > 0 && (
                    <div className="card p-5">
                      <h3 className="text-sm font-semibold text-gray-700 mb-3">Causes of Death</h3>
                      <div className="space-y-1.5">
                        {(mortalityData.by_cause as { cause: string; count: number }[]).map((d, i) => (
                          <div key={d.cause} className="flex justify-between py-1.5 border-b border-gray-50 text-sm">
                            <span className="text-gray-700">{i + 1}. {d.cause}</span>
                            <span className="font-semibold text-gray-900">{d.count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {(mortalityData.by_age_group ?? []).length > 0 && (
                    <div className="card p-5">
                      <h3 className="text-sm font-semibold text-gray-700 mb-3">Deaths by Age Group</h3>
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={mortalityData.by_age_group}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                          <XAxis dataKey="age_group" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                          <Tooltip />
                          <Bar dataKey="count" name="Deaths" fill="#ef4444" radius={[3, 3, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {(mortalityData.monthly_trend ?? []).length > 0 && (
                    <div className="card p-5">
                      <h3 className="text-sm font-semibold text-gray-700 mb-3">Monthly Mortality Trend</h3>
                      <ResponsiveContainer width="100%" height={180}>
                        <LineChart data={mortalityData.monthly_trend}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                          <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                          <Tooltip />
                          <Line type="monotone" dataKey="deaths" name="Deaths" stroke="#ef4444" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </>
              ) : !mortalityLoading && start && end && (
                <div className="card p-10 text-center text-gray-400">
                  <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No deaths recorded in the selected period.</p>
                </div>
              )}
              <Note text="<strong>DHIMS2:</strong> Submit the monthly mortality report (deaths by cause, age, and sex) to the District Health Information Management System by the 5th of each month." />
            </div>
          )}

          {sub === 'communicable' && (
            <div className="space-y-4">
              <ReportBar title="Communicable Disease Surveillance Report" csvData={commDx.map((d) => ({ disease: d.diagnosis_name, cases: d.count }))} csvFile={`communicable-${start}-${end}.csv`} exportConfig={{ endpoint: '/reports/clinical-activity', params: { start_date: start, end_date: end }, filename: `communicable-${start}-${end}` }} />
              {commDx.length > 0 ? (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <StatCard label="Disease Types" value={commDx.length} />
                    <StatCard label="Total Cases" value={formatNumber(commDx.reduce((s, d) => s + d.count, 0))} color="text-orange-600" />
                    <StatCard label="Period Start" value={formatDate(start)} />
                    <StatCard label="Period End" value={formatDate(end)} />
                  </div>
                  <div className="card p-5">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Cases by Disease</h3>
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={commDx}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="diagnosis_name" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="count" name="Cases" fill="#f97316" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </>
              ) : (
                <div className="card p-6 text-center text-gray-400 text-sm">
                  <Shield className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  No communicable disease diagnoses found in this period.
                </div>
              )}
              <Note text="<strong>GHS Note:</strong> Notifiable diseases (malaria, cholera, TB, meningitis, etc.) must be reported to the District Health Directorate within 24 hours of diagnosis and entered into DHIMS2 monthly." />
            </div>
          )}

          {sub === 'maternal' && (
            <div className="space-y-4">
              <ReportBar
                title="Maternal Health Report (ANC, Deliveries & Complications)"
                csvData={maternalDx.map((d) => ({ condition: d.diagnosis_name, cases: d.count }))}
                csvFile={`maternal-health-${start}-${end}.csv`}
                emailProps={{ reportType: 'Maternal Health Report', start, end }}
                exportConfig={{ endpoint: '/reports/clinical-activity', params: { start_date: start, end_date: end }, filename: `maternal-health-${start}-${end}` }}
              />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="Maternal Cases" value={formatNumber(maternalDx.reduce((s, d) => s + d.count, 0))} color="text-pink-600" />
                <StatCard label="ANC-Related" value={formatNumber(maternalDx.filter((d) => ['antenatal', 'anc', 'prenatal'].some((k) => d.diagnosis_name.toLowerCase().includes(k))).reduce((s, d) => s + d.count, 0))} />
                <StatCard label="Delivery-Related" value={formatNumber(maternalDx.filter((d) => ['delivery', 'labour', 'labor', 'birth', 'caesarean'].some((k) => d.diagnosis_name.toLowerCase().includes(k))).reduce((s, d) => s + d.count, 0))} />
                <StatCard label="Complications" value={formatNumber(maternalDx.filter((d) => ['eclampsia', 'obstetric', 'puerperal', 'haemorrhage', 'hemorrhage'].some((k) => d.diagnosis_name.toLowerCase().includes(k))).reduce((s, d) => s + d.count, 0))} color="text-red-600" />
              </div>
              {maternalDx.length > 0 ? (
                <div className="card p-5">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Maternal Health Conditions</h3>
                  <div className="space-y-1.5">
                    {maternalDx.map((d, i) => (
                      <div key={i} className="flex justify-between py-1.5 border-b border-gray-50 text-sm">
                        <span className="text-gray-700">{d.diagnosis_name}</span>
                        <span className="font-semibold text-pink-600">{d.count} cases</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="card p-6 text-center text-gray-400 text-sm">No maternal health records found in this period.</div>
              )}
              <Note text="<strong>DHIMS2:</strong> Maternal health data (ANC attendance, deliveries, complications, maternal deaths) are submitted monthly via DHIMS2 under the Reproductive Health module. Targeted for DHIMS2 by the 5th of each month." />
            </div>
          )}

          {sub === 'child' && (
            <div className="space-y-4">
              <ReportBar
                title="Child Health Report (Immunization & Under-5 Diseases)"
                csvData={childDx.map((d) => ({ condition: d.diagnosis_name, cases: d.count }))}
                csvFile={`child-health-${start}-${end}.csv`}
                emailProps={{ reportType: 'Child Health Report', start, end }}
                exportConfig={{ endpoint: '/reports/clinical-activity', params: { start_date: start, end_date: end }, filename: `child-health-${start}-${end}` }}
              />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="Under-5 Conditions" value={formatNumber(childDx.reduce((s, d) => s + d.count, 0))} color="text-teal-600" />
                <StatCard label="Immunization-Related" value={formatNumber(childDx.filter((d) => ['immuniz', 'vaccin', 'epi'].some((k) => d.diagnosis_name.toLowerCase().includes(k))).reduce((s, d) => s + d.count, 0))} />
                <StatCard label="Malnutrition Cases" value={formatNumber(childDx.filter((d) => ['malnutrition', 'stunting', 'wasting', 'kwashiorkor'].some((k) => d.diagnosis_name.toLowerCase().includes(k))).reduce((s, d) => s + d.count, 0))} color="text-red-600" />
                <StatCard label="Period" value={`${formatDate(start)} – ${formatDate(end)}`} />
              </div>
              {childDx.length > 0 ? (
                <div className="card p-5">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Child Health Conditions</h3>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={childDx.slice(0, 12)}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="diagnosis_name" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="count" name="Cases" fill="#14b8a6" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="card p-6 text-center text-gray-400 text-sm">No child health records found in this period.</div>
              )}
              <Note text="<strong>DHIMS2:</strong> Under-5 OPD cases, EPI immunization data, and child nutrition data are submitted monthly via DHIMS2 under the Child Health module. The Ghana EPI schedule covers 10 antigens." />
            </div>
          )}
        </>
      )}

      {!data && !isLoading && start && end && <Empty Icon={Stethoscope} msg="No clinical data for selected period" />}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// 2. DISEASE SURVEILLANCE
// ────────────────────────────────────────────────────────────────────────────
function SurveillanceSection({ start, end }: { start: string; end: string }) {
  type Sub = 'weekly' | 'malaria' | 'hiv' | 'tb'
  const [sub, setSub] = useState<Sub>('weekly')

  const { data, isLoading } = useQuery({
    queryKey: ['rpt-surveillance', start, end],
    queryFn: () =>
      api.get('/reports/clinical-activity', { params: { start_date: start, end_date: end } })
        .then((r) => r.data.data),
    enabled: !!start && !!end,
  })

  const subTabs: { id: Sub; label: string }[] = [
    { id: 'weekly',  label: 'Weekly Disease Surveillance' },
    { id: 'malaria', label: 'Malaria Report' },
    { id: 'hiv',     label: 'HIV/AIDS Report' },
    { id: 'tb',      label: 'TB Report' },
  ]

  const diagnoses: { diagnosis_name: string; count: number }[] = data?.top_diagnoses ?? []
  const filter = (kw: string[]) => diagnoses.filter((d) => kw.some((k) => d.diagnosis_name?.toLowerCase().includes(k)))
  const malaria = filter(['malaria'])
  const hiv     = filter(['hiv', 'aids', 'antiretroviral'])
  const tb      = filter(['tuberculosis', ' tb ', 'tb-'])

  const weeklyData = (() => {
    const trend: { date: string; visits: number }[] = data?.daily_trend ?? []
    const weeks: Record<string, number> = {}
    trend.forEach((d) => {
      const dt = new Date(d.date)
      dt.setDate(dt.getDate() - dt.getDay())
      const k = dt.toISOString().slice(0, 10)
      weeks[k] = (weeks[k] ?? 0) + (d.visits ?? 0)
    })
    return Object.entries(weeks).sort(([a], [b]) => a.localeCompare(b)).map(([week, visits]) => ({ week, visits }))
  })()

  function DiseaseTable({ rows, color }: { rows: { diagnosis_name: string; count: number }[]; color: string }) {
    if (!rows.length) return <div className="card p-5 text-center text-gray-400 text-sm">No cases recorded in this period.</div>
    return (
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Diagnosis</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase">Cases</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map((d, i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-4 py-2.5 text-gray-700">{d.diagnosis_name}</td>
                <td className={`px-4 py-2.5 text-right font-semibold ${color}`}>{d.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <SubTabs tabs={subTabs} active={sub} onChange={setSub} accent="bg-orange-50 border-orange-300 text-orange-700" />
      {(!start || !end) && <Note text="<strong>Select a date range</strong> above to generate this report." />}
      {isLoading && <Loading />}

      {data && (
        <>
          {sub === 'weekly' && (
            <div className="space-y-4">
              <ReportBar title="Weekly Disease Surveillance Report" csvData={weeklyData} csvFile={`weekly-surveillance-${start}-${end}.csv`} emailProps={{ reportType: 'Weekly Disease Surveillance Report', start, end }} exportConfig={{ endpoint: '/reports/clinical-activity', params: { start_date: start, end_date: end }, filename: `weekly-surveillance-${start}-${end}` }} />
              {weeklyData.length > 0 && (
                <div className="card p-5">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Weekly Case Counts</h3>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={weeklyData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="week" tick={{ fontSize: 11 }} tickFormatter={(v) => formatDate(v)} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip labelFormatter={(l) => `Week of ${formatDate(String(l))}`} />
                      <Bar dataKey="visits" name="Cases" fill="#f97316" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
              <div className="card p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">All Reported Conditions</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {diagnoses.slice(0, 18).map((d, i) => (
                    <div key={i} className="flex justify-between items-center px-3 py-2 bg-gray-50 rounded-lg text-xs">
                      <span className="text-gray-600 truncate">{d.diagnosis_name}</span>
                      <span className="font-bold text-orange-600 ml-2">{d.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {sub === 'malaria' && (
            <div className="space-y-4">
              <ReportBar title="Malaria Cases & Treatment Report" csvData={malaria} csvFile={`malaria-${start}-${end}.csv`} exportConfig={{ endpoint: '/reports/clinical-activity', params: { start_date: start, end_date: end }, filename: `malaria-${start}-${end}` }} />
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <StatCard label="Malaria Cases" value={formatNumber(malaria.reduce((s, d) => s + d.count, 0))} color="text-orange-600" />
                <StatCard label="Variants Recorded" value={malaria.length} />
                <StatCard label="Period" value={`${formatDate(start)} – ${formatDate(end)}`} />
              </div>
              <DiseaseTable rows={malaria} color="text-orange-700" />
              <Note text="<strong>GHS Note:</strong> Malaria case data must be submitted monthly to the District Health Directorate and entered into DHIMS2." />
            </div>
          )}

          {sub === 'hiv' && (
            <div className="space-y-4">
              <ReportBar title="HIV/AIDS Testing & Treatment Report" csvData={hiv} csvFile={`hiv-aids-${start}-${end}.csv`} exportConfig={{ endpoint: '/reports/clinical-activity', params: { start_date: start, end_date: end }, filename: `hiv-aids-${start}-${end}` }} />
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <StatCard label="HIV-Related Records" value={formatNumber(hiv.reduce((s, d) => s + d.count, 0))} color="text-red-600" />
                <StatCard label="Period" value={`${formatDate(start)} – ${formatDate(end)}`} />
              </div>
              <DiseaseTable rows={hiv} color="text-red-700" />
              <Note color="blue" text="<strong>Confidentiality:</strong> HIV/AIDS data is strictly confidential. Report aggregate data only to the Ghana AIDS Commission / GHS." />
            </div>
          )}

          {sub === 'tb' && (
            <div className="space-y-4">
              <ReportBar title="Tuberculosis Case Detection & Treatment Report" csvData={tb} csvFile={`tuberculosis-${start}-${end}.csv`} exportConfig={{ endpoint: '/reports/clinical-activity', params: { start_date: start, end_date: end }, filename: `tuberculosis-${start}-${end}` }} />
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <StatCard label="TB Cases" value={formatNumber(tb.reduce((s, d) => s + d.count, 0))} color="text-purple-600" />
                <StatCard label="Period" value={`${formatDate(start)} – ${formatDate(end)}`} />
              </div>
              <DiseaseTable rows={tb} color="text-purple-700" />
              <Note text="<strong>NTCP Note:</strong> All TB cases must be registered with the National Tuberculosis Control Programme (NTCP) and entered in the TB register." />
            </div>
          )}
        </>
      )}

      {!data && !isLoading && start && end && <Empty Icon={Activity} msg="No surveillance data for selected period" />}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// 3. ADMINISTRATIVE & MANAGEMENT
// ────────────────────────────────────────────────────────────────────────────
function AdminSection({ start, end }: { start: string; end: string }) {
  type Sub = 'attendance' | 'bed' | 'referral' | 'performance'
  const [sub, setSub] = useState<Sub>('attendance')

  const { data: patData } = useQuery({
    queryKey: ['rpt-admin-patients'],
    queryFn: () => api.get('/patients/dashboard').then((r) => r.data.data),
  })
  const { data: opData } = useQuery({
    queryKey: ['rpt-admin-ops'],
    queryFn: () => api.get('/dashboard/operational').then((r) => r.data.data),
  })
  const { data: kpiData } = useQuery({
    queryKey: ['rpt-admin-kpis'],
    queryFn: () => api.get('/dashboard/kpis').then((r) => r.data.data),
  })
  const { data: demoData } = useQuery({
    queryKey: ['rpt-admin-demo', start, end],
    queryFn: () =>
      api.get('/reports/patient-demographics', { params: { start_date: start, end_date: end } })
        .then((r) => r.data.data),
    enabled: sub === 'attendance' && !!start && !!end,
  })

  const subTabs: { id: Sub; label: string }[] = [
    { id: 'attendance',  label: 'Patient Attendance Statistics' },
    { id: 'bed',         label: 'Bed Occupancy Report' },
    { id: 'referral',    label: 'Referral Report' },
    { id: 'performance', label: 'Service Delivery Performance' },
  ]

  return (
    <div className="space-y-4">
      <SubTabs tabs={subTabs} active={sub} onChange={setSub} accent="bg-indigo-50 border-indigo-300 text-indigo-700" />

      {sub === 'attendance' && (
        <div className="space-y-4">
          <ReportBar title="Patient Attendance Statistics" exportConfig={{ endpoint: '/reports/patient-demographics', params: { start_date: start, end_date: end }, filename: `attendance-stats-${start}-${end}` }} />
          {patData ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="Total Registered" value={formatNumber(patData.stats?.total_patients ?? 0)} color="text-indigo-600" />
                <StatCard label="Male" value={formatNumber(patData.stats?.male_count ?? 0)} />
                <StatCard label="Female" value={formatNumber(patData.stats?.female_count ?? 0)} />
                <StatCard label="New (Last 30 Days)" value={formatNumber(patData.stats?.new_patients_30d ?? 0)} color="text-green-600" />
              </div>
              {demoData?.monthly_trend?.length > 0 && (
                <div className="card p-5">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Monthly Registration Trend</h3>
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={demoData.monthly_trend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Line type="monotone" dataKey="new_patients" name="New Patients" stroke="#6366f1" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
              {demoData && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {Object.entries(demoData)
                    .filter(([, v]) => typeof v === 'number' || typeof v === 'string')
                    .slice(0, 6)
                    .map(([k, v]) => (
                      <StatCard key={k} label={k.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())} value={typeof v === 'number' ? formatNumber(v) : String(v)} />
                    ))}
                </div>
              )}
            </>
          ) : <Empty Icon={Users} msg="Patient data unavailable" />}
        </div>
      )}

      {sub === 'bed' && (
        <div className="space-y-4">
          <ReportBar title="Bed Occupancy Report" />
          {opData ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="Total Beds" value={opData.beds?.total_beds ?? '—'} />
                <StatCard label="Occupied" value={opData.beds?.occupied_beds ?? '—'} color="text-orange-600" />
                <StatCard label="Available" value={opData.beds ? (Number(opData.beds.total_beds ?? 0) - Number(opData.beds.occupied_beds ?? 0)) : '—'} color="text-green-600" />
                <StatCard label="Occupancy Rate" value={opData.beds?.occupancy_rate ? `${Number(opData.beds.occupancy_rate).toFixed(1)}%` : '—'} color="text-indigo-600" />
              </div>
            </>
          ) : <Empty Icon={Building2} msg="Operational data unavailable" />}
          <Note text="<strong>DHIMS2:</strong> Bed occupancy data is collected monthly and submitted as part of the hospital administration report." />
        </div>
      )}

      {sub === 'referral' && (
        <div className="space-y-4">
          <ReportBar title="Referral Report" />
          {opData ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <StatCard label="Referrals In (last 30 days)" value={opData.referrals?.referrals_in ?? '—'} color="text-green-600" />
              <StatCard label="Self-Referrals (last 30 days)" value={opData.referrals?.self_referrals ?? '—'} />
              <StatCard label="Referrals Out" value="Not tracked" color="text-gray-400" />
            </div>
          ) : <Empty Icon={ChevronRight} msg="Referral data unavailable" />}
          <Note text="<strong>Note:</strong> Referrals In and Self-Referrals are derived from the visits table. Outbound referral tracking requires a dedicated referrals module." />
        </div>
      )}

      {sub === 'performance' && (
        <div className="space-y-4">
          <ReportBar title="Service Delivery Performance Report" />
          {kpiData ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {Object.entries(kpiData).slice(0, 12).map(([k, v]) => {
                const numVal = v === null || v === undefined ? 0 : Number(v)
                const isAvgDuration = k === 'avg_visit_duration'
                const displayVal = isAvgDuration
                  ? `${Math.round(numVal)} min`
                  : typeof v === 'number' || v === null
                    ? formatNumber(numVal)
                    : String(v ?? '—')
                return (
                  <StatCard key={k} label={k.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())} value={displayVal} />
                )
              })}
            </div>
          ) : <Empty Icon={TrendingUp} msg="KPI data unavailable" />}
        </div>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// 4. FINANCIAL
// ────────────────────────────────────────────────────────────────────────────
function FinancialSection({ start, end }: { start: string; end: string }) {
  type Sub = 'revenue' | 'insurance' | 'outstanding' | 'payments' | 'budget' | 'procurement'
  const [sub, setSub] = useState<Sub>('revenue')

  const { data: revData, isLoading: revLoading } = useQuery({
    queryKey: ['rpt-fin-revenue', start, end],
    queryFn: () =>
      api.get('/reports/financial', { params: { start_date: start, end_date: end } })
        .then((r) => r.data.data),
    enabled: !!start && !!end,
  })
  const { data: insData, isLoading: insLoading } = useQuery({
    queryKey: ['rpt-fin-insurance', start, end],
    queryFn: () =>
      api.get('/insurance/stats', { params: { start_date: start, end_date: end } })
        .then((r) => r.data.data),
    enabled: sub === 'insurance' && !!start && !!end,
  })
  const { data: outData, isLoading: outLoading } = useQuery({
    queryKey: ['rpt-fin-outstanding'],
    queryFn: () => api.get('/billing/reports/outstanding').then((r) => r.data.data),
    enabled: sub === 'outstanding',
  })
  const { data: pmData, isLoading: pmLoading } = useQuery({
    queryKey: ['rpt-fin-payments', start, end],
    queryFn: () =>
      api.get('/billing/reports/payment-methods', { params: { start_date: start, end_date: end } })
        .then((r) => r.data.data),
    enabled: sub === 'payments' && !!start && !!end,
  })

  const subTabs: { id: Sub; label: string }[] = [
    { id: 'revenue',     label: 'Revenue & Expenditure' },
    { id: 'insurance',   label: 'NHIA / Insurance Claims' },
    { id: 'outstanding', label: 'Outstanding Payments' },
    { id: 'payments',    label: 'Payment Methods Analysis' },
    { id: 'budget',      label: 'Budget Performance' },
    { id: 'procurement', label: 'Procurement & Payments' },
  ]

  const pmRows: Record<string, unknown>[] = Array.isArray(pmData) ? pmData : []

  return (
    <div className="space-y-4">
      <SubTabs tabs={subTabs} active={sub} onChange={setSub} accent="bg-green-50 border-green-300 text-green-700" />

      {sub === 'revenue' && (
        <div className="space-y-4">
          <ReportBar title="Revenue & Expenditure Report" csvData={revData?.daily_trend ?? []} csvFile={`revenue-${start}-${end}.csv`} emailProps={{ reportType: 'Revenue & Expenditure Report', start, end }} exportConfig={{ endpoint: '/reports/financial', params: { start_date: start, end_date: end }, filename: `revenue-expenditure-${start}-${end}` }} />
          {revLoading && <Loading />}
          {revData ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="Total Revenue" value={formatCurrency(revData.summary?.total_revenue ?? 0)} color="text-green-600" />
                <StatCard label="Transactions" value={formatNumber(revData.summary?.transaction_count ?? 0)} color="text-blue-600" />
                <StatCard label="Unique Patients" value={formatNumber(revData.summary?.paying_patients ?? 0)} color="text-purple-600" />
                <StatCard label="Avg Transaction" value={formatCurrency(revData.summary?.avg_transaction ?? 0)} color="text-indigo-600" />
              </div>
              {revData.daily_trend?.length > 0 && (
                <div className="card p-5">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Daily Revenue Trend</h3>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={revData.daily_trend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => formatDate(v)} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `₵${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v) => [formatCurrency(Number(v)), 'Revenue']} />
                      <Bar dataKey="revenue" fill="#10b981" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </>
          ) : !revLoading && start && end && <Empty Icon={DollarSign} msg="No revenue data for selected period" />}
        </div>
      )}

      {sub === 'insurance' && (
        <div className="space-y-4">
          <ReportBar title="NHIA / Insurance Claims Report" />
          {insLoading && <Loading />}
          {insData ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="Total Claims" value={formatNumber(insData.summary?.total_claims ?? 0)} />
              <StatCard label="Approved" value={formatNumber(insData.summary?.approved_count ?? 0)} color="text-green-600" />
              <StatCard label="Paid" value={formatNumber(insData.summary?.paid_count ?? 0)} color="text-blue-600" />
              <StatCard label="Rejected" value={formatNumber(insData.summary?.rejected_count ?? 0)} color="text-red-600" />
            </div>
          ) : !insLoading && <Empty Icon={DollarSign} msg="No insurance data for selected period" />}
          <Note text="<strong>NHIA:</strong> Insurance claims must be submitted monthly to the National Health Insurance Authority. Approved amounts are reimbursed within 30–90 days." />
        </div>
      )}

      {sub === 'outstanding' && (
        <div className="space-y-4">
          <ReportBar title="Outstanding Payments Report" />
          {outLoading && <Loading />}
          {outData ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <StatCard label="Total Outstanding" value={formatCurrency(outData.total_outstanding ?? 0)} color="text-red-600" />
              <StatCard label="Overdue Amount" value={formatCurrency(outData.overdue_amount ?? 0)} color="text-orange-600" />
              <StatCard label="Number of Invoices" value={formatNumber(outData.invoice_count ?? 0)} />
            </div>
          ) : !outLoading && <Empty Icon={DollarSign} msg="No outstanding payment data" />}
        </div>
      )}

      {sub === 'payments' && (
        <div className="space-y-4">
          <ReportBar title="Payment Methods Analysis" csvData={pmRows} csvFile={`payment-methods-${start}-${end}.csv`} />
          {pmLoading && <Loading />}
          {pmRows.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="card p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Distribution</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={pmRows} dataKey="total_amount" nameKey="payment_method" cx="50%" cy="50%" outerRadius={80}
                      label={({ name, percent }: { name: string; percent: number }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                      {pmRows.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="card p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Breakdown</h3>
                <div className="space-y-2">
                  {pmRows.map((d, i) => (
                    <div key={i} className="flex justify-between py-1.5 border-b border-gray-50 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                        <span className="text-gray-700">{String(d.method ?? d.payment_method ?? '—')}</span>
                      </div>
                      <span className="font-semibold text-gray-900">{formatCurrency(Number(d.total_amount ?? d.amount ?? 0))}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : !pmLoading && <Empty Icon={DollarSign} msg="No payment data for selected period" />}
        </div>
      )}

      {sub === 'budget' && (
        <div className="space-y-4">
          <ReportBar title="Budget Performance Report" emailProps={{ reportType: 'Budget Performance Report', start, end }} exportConfig={{ endpoint: '/reports/financial', params: { start_date: start, end_date: end }, filename: `budget-performance-${start}-${end}` }} />
          <Note color="blue" text="<strong>Note:</strong> Budget vs. actual expenditure tracking requires integration with the hospital's accounting/finance system. The figures below reflect recorded revenue as a proxy." />
          {revData ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <StatCard label="Total Revenue (Actual)" value={formatCurrency(revData.summary?.total_revenue ?? 0)} color="text-green-600" />
                <StatCard label="Transactions" value={formatNumber(revData.summary?.transaction_count ?? 0)} />
                <StatCard label="Avg Transaction" value={formatCurrency(revData.summary?.avg_transaction ?? 0)} color="text-purple-600" />
              </div>
              <div className="card p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Budget Performance Summary</h3>
                <div className="space-y-3">
                  {[
                    { line: 'Revenue collected', value: formatCurrency(revData.summary?.total_revenue ?? 0), note: 'Actual receipts for period' },
                    { line: 'Transactions processed', value: formatNumber(revData.summary?.transaction_count ?? 0), note: 'Total payment transactions' },
                    { line: 'Unique paying patients', value: formatNumber(revData.summary?.paying_patients ?? 0), note: 'Distinct patients billed' },
                    { line: 'Average transaction', value: formatCurrency(revData.summary?.avg_transaction ?? 0), note: 'Mean payment amount' },
                  ].map((r, i) => (
                    <div key={i} className="flex justify-between items-center py-2 border-b border-gray-50">
                      <div>
                        <p className="text-sm font-medium text-gray-800">{r.line}</p>
                        <p className="text-xs text-gray-400">{r.note}</p>
                      </div>
                      <span className={`text-sm font-bold ${'color' in r ? r.color : 'text-gray-900'}`}>{r.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : revLoading ? <Loading /> : <Empty Icon={DollarSign} msg="No financial data for selected period" />}
          <Note text="<strong>MOH/GHS:</strong> Annual budget performance reports are submitted to the Regional Health Directorate and the Ghana Health Service. Internal audit is conducted quarterly." />
        </div>
      )}

      {sub === 'procurement' && (
        <div className="space-y-4">
          <ReportBar title="Procurement & Payment Report" emailProps={{ reportType: 'Procurement & Payment Report', start, end }} exportConfig={{ endpoint: '/reports/financial', params: { start_date: start, end_date: end }, filename: `procurement-payment-${start}-${end}` }} />
          <Note color="blue" text="<strong>Note:</strong> Detailed procurement records are managed separately in the procurement system. This view reflects pharmacy and supply-related financial activity." />
          {revData ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <StatCard label="Total Payments Received" value={formatCurrency(revData.summary?.total_revenue ?? 0)} color="text-green-600" />
              <StatCard label="Outstanding Balances" value={formatCurrency(outData?.total_outstanding ?? 0)} color="text-red-600" />
              <StatCard label="Period" value={`${formatDate(start)} – ${formatDate(end)}`} />
            </div>
          ) : revLoading ? <Loading /> : <Empty Icon={DollarSign} msg="No data for selected period" />}
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Procurement Reporting Checklist</h3>
            <ul className="space-y-2 text-sm text-gray-600">
              {[
                'Medicines & consumables procurement (local purchases)',
                'Medical equipment procurement and maintenance costs',
                'Supplier invoices and payment vouchers',
                'Procurement committee minutes and approvals',
                'Value for money assessment documentation',
                'GHS/MOH procurement guidelines compliance',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <FileText className="w-3.5 h-3.5 text-green-500 mt-0.5 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <Note text="<strong>PPA Compliance:</strong> All procurement above threshold values must follow the Public Procurement Authority (PPA) guidelines. Records must be maintained for audit purposes." />
        </div>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// 5. PHARMACY & LOGISTICS
// ────────────────────────────────────────────────────────────────────────────
function PharmacySection({ start, end }: { start: string; end: string }) {
  type Sub = 'consumption' | 'stock' | 'expired' | 'lowstock' | 'vaccines' | 'supplies'
  const [sub, setSub] = useState<Sub>('consumption')

  const { data: consumptionData, isLoading: cL } = useQuery({
    queryKey: ['rpt-pharm-consumption', start, end],
    queryFn: () =>
      api.get('/pharmacy/reports/consumption', { params: { start_date: start, end_date: end } })
        .then((r) => r.data.data),
    enabled: sub === 'consumption' && !!start && !!end,
  })
  const { data: inventoryData, isLoading: iL } = useQuery({
    queryKey: ['rpt-pharm-inventory'],
    queryFn: () => api.get('/pharmacy/reports/inventory-value').then((r) => r.data.data),
    enabled: sub === 'stock',
  })
  const { data: expiryData, isLoading: eL } = useQuery({
    queryKey: ['rpt-pharm-expiry'],
    queryFn: () => api.get('/pharmacy/reports/expiry').then((r) => r.data.data),
    enabled: sub === 'expired',
  })
  const { data: lowStockData, isLoading: lL } = useQuery({
    queryKey: ['rpt-pharm-lowstock'],
    queryFn: () => api.get('/pharmacy/alerts/low-stock').then((r) => r.data.data),
    enabled: sub === 'lowstock',
  })

  const subTabs: { id: Sub; label: string }[] = [
    { id: 'consumption', label: 'Drug Consumption' },
    { id: 'stock',       label: 'Stock Balance' },
    { id: 'expired',     label: 'Expired Drugs' },
    { id: 'lowstock',    label: 'Low Stock Alerts' },
    { id: 'vaccines',    label: 'Vaccine Stock' },
    { id: 'supplies',    label: 'Medical Supplies' },
  ]

  const loading = cL || iL || eL || lL
  const consumptionRows: Record<string, unknown>[] = Array.isArray(consumptionData) ? consumptionData : (consumptionData?.items ?? [])
  const expiryRows: Record<string, unknown>[] = Array.isArray(expiryData) ? expiryData : (expiryData?.items ?? [])
  const lowRows: Record<string, unknown>[] = Array.isArray(lowStockData) ? lowStockData : (lowStockData?.items ?? lowStockData?.drugs ?? [])

  function DrugTable({ rows, cols }: { rows: Record<string, unknown>[]; cols: { key: string; header: string; className?: string }[] }) {
    if (!rows.length) return null
    return (
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              {cols.map((c) => (
                <th key={c.key} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{c.header}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.slice(0, 25).map((d, i) => (
              <tr key={i} className="hover:bg-gray-50">
                {cols.map((c) => (
                  <td key={c.key} className={`px-4 py-2.5 ${c.className ?? 'text-gray-700'}`}>{String(d[c.key] ?? '—')}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <SubTabs tabs={subTabs} active={sub} onChange={setSub} accent="bg-purple-50 border-purple-300 text-purple-700" />
      {loading && <Loading />}

      {sub === 'consumption' && !cL && (
        <div className="space-y-4">
          <ReportBar title="Drug Consumption Report" csvData={consumptionRows} csvFile={`drug-consumption-${start}-${end}.csv`} />
          {consumptionRows.length > 0 ? (
            <DrugTable
              rows={consumptionRows}
              cols={[
                { key: 'drug_name',          header: 'Drug Name',     className: 'font-medium text-gray-900' },
                { key: 'category',           header: 'Category',      className: 'text-gray-500' },
                { key: 'quantity_dispensed', header: 'Qty Dispensed', className: 'text-purple-700 font-semibold' },
                { key: 'unit',               header: 'Unit',          className: 'text-gray-500' },
              ]}
            />
          ) : start && end && <Empty Icon={Pill} msg="No consumption data for selected period" />}
          <Note text="<strong>LMIS:</strong> Drug consumption data is reported monthly through the Logistics Management Information System (LMIS / eLMIS)." />
        </div>
      )}

      {sub === 'stock' && !iL && (
        <div className="space-y-4">
          <ReportBar title="Stock Balance Report" exportConfig={{ endpoint: '/reports/inventory', params: {}, filename: 'stock-balance' }} />
          {inventoryData ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <StatCard label="Total Items" value={formatNumber(inventoryData.total_items ?? 0)} />
                <StatCard label="Total Value" value={formatCurrency(inventoryData.total_value ?? 0)} color="text-purple-600" />
                <StatCard label="Categories" value={inventoryData.category_count ?? '—'} />
              </div>
              {inventoryData.by_category?.length > 0 && (
                <div className="card p-5">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Stock Value by Category</h3>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={inventoryData.by_category} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `₵${(v / 1000).toFixed(0)}k`} />
                      <YAxis type="category" dataKey="category" tick={{ fontSize: 11 }} width={130} />
                      <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                      <Bar dataKey="value" fill="#8b5cf6" radius={[0, 3, 3, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </>
          ) : <Empty Icon={Pill} msg="Stock data unavailable" />}
        </div>
      )}

      {sub === 'expired' && !eL && (
        <div className="space-y-4">
          <ReportBar title="Expired Drugs Report" csvData={expiryRows} csvFile="expired-drugs.csv" />
          {expiryRows.length > 0 ? (
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    {['Drug Name', 'Batch No.', 'Expiry Date', 'Qty', 'Status'].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {expiryRows.slice(0, 25).map((d, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-medium text-gray-900">{String(d.drug_name ?? d.name ?? '—')}</td>
                      <td className="px-4 py-2.5 text-gray-500 font-mono text-xs">{String(d.batch_number ?? '—')}</td>
                      <td className="px-4 py-2.5 text-red-600">{d.expiry_date ? formatDate(String(d.expiry_date)) : '—'}</td>
                      <td className="px-4 py-2.5 text-gray-700">{String(d.quantity ?? '—')}</td>
                      <td className="px-4 py-2.5">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${d.is_expired ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                          {d.is_expired ? 'Expired' : 'Near Expiry'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="card p-6 text-center">
              <Pill className="w-8 h-8 mx-auto mb-2 text-green-400" />
              <p className="text-sm text-gray-500">No expired or near-expiry drugs found.</p>
            </div>
          )}
        </div>
      )}

      {sub === 'lowstock' && !lL && (
        <div className="space-y-4">
          <ReportBar title="Low Stock Alerts" csvData={lowRows} csvFile="low-stock.csv" />
          {lowRows.length > 0 ? (
            <DrugTable
              rows={lowRows}
              cols={[
                { key: 'drug_name',     header: 'Drug Name',    className: 'font-medium text-gray-900' },
                { key: 'current_stock', header: 'Current Stock', className: 'text-red-600 font-semibold' },
                { key: 'reorder_level', header: 'Reorder Level', className: 'text-gray-500' },
                { key: 'unit',          header: 'Unit',          className: 'text-gray-500' },
              ]}
            />
          ) : (
            <div className="card p-6 text-center">
              <Pill className="w-8 h-8 mx-auto mb-2 text-green-400" />
              <p className="text-sm text-gray-500">All stock levels are adequate.</p>
            </div>
          )}
        </div>
      )}

      {sub === 'vaccines' && (
        <div className="space-y-4">
          <ReportBar title="Vaccine Stock Report" emailProps={{ reportType: 'Vaccine Stock Report', start, end }} />
          {inventoryData ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <StatCard label="Total Drug Items" value={formatNumber(inventoryData.total_items ?? 0)} />
                <StatCard label="Total Stock Value" value={formatCurrency(inventoryData.total_value ?? 0)} color="text-purple-600" />
                <StatCard label="Categories" value={inventoryData.category_count ?? '—'} />
              </div>
              <div className="card p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">EPI Vaccine Stock Monitoring Checklist</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {['BCG', 'OPV (Oral Polio)', 'Penta (DPT-HepB-Hib)', 'PCV13 (Pneumococcal)', 'Rotavirus', 'IPV (Inactivated Polio)', 'MR (Measles-Rubella)', 'Yellow Fever', 'Meningococcal (MenA)', 'TT (Tetanus Toxoid)'].map((vax) => (
                    <div key={vax} className="flex items-center gap-2 px-3 py-2 bg-teal-50 rounded-lg text-xs text-teal-800 border border-teal-100">
                      <Pill className="w-3 h-3 text-teal-500 shrink-0" />
                      {vax}
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : iL ? <Loading /> : <Empty Icon={Pill} msg="Vaccine inventory data unavailable" />}
          <Note text="<strong>GHS / EPI:</strong> Vaccine stock balances are reported monthly through the national cold chain and LMIS system. All EPI vaccines must be stored at 2–8°C and stock-outs reported to the District Pharmacist immediately." />
        </div>
      )}

      {sub === 'supplies' && (
        <div className="space-y-4">
          <ReportBar title="Medical Supplies Report" emailProps={{ reportType: 'Medical Supplies Report', start, end }} />
          {inventoryData ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <StatCard label="Total Items" value={formatNumber(inventoryData.total_items ?? 0)} />
                <StatCard label="Total Value" value={formatCurrency(inventoryData.total_value ?? 0)} color="text-purple-600" />
                <StatCard label="Categories" value={inventoryData.category_count ?? '—'} />
              </div>
              {inventoryData.by_category?.length > 0 && (
                <div className="card p-5">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Supplies by Category</h3>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={inventoryData.by_category} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `₵${(v / 1000).toFixed(0)}k`} />
                      <YAxis type="category" dataKey="category" tick={{ fontSize: 11 }} width={130} />
                      <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                      <Bar dataKey="value" fill="#6366f1" radius={[0, 3, 3, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </>
          ) : iL ? <Loading /> : <Empty Icon={Pill} msg="Supplies data unavailable" />}
          <Note text="<strong>LMIS:</strong> Medical supplies (gloves, syringes, dressings, etc.) are tracked monthly through the Logistics Management Information System (eLMIS). Reports go to the District Medical Store." />
        </div>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// 6. HUMAN RESOURCES
// ────────────────────────────────────────────────────────────────────────────
function HRSection({ start, end }: { start: string; end: string }) {
  type Sub = 'overview' | 'departmental' | 'attendance' | 'training' | 'attrition' | 'payroll'
  const [sub, setSub] = useState<Sub>('overview')

  const { data, isLoading } = useQuery({
    queryKey: ['rpt-hr-branches'],
    queryFn: () => api.get('/branches/overview').then((r) => r.data.data),
  })
  const { data: opData } = useQuery({
    queryKey: ['rpt-hr-ops'],
    queryFn: () => api.get('/dashboard/operational').then((r) => r.data.data),
  })

  const subTabs: { id: Sub; label: string }[] = [
    { id: 'overview',     label: 'Staff Overview' },
    { id: 'departmental', label: 'Departmental Staffing' },
    { id: 'attendance',   label: 'Staff Attendance' },
    { id: 'training',     label: 'Staff Training' },
    { id: 'attrition',    label: 'Recruitment & Attrition' },
    { id: 'payroll',      label: 'Payroll & Allowances' },
  ]

  return (
    <div className="space-y-4">
      <SubTabs
        tabs={subTabs}
        active={sub}
        onChange={setSub}
        accent="bg-pink-50 border-pink-300 text-pink-700"
      />
      {isLoading && <Loading />}

      {sub === 'overview' && (
        <div className="space-y-4">
          <ReportBar title="Staff Overview Report" emailProps={{ reportType: 'Staff Overview Report', start, end }} />
          {data ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="Total Staff" value={formatNumber(data.total_staff ?? 0)} color="text-pink-600" />
                <StatCard label="Departments" value={formatNumber(data.total_departments ?? 0)} />
                <StatCard label="Branches" value={formatNumber(data.total_branches ?? 0)} />
                <StatCard label="Active Staff" value={formatNumber(data.active_staff ?? data.total_staff ?? 0)} color="text-green-600" />
              </div>
              {data.branches?.length > 0 && (
                <div className="card p-5">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Staff Per Branch</h3>
                  <div className="space-y-1.5">
                    {data.branches.map((b: Record<string, unknown>, i: number) => (
                      <div key={i} className="flex justify-between py-1.5 border-b border-gray-50 text-sm">
                        <span className="text-gray-700">{String(b.name)}</span>
                        <span className="font-semibold text-gray-900">{String(b.staff_count ?? b.total_staff ?? '—')} staff</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : !isLoading && <Empty Icon={UserCheck} msg="Staff data unavailable" />}
          <Note color="blue" text="<strong>HRHIS Note:</strong> Staff headcount and deployment data are submitted quarterly to the Human Resource for Health Directorate via the Health Workforce Information System (HRHIS)." />
        </div>
      )}

      {sub === 'departmental' && (
        <div className="space-y-4">
          <ReportBar title="Departmental Staffing Report" emailProps={{ reportType: 'Departmental Staffing Report', start, end }} />
          {opData?.departments?.length > 0 ? (
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Staff Distribution by Department</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={opData.departments} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={140} />
                  <Tooltip />
                  <Bar dataKey="staff_count" name="Staff" fill="#ec4899" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <Empty Icon={UserCheck} msg="Departmental staffing data unavailable" />}
        </div>
      )}

      {sub === 'attendance' && (
        <div className="space-y-4">
          <ReportBar title="Staff Attendance Report" emailProps={{ reportType: 'Staff Attendance Report', start, end }} />
          <Note color="blue" text="<strong>Note:</strong> Staff attendance data is managed in the HR/payroll system or biometric attendance device. This report should be exported from the dedicated attendance module." />
          {data && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <StatCard label="Total Staff" value={formatNumber(data.total_staff ?? 0)} color="text-pink-600" />
              <StatCard label="Period" value={`${formatDate(start)} – ${formatDate(end)}`} />
              <StatCard label="Departments" value={formatNumber(data.total_departments ?? 0)} />
            </div>
          )}
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Attendance Report Components</h3>
            <ul className="space-y-2 text-sm text-gray-600">
              {[
                'Daily sign-in/sign-out records (biometric or manual)',
                'Absences with approved reasons (sick leave, annual leave)',
                'Lateness and early departure records',
                'Overtime and on-call hours',
                'Summary: days worked vs. scheduled per staff member',
                'Departmental attendance percentage',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <UserCheck className="w-3.5 h-3.5 text-pink-400 mt-0.5 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {sub === 'training' && (
        <div className="space-y-4">
          <ReportBar title="Staff Training Report" emailProps={{ reportType: 'Staff Training Report', start, end }} />
          <Note color="blue" text="<strong>Note:</strong> Training records are maintained by the HR/Training department. Use this section to summarise training activities for the report period." />
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Training Report Template</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {['Training Programme', 'Category', 'No. Staff Trained', 'Duration', 'Facilitator'].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {[
                    { programme: 'Infection Prevention & Control', category: 'Clinical', note: 'Add data' },
                    { programme: 'Basic Life Support (BLS)', category: 'Clinical', note: 'Add data' },
                    { programme: 'Patient Safety & Quality', category: 'Quality', note: 'Add data' },
                    { programme: 'Health Records Management', category: 'Admin', note: 'Add data' },
                  ].map((r, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-medium text-gray-900">{r.programme}</td>
                      <td className="px-4 py-2.5 text-gray-500">{r.category}</td>
                      <td className="px-4 py-2.5 text-gray-400 italic text-xs">{r.note}</td>
                      <td className="px-4 py-2.5 text-gray-400 italic text-xs">Enter data</td>
                      <td className="px-4 py-2.5 text-gray-400 italic text-xs">Enter data</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <Note text="<strong>HRHIS:</strong> Staff training records are submitted annually to the Human Resource for Health Directorate and used to track CPD (Continuing Professional Development) compliance across all cadres." />
        </div>
      )}

      {sub === 'attrition' && (
        <div className="space-y-4">
          <ReportBar title="Staff Recruitment & Attrition Report" emailProps={{ reportType: 'Staff Recruitment & Attrition Report', start, end }} />
          {data ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="Current Total Staff" value={formatNumber(data.total_staff ?? 0)} color="text-pink-600" />
              <StatCard label="Departments" value={formatNumber(data.total_departments ?? 0)} />
              <StatCard label="Active Branches" value={formatNumber(data.total_branches ?? 0)} />
              <StatCard label="Period" value={`${formatDate(start)} – ${formatDate(end)}`} />
            </div>
          ) : <Empty Icon={UserCheck} msg="Staff data unavailable" />}
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Attrition & Recruitment Indicators</h3>
            <ul className="space-y-2 text-sm text-gray-600">
              {[
                'Number of new staff recruited in period',
                'Number of staff who resigned / retired / transferred',
                'Attrition rate (%) = departures ÷ average headcount × 100',
                'Position vacancy rate by department',
                'Average time-to-fill vacancies',
                'Reasons for departure (exit interview summary)',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <Users className="w-3.5 h-3.5 text-pink-400 mt-0.5 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <Note text="<strong>GHS:</strong> Workforce attrition data is reported to the Regional Health Directorate annually and informs health workforce planning at district and regional levels." />
        </div>
      )}

      {sub === 'payroll' && (
        <div className="space-y-4">
          <ReportBar title="Payroll & Allowances Report" emailProps={{ reportType: 'Payroll & Allowances Report', start, end }} />
          <Note color="amber" text="<strong>Confidential:</strong> Payroll data is highly confidential. Ensure only authorised personnel have access. This report is prepared by the Finance/HR department." />
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Payroll Report Components</h3>
            <ul className="space-y-2 text-sm text-gray-600">
              {[
                'Basic salaries by grade/cadre',
                'Allowances (housing, transport, risk, performance)',
                'SSNIT (Social Security) contributions',
                'NHIS staff deductions',
                'Professional (CAGD) deductions',
                'Net pay summary by department',
                'Leave pay and overtime payments',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <DollarSign className="w-3.5 h-3.5 text-yellow-500 mt-0.5 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <Note text="<strong>CAGD / GHS:</strong> Government hospital payroll is processed through the Controller and Accountant General's Department (CAGD). Private hospital payroll must comply with the Labour Act, 2003 (Act 651)." />
        </div>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// 7. QUALITY ASSURANCE
// ────────────────────────────────────────────────────────────────────────────
function QualitySection({ start, end }: { start: string; end: string }) {
  type Sub = 'incidents' | 'infection' | 'audit' | 'complaints'
  const [sub, setSub] = useState<Sub>('incidents')

  const { data, isLoading } = useQuery({
    queryKey: ['rpt-quality-clinical', start, end],
    queryFn: () =>
      api.get('/reports/clinical-activity', { params: { start_date: start, end_date: end } })
        .then((r) => r.data.data),
    enabled: !!start && !!end,
  })
  const { data: labData, isLoading: labLoading } = useQuery({
    queryKey: ['rpt-quality-lab', start, end],
    queryFn: () =>
      api.get('/reports/lab', { params: { start_date: start, end_date: end } })
        .then((r) => r.data.data),
    enabled: sub === 'audit' && !!start && !!end,
  })

  const summary = data?.summary ?? {}
  const diagnoses: { diagnosis_name: string; count: number }[] = data?.top_diagnoses ?? []

  const infectionDx = diagnoses.filter((d) =>
    ['infection', 'sepsis', 'pneumonia', 'wound', 'catheter', 'uti', 'abscess', 'cellulitis'].some((k) =>
      d.diagnosis_name?.toLowerCase().includes(k),
    ),
  )

  return (
    <div className="space-y-4">
      <SubTabs
        tabs={[
          { id: 'incidents',  label: 'Patient Safety Incidents' },
          { id: 'infection',  label: 'Infection Prevention & Control' },
          { id: 'audit',      label: 'Clinical Audit' },
          { id: 'complaints', label: 'Complaints & Incidents' },
        ]}
        active={sub}
        onChange={setSub}
        accent="bg-red-50 border-red-300 text-red-700"
      />

      {(!start || !end) && <Note text="<strong>Select a date range</strong> above to generate this report." />}
      {(isLoading || labLoading) && <Loading />}

      {sub === 'incidents' && data && (
        <div className="space-y-4">
          <ReportBar title="Patient Safety Incidents Report" emailProps={{ reportType: 'Patient Safety Incidents Report', start, end }} />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <StatCard label="Emergency Cases" value={formatNumber(summary.emergency_visits ?? 0)} color="text-red-600" />
            <StatCard label="Total Visits" value={formatNumber(summary.total_visits ?? 0)} />
            <StatCard label="Emergency Rate" value={`${summary.total_visits ? Math.round(((summary.emergency_visits ?? 0) / summary.total_visits) * 100) : 0}%`} />
          </div>
          <div className="card p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Incident Reporting Checklist</h3>
            <ul className="space-y-1.5 text-sm text-gray-600">
              {['Adverse drug reactions', 'Falls and injuries within facility', 'Patient misidentification', 'Retained surgical instruments', 'Hospital-acquired infections', 'Wrong-site procedures'].map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <Note text="<strong>HEFRA Note:</strong> Patient safety incidents must be reported to the Health Facilities Regulatory Agency (HEFRA). Maintain an incident register and submit quarterly reports." />
        </div>
      )}

      {sub === 'infection' && data && (
        <div className="space-y-4">
          <ReportBar title="Infection Prevention & Control Report" csvData={infectionDx.map((d) => ({ diagnosis: d.diagnosis_name, cases: d.count }))} csvFile={`ipc-${start}-${end}.csv`} emailProps={{ reportType: 'Infection Prevention & Control Report', start, end }} exportConfig={{ endpoint: '/reports/clinical-activity', params: { start_date: start, end_date: end }, filename: `ipc-${start}-${end}` }} />
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Infection-Related Diagnoses</h3>
            {infectionDx.length > 0 ? (
              <div className="space-y-1.5">
                {infectionDx.map((d, i) => (
                  <div key={i} className="flex justify-between py-1.5 border-b border-gray-50 text-sm">
                    <span className="text-gray-700">{d.diagnosis_name}</span>
                    <span className="font-semibold text-red-600">{d.count} cases</span>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-gray-400 text-center py-4">No infection-related diagnoses in this period.</p>}
          </div>
          <Note color="blue" text="<strong>IPC Note:</strong> Hand hygiene compliance, PPE usage, and HAI surveillance data should be collected by the IPC Committee and submitted to GHS quarterly." />
        </div>
      )}

      {sub === 'audit' && data && (
        <div className="space-y-4">
          <ReportBar title="Clinical Audit Report" emailProps={{ reportType: 'Clinical Audit Report', start, end }} exportConfig={{ endpoint: '/reports/clinical-activity', params: { start_date: start, end_date: end }, filename: `clinical-audit-${start}-${end}` }} />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Total Visits" value={formatNumber(summary.total_visits ?? 0)} />
            <StatCard label="Unique Patients" value={formatNumber(summary.unique_patients ?? 0)} />
            <StatCard label="Emergency Rate" value={`${summary.total_visits ? Math.round(((summary.emergency_visits ?? 0) / summary.total_visits) * 100) : 0}%`} />
            <StatCard label="Avg Duration" value={`${Math.round(summary.avg_visit_duration ?? 0)} min`} />
          </div>
          {labData && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <StatCard label="Lab Orders" value={formatNumber(labData.total_orders ?? 0)} color="text-indigo-600" />
              <StatCard label="Completed Tests" value={formatNumber(labData.completed ?? 0)} color="text-green-600" />
              <StatCard label="Pending Tests" value={formatNumber(labData.pending ?? 0)} color="text-yellow-600" />
            </div>
          )}
          <Note text="<strong>QA Note:</strong> Clinical audit findings should be reviewed at the Medical Quality Assurance Committee meeting monthly. Recommendations must be tracked and implementation verified." />
        </div>
      )}

      {sub === 'complaints' && (
        <div className="space-y-4">
          <ReportBar title="Complaints & Incident Report" emailProps={{ reportType: 'Complaints & Incident Report', start, end }} />
          <Note color="blue" text="<strong>Note:</strong> Patient complaints and incident data should be logged in the hospital's complaints register. Use this section to compile the periodic report." />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Emergency Visits" value={formatNumber(summary.emergency_visits ?? 0)} color="text-red-600" />
            <StatCard label="Total Visits" value={formatNumber(summary.total_visits ?? 0)} />
            <StatCard label="Period" value={`${formatDate(start)} – ${formatDate(end)}`} />
          </div>
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Complaint & Incident Categories</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { cat: 'Staff Conduct', items: ['Unprofessional behaviour', 'Verbal or physical abuse', 'Negligence complaints', 'Discrimination'] },
                { cat: 'Clinical Care', items: ['Misdiagnosis / wrong treatment', 'Medication errors', 'Delayed care / long waiting times', 'Inadequate informed consent'] },
                { cat: 'Facility & Safety', items: ['Unsafe environment / injuries', 'Equipment failure', 'Hygiene standards', 'Privacy violations'] },
                { cat: 'Administrative', items: ['Billing disputes / overcharging', 'Record-keeping errors', 'Referral handling', 'Insurance claim disputes'] },
              ].map((section) => (
                <div key={section.cat} className="bg-gray-50 rounded-lg p-3">
                  <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">{section.cat}</h4>
                  <ul className="space-y-1">
                    {section.items.map((item) => (
                      <li key={item} className="flex items-start gap-2 text-xs text-gray-600">
                        <AlertTriangle className="w-3 h-3 text-amber-400 mt-0.5 shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
          <Note text="<strong>HEFRA / GHS:</strong> Patient complaints must be acknowledged within 48 hours and resolved within 30 days. A complaints register (with outcomes) must be available for HEFRA inspection. Serious incidents require a root cause analysis and corrective action plan." />
        </div>
      )}

      {!data && !isLoading && start && end && <Empty Icon={ClipboardCheck} msg="No data for selected period" />}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// 8. ANNUAL PERFORMANCE REPORT
// ────────────────────────────────────────────────────────────────────────────
function AnnualSection({ start, end }: { start: string; end: string }) {
  const [generated, setGenerated] = useState(false)
  const [senderEmail, setSenderEmail] = useState('')
  const [recipients, setRecipients] = useState('')
  const [subject, setSubject] = useState(`Annual Hospital Performance Report ${new Date().getFullYear()}`)
  const [notes, setNotes] = useState('')

  const { data: patData } = useQuery({
    queryKey: ['rpt-annual-patients'],
    queryFn: () => api.get('/patients/dashboard').then((r) => r.data.data),
    enabled: generated,
  })
  const { data: revData } = useQuery({
    queryKey: ['rpt-annual-revenue', start, end],
    queryFn: () =>
      api.get('/reports/financial', { params: { start_date: start, end_date: end } })
        .then((r) => r.data.data),
    enabled: generated && !!start && !!end,
  })
  const { data: clinicalData } = useQuery({
    queryKey: ['rpt-annual-clinical', start, end],
    queryFn: () =>
      api.get('/reports/clinical-activity', { params: { start_date: start, end_date: end } })
        .then((r) => r.data.data),
    enabled: generated && !!start && !!end,
  })
  const { data: branchData } = useQuery({
    queryKey: ['rpt-annual-branches'],
    queryFn: () => api.get('/branches/overview').then((r) => r.data.data),
    enabled: generated,
  })
  const { data: insData } = useQuery({
    queryKey: ['rpt-annual-insurance', start, end],
    queryFn: () => api.get('/insurance/stats', { params: { start_date: start, end_date: end } }).then((r) => r.data.data),
    enabled: generated && !!start && !!end,
  })
  const { data: labData } = useQuery({
    queryKey: ['rpt-annual-lab', start, end],
    queryFn: () =>
      api.get('/reports/lab', { params: { start_date: start, end_date: end } })
        .then((r) => r.data.data),
    enabled: generated && !!start && !!end,
  })

  const sendMutation = useMutation({
    mutationFn: () =>
      api.post('/reports/schedule', {
        report_type: 'annual_performance',
        schedule: { once: true, send_at: new Date().toISOString() },
        recipients: recipients.split(',').map((s) => s.trim()).filter(Boolean),
        params: { start_date: start, end_date: end, sender_email: senderEmail, subject, notes },
      }),
    onSuccess: () => toast.success('Annual report sent successfully'),
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Failed to send report'
      toast.error(msg)
    },
  })

  const hasData = patData || revData || clinicalData

  return (
    <div className="space-y-5">
      <div className="card p-5 bg-amber-50 border border-amber-200">
        <p className="text-sm font-semibold text-amber-800 mb-1">Annual Hospital Performance Report</p>
        <p className="text-xs text-amber-700 leading-relaxed">
          A comprehensive yearly summary covering service statistics, financial performance, HR data, and health outcomes.
          Set the date range to the full reporting year (e.g. 1 Jan – 31 Dec). The report can be submitted directly to regional health authorities via email.
        </p>
      </div>

      {(!start || !end) && <Note text="<strong>Set a date range</strong> (e.g. full year) above before generating the annual report." />}

      <Button onClick={() => setGenerated(true)} leftIcon={<BarChart3 className="w-4 h-4" />} disabled={!start || !end}>
        Generate Annual Report
      </Button>

      {generated && hasData && (
        <>
          <div id="annual-report-content" className="space-y-5">
            <div className="card p-8 border-2 border-amber-200 text-center">
              <Award className="w-12 h-12 mx-auto mb-3 text-amber-500" />
              <h1 className="text-2xl font-bold text-gray-900">Annual Hospital Performance Report</h1>
              <p className="text-gray-500 mt-2">Period: {formatDate(start)} — {formatDate(end)}</p>
              <p className="text-xs text-gray-400 mt-1">Generated: {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
            </div>

            {patData && (
              <div className="card p-5">
                <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wider pb-2 mb-4 border-b">1. Patient Statistics</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <StatCard label="Total Registered" value={formatNumber(patData.stats?.total_patients ?? 0)} />
                  <StatCard label="Male" value={formatNumber(patData.stats?.male_count ?? 0)} />
                  <StatCard label="Female" value={formatNumber(patData.stats?.female_count ?? 0)} />
                  <StatCard label="NHIS Registered" value={formatNumber(patData.stats?.nhis_count ?? 0)} color="text-green-600" />
                </div>
              </div>
            )}

            {clinicalData && (
              <div className="card p-5">
                <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wider pb-2 mb-4 border-b">2. Clinical Activity</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <StatCard label="Total Visits" value={formatNumber(clinicalData.summary?.total_visits ?? 0)} />
                  <StatCard label="Outpatient" value={formatNumber(clinicalData.summary?.outpatient_visits ?? 0)} color="text-blue-600" />
                  <StatCard label="Inpatient" value={formatNumber(clinicalData.summary?.inpatient_visits ?? 0)} color="text-indigo-600" />
                  <StatCard label="Emergency" value={formatNumber(clinicalData.summary?.emergency_visits ?? 0)} color="text-red-600" />
                  <StatCard label="Unique Patients Seen" value={formatNumber(clinicalData.summary?.unique_patients ?? 0)} />
                  <StatCard label="Avg Visit Duration" value={`${Math.round(clinicalData.summary?.avg_visit_duration ?? 0)} min`} />
                </div>
              </div>
            )}

            {revData && (
              <div className="card p-5">
                <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wider pb-2 mb-4 border-b">3. Financial Performance</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <StatCard label="Total Revenue" value={formatCurrency(revData.summary?.total_revenue ?? 0)} color="text-green-600" />
                  <StatCard label="Transactions" value={formatNumber(revData.summary?.transaction_count ?? 0)} />
                  <StatCard label="Paying Patients" value={formatNumber(revData.summary?.paying_patients ?? 0)} color="text-purple-600" />
                  <StatCard label="Avg Transaction" value={formatCurrency(revData.summary?.avg_transaction ?? 0)} />
                </div>
              </div>
            )}

            {branchData && (
              <div className="card p-5">
                <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wider pb-2 mb-4 border-b">4. Human Resources</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <StatCard label="Total Staff" value={formatNumber(branchData.summary?.total_active_staff ?? 0)} />
                  <StatCard label="Branches / Units" value={formatNumber(branchData.summary?.total_branches ?? 0)} />
                  <StatCard label="Bed Capacity" value={formatNumber(branchData.summary?.total_bed_capacity ?? 0)} />
                </div>
              </div>
            )}

            {labData && (
              <div className="card p-5">
                <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wider pb-2 mb-4 border-b">5. Laboratory Services</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <StatCard label="Total Lab Orders" value={formatNumber(labData.summary?.total_orders ?? 0)} />
                  <StatCard label="Completed" value={formatNumber(labData.summary?.completed ?? 0)} color="text-green-600" />
                  <StatCard label="Pending" value={formatNumber(labData.summary?.pending ?? 0)} color="text-yellow-600" />
                </div>
              </div>
            )}

            {insData && (
              <div className="card p-5">
                <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wider pb-2 mb-4 border-b">6. Insurance Claims (NHIA)</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <StatCard label="Total Claims" value={formatNumber(insData.summary?.total_claims ?? 0)} />
                  <StatCard label="Approved" value={formatNumber(insData.summary?.approved_count ?? 0)} color="text-green-600" />
                  <StatCard label="Paid" value={formatNumber(insData.summary?.paid_count ?? 0)} color="text-blue-600" />
                  <StatCard label="Total Claimed" value={formatCurrency(insData.summary?.total_claimed ?? 0)} color="text-purple-600" />
                </div>
              </div>
            )}
          </div>

          <div className="card p-5 border border-amber-200">
            <h3 className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Mail className="w-4 h-4 text-amber-600" />
              Submit to Regional Health Authorities
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField label="Sender Email">
                <Input type="email" placeholder="hospital@example.gh" value={senderEmail}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSenderEmail(e.target.value)} />
              </FormField>
              <FormField label="Recipient Emails (comma-separated)">
                <Input placeholder="rha@ghs.gov.gh, dhd@ghs.gov.gh" value={recipients}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRecipients(e.target.value)} />
              </FormField>
              <FormField label="Subject" className="sm:col-span-2">
                <Input value={subject} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSubject(e.target.value)} />
              </FormField>
              <FormField label="Additional Notes" className="sm:col-span-2">
                <Textarea rows={3} placeholder="Optional notes to accompany the report…" value={notes}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)} />
              </FormField>
            </div>
            <div className="flex gap-3 mt-4">
              <Button onClick={() => sendMutation.mutate()} isLoading={sendMutation.isPending}
                disabled={!recipients.trim()} leftIcon={<Mail className="w-4 h-4" />}>
                Send Report
              </Button>
              <Button variant="secondary" leftIcon={<Printer className="w-4 h-4" />} onClick={() => window.print()}>
                Print / Save as PDF
              </Button>
            </div>
          </div>
        </>
      )}

      {generated && !hasData && (
        <div className="card p-10 text-center text-gray-400">
          <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>Loading report data…</p>
        </div>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// CATEGORY CONFIG
// ────────────────────────────────────────────────────────────────────────────
type CatId = 'clinical' | 'surveillance' | 'admin' | 'financial' | 'pharmacy' | 'hr' | 'quality' | 'annual'

const CATEGORIES: { id: CatId; label: string; shortLabel: string; Icon: React.ElementType; active: string; inactive: string }[] = [
  { id: 'clinical',     label: 'Clinical / Medical',   shortLabel: 'Clinical',     Icon: Stethoscope,    active: 'bg-blue-600 text-white',   inactive: 'bg-white text-gray-600 border border-gray-200 hover:border-blue-300 hover:text-blue-700' },
  { id: 'surveillance', label: 'Disease Surveillance', shortLabel: 'Surveillance', Icon: Activity,       active: 'bg-orange-500 text-white', inactive: 'bg-white text-gray-600 border border-gray-200 hover:border-orange-300 hover:text-orange-700' },
  { id: 'admin',        label: 'Administrative',       shortLabel: 'Admin',        Icon: Building2,      active: 'bg-indigo-600 text-white', inactive: 'bg-white text-gray-600 border border-gray-200 hover:border-indigo-300 hover:text-indigo-700' },
  { id: 'financial',    label: 'Financial',            shortLabel: 'Financial',    Icon: DollarSign,     active: 'bg-green-600 text-white',  inactive: 'bg-white text-gray-600 border border-gray-200 hover:border-green-300 hover:text-green-700' },
  { id: 'pharmacy',     label: 'Pharmacy & Logistics', shortLabel: 'Pharmacy',     Icon: Pill,           active: 'bg-purple-600 text-white', inactive: 'bg-white text-gray-600 border border-gray-200 hover:border-purple-300 hover:text-purple-700' },
  { id: 'hr',           label: 'Human Resources',      shortLabel: 'HR',           Icon: UserCheck,      active: 'bg-pink-600 text-white',   inactive: 'bg-white text-gray-600 border border-gray-200 hover:border-pink-300 hover:text-pink-700' },
  { id: 'quality',      label: 'Quality Assurance',    shortLabel: 'Quality',      Icon: ClipboardCheck, active: 'bg-red-600 text-white',    inactive: 'bg-white text-gray-600 border border-gray-200 hover:border-red-300 hover:text-red-700' },
  { id: 'annual',       label: 'Annual Performance',   shortLabel: 'Annual',       Icon: Award,          active: 'bg-amber-500 text-white',  inactive: 'bg-white text-gray-600 border border-gray-200 hover:border-amber-300 hover:text-amber-700' },
]

// ────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ────────────────────────────────────────────────────────────────────────────
export default function ReportsPage() {
  const [category, setCategory] = useState<CatId>('clinical')
  const [startDate, setStartDate] = useState(() => {
    const d = new Date()
    d.setMonth(0); d.setDate(1)
    return d.toISOString().slice(0, 10)
  })
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10))

  const setPreset = (preset: 'week' | 'month' | 'quarter' | 'year') => {
    const now = new Date()
    const s = new Date()
    if (preset === 'week')    s.setDate(now.getDate() - now.getDay())
    if (preset === 'month')   s.setDate(1)
    if (preset === 'quarter') s.setMonth(Math.floor(now.getMonth() / 3) * 3, 1)
    if (preset === 'year')    { s.setMonth(0); s.setDate(1) }
    setStartDate(s.toISOString().slice(0, 10))
    setEndDate(now.toISOString().slice(0, 10))
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reports & Analytics"
        subtitle="Clinical, financial, administrative and regulatory reports for GHS/DHIMS2 compliance"
      />

      {/* Category navigation */}
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setCategory(cat.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all shadow-sm ${
              category === cat.id ? cat.active : cat.inactive
            }`}
          >
            <cat.Icon className="w-4 h-4" />
            <span className="hidden sm:inline">{cat.label}</span>
            <span className="sm:hidden">{cat.shortLabel}</span>
          </button>
        ))}
      </div>

      {/* Date range + presets */}
      <div className="card p-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-gray-400" />
          <span className="text-sm text-gray-500 font-medium">Reporting Period:</span>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-400"
          />
          <span className="text-gray-400 text-sm">to</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
        <div className="flex gap-1.5 ml-auto flex-wrap">
          {(['week', 'month', 'quarter', 'year'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPreset(p)}
              className="px-3 py-1 text-xs rounded-lg border border-gray-200 text-gray-500 hover:border-blue-300 hover:text-blue-600 transition-all"
            >
              {{ week: 'This Week', month: 'This Month', quarter: 'This Quarter', year: 'This Year' }[p]}
            </button>
          ))}
        </div>
      </div>

      {/* Active section */}
      <div>
        {category === 'clinical'     && <ClinicalSection     start={startDate} end={endDate} />}
        {category === 'surveillance' && <SurveillanceSection start={startDate} end={endDate} />}
        {category === 'admin'        && <AdminSection        start={startDate} end={endDate} />}
        {category === 'financial'    && <FinancialSection    start={startDate} end={endDate} />}
        {category === 'pharmacy'     && <PharmacySection     start={startDate} end={endDate} />}
        {category === 'hr'           && <HRSection           start={startDate} end={endDate} />}
        {category === 'quality'      && <QualitySection      start={startDate} end={endDate} />}
        {category === 'annual'       && <AnnualSection       start={startDate} end={endDate} />}
      </div>
    </div>
  )
}
