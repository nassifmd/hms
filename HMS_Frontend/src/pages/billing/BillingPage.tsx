import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Search, AlertCircle, CheckCircle, Eye, Printer, Plus, Trash2,
  DollarSign, Tag, List, Settings, Edit2, X, ChevronDown,
} from 'lucide-react'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import type { Invoice, InvoiceItem, ServicePrice, PriceList } from '@/types'
import PageHeader from '@/components/ui/PageHeader'
import DataTable from '@/components/ui/DataTable'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { FormField, Input, Select } from '@/components/ui/Form'
import { formatDate, formatCurrency, statusColor } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'

// ─── Constants ────────────────────────────────────────────────────────────────

const PAYMENT_METHODS = [
  { value: 'Cash', label: 'Cash' },
  { value: 'Mobile Money', label: 'Mobile Money' },
  { value: 'Card', label: 'Card' },
  { value: 'Bank Transfer', label: 'Bank Transfer' },
  { value: 'Cheque', label: 'Cheque' },
]

const SERVICE_TYPES = [
  { value: 'Consultation', label: 'Consultation' },
  { value: 'Procedure', label: 'Procedure / Dental' },
  { value: 'Lab', label: 'Laboratory' },
  { value: 'Drug', label: 'Drug / Pharmacy' },
  { value: 'Radiology', label: 'Radiology / Imaging' },
  { value: 'Ward', label: 'Ward / Admission' },
  { value: 'Other', label: 'Other' },
]

// Badge colour map for service types displayed in the visit-services list
const SVC_TYPE_BADGE: Record<string, string> = {
  Consultation: 'bg-blue-100 text-blue-700',
  Lab: 'bg-purple-100 text-purple-700',
  Procedure: 'bg-orange-100 text-orange-700',
  Drug: 'bg-green-100 text-green-700',
}

// Service types that have a DB catalog to search against
const CATALOG_TYPES = new Set(['Procedure', 'Lab', 'Drug', 'Radiology'])

interface BillingDashboard {
  revenue_today?: number
  revenue_month?: number
  outstanding_total?: number
  invoice_stats?: { total: number; paid: number; pending: number; overdue: number }
}

type Tab = 'Pending' | 'Partially Paid' | 'Paid' | '' | 'prices'

interface NewItemRow {
  item_type: string
  item_id?: string
  item_name: string
  item_code: string
  description: string
  quantity: number
  unit_price: number
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const qc = useQueryClient()
  const { user } = useAuth()
  const isAdmin = user?.role === 'SYS_ADMIN' || user?.role === 'SUPER_ADMIN' ||
    user?.roles?.some((r) => r.code === 'SYS_ADMIN' || r.code === 'SUPER_ADMIN')
  const isAccounts = isAdmin || user?.role === 'ACCOUNTS' ||
    user?.roles?.some((r) => r.code === 'ACCOUNTS')
  const canManagePrices = isAccounts || isAdmin

  const [tab, setTab] = useState<Tab>('Pending')
  const [search, setSearch] = useState('')
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const [payModal, setPayModal] = useState<Invoice | null>(null)
  const [voidModal, setVoidModal] = useState<Invoice | null>(null)
  const [voidReason, setVoidReason] = useState('')
  const [addOpen, setAddOpen] = useState(false)

  // Service price state
  const [priceSearch, setPriceSearch] = useState('')
  const [priceTypeFilter, setPriceTypeFilter] = useState('')
  const [priceModal, setPriceModal] = useState<'add' | 'edit' | null>(null)
  const [editingPrice, setEditingPrice] = useState<ServicePrice | null>(null)

  // Service-name combobox state (for the Add/Edit price modal)
  const [svcQuery, setSvcQuery] = useState('')
  const [debouncedSvcQuery, setDebouncedSvcQuery] = useState('')
  const [svcDropOpen, setSvcDropOpen] = useState(false)
  const [selectedSvcId, setSelectedSvcId] = useState<string | null>(null)
  const svcDropRef = useRef<HTMLDivElement>(null)

  const payForm = useForm<{ amount: string; payment_method: string }>()
  const priceForm = useForm<{
    service_type: string; service_name: string; service_code: string
    price: string; nhis_tariff: string; discount_allowed: boolean
    price_list_id?: string
  }>()

  // New invoice line items
  const [newItems, setNewItems] = useState<NewItemRow[]>([])
  const [patientSearch, setPatientSearch] = useState('')
  const [debouncedPatientSearch, setDebouncedPatientSearch] = useState('')
  const [selectedPatientId, setSelectedPatientId] = useState('')
  const patientPickDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [visitDate, setVisitDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [invoiceNotes, setInvoiceNotes] = useState('')
  const [checkedServices, setCheckedServices] = useState<Set<string>>(new Set())
  const [importedServiceIds, setImportedServiceIds] = useState<Set<string>>(new Set())

  // ─── Queries ──────────────────────────────────────────────────

  const { data: invoiceData, isLoading } = useQuery({
    queryKey: ['billing', 'invoices', tab, search],
    queryFn: () =>
      api.get('/billing/invoices', {
        params: { status: tab || undefined, search: search || undefined, limit: 50 },
      }).then((r) => r.data),
    enabled: tab !== 'prices',
  })

  const { data: dashboardData } = useQuery<BillingDashboard>({
    queryKey: ['billing', 'dashboard'],
    queryFn: () => api.get('/billing/dashboard').then((r) => r.data.data as BillingDashboard),
  })

  const { data: priceListData } = useQuery({
    queryKey: ['billing', 'price-lists'],
    queryFn: () => api.get('/billing/price-lists').then((r) => r.data.data as PriceList[]),
    enabled: canManagePrices,
  })

  const { data: servicePriceData, isLoading: pricesLoading } = useQuery({
    queryKey: ['billing', 'service-prices', priceSearch, priceTypeFilter],
    queryFn: () =>
      api.get('/billing/service-prices', {
        params: {
          service_type: priceTypeFilter || undefined,
          search: priceSearch || undefined,
        },
      }).then((r) => r.data.data as ServicePrice[]),
    enabled: tab === 'prices' && canManagePrices,
  })

  useEffect(() => {
    if (patientPickDebounce.current) clearTimeout(patientPickDebounce.current)
    patientPickDebounce.current = setTimeout(() => setDebouncedPatientSearch(patientSearch), 300)
    return () => { if (patientPickDebounce.current) clearTimeout(patientPickDebounce.current) }
  }, [patientSearch])

  const { data: patientResults, isFetching: patientFetching } = useQuery({
    queryKey: ['patients', 'search', debouncedPatientSearch],
    queryFn: () =>
      api.get('/patients/search', { params: { q: debouncedPatientSearch } })
        .then((r) => r.data.data ?? r.data),
    enabled: debouncedPatientSearch.length >= 3,
  })

  interface VisitService {
    service_type: string
    reference_id: string
    reference_number: string | null
    item_code: string
    item_name: string
    category: string | null
    quantity: number
    unit_price: number
    service_date: string
  }

  const { data: visitServices = [], isFetching: visitServicesFetching } = useQuery<VisitService[]>({
    queryKey: ['billing', 'visit-services', selectedPatientId],
    queryFn: () =>
      api.get(`/billing/patients/${selectedPatientId}/visit-services`)
        .then((r) => r.data.data as VisitService[]),
    enabled: !!selectedPatientId && addOpen,
    staleTime: 0,
  })

  // Auto-select all visit services when they load; reset imported tracking on date/patient change
  useEffect(() => {
    setImportedServiceIds(new Set())
    if (visitServices.length > 0) {
      setCheckedServices(new Set(visitServices.map((s) => s.reference_id)))
    } else {
      setCheckedServices(new Set())
    }
  }, [visitServices])

  // Invoice detail with items
  const { data: invoiceDetail } = useQuery({
    queryKey: ['billing', 'invoice', selectedInvoice?.id],
    queryFn: () =>
      api.get(`/billing/invoices/${selectedInvoice!.id}`).then((r) => r.data.data as Invoice),
    enabled: !!selectedInvoice?.id,
  })

  // ─── Service-name combobox hooks ─────────────────────────────

  const watchedSvcType = priceForm.watch('service_type')

  // Debounce the search query (300 ms)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSvcQuery(svcQuery), 300)
    return () => clearTimeout(t)
  }, [svcQuery])

  // Close the dropdown when clicking outside
  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (svcDropRef.current && !svcDropRef.current.contains(e.target as Node)) {
        setSvcDropOpen(false)
      }
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [])

  const { data: svcCatalog = [] } = useQuery<{ id: string; code: string; name: string; category?: string; source?: string }[]>({
    queryKey: ['billing', 'services', watchedSvcType, debouncedSvcQuery],
    queryFn: () =>
      api.get('/billing/services', {
        params: { service_type: watchedSvcType, search: debouncedSvcQuery || undefined },
      }).then((r) => r.data.data),
    enabled: !!watchedSvcType && CATALOG_TYPES.has(watchedSvcType) && !!priceModal,
    staleTime: 30_000,
  })

  // ─── Mutations ────────────────────────────────────────────────

  const payMutation = useMutation({
    mutationFn: ({ invoice, amount, payment_method }: { invoice: Invoice; amount: number; payment_method: string }) =>
      api.post('/billing/payments', {
        invoice_id: invoice.id,
        patient_id: invoice.patient_id ?? invoice.patientId,
        amount,
        payment_method,
      }),
    onSuccess: () => {
      toast.success('Payment recorded')
      qc.invalidateQueries({ queryKey: ['billing'] })
      setPayModal(null)
      setSelectedInvoice(null)
      payForm.reset()
    },
    onError: () => toast.error('Failed to record payment'),
  })

  const createInvoiceMutation = useMutation({
    mutationFn: () =>
      api.post('/billing/invoices', {
        patient_id: selectedPatientId,
        notes: invoiceNotes || undefined,
        facility_id: user?.facilityId,
        items: newItems.filter((i) => i.item_name && i.unit_price > 0).map((i) => ({
          item_type: i.item_type,
          item_id: i.item_id || undefined,
          item_name: i.item_name,
          item_code: i.item_code || undefined,
          description: i.description || undefined,
          quantity: i.quantity,
          unit_price: i.unit_price,
        })),
      }),
    onSuccess: () => {
      toast.success('Invoice created')
      qc.invalidateQueries({ queryKey: ['billing'] })
      qc.invalidateQueries({ queryKey: ['billing', 'visit-services'] })
      setAddOpen(false)
      setNewItems([])
      setSelectedPatientId('')
      setPatientSearch('')
      setCheckedServices(new Set())
      setImportedServiceIds(new Set())
      setVisitDate(new Date().toISOString().slice(0, 10))
      setInvoiceNotes('')
    },
    onError: () => toast.error('Failed to create invoice'),
  })

  const savePriceMutation = useMutation({
    mutationFn: (d: Parameters<typeof priceForm.handleSubmit>[0] extends (d: infer D) => unknown ? D : never) => {
      const payload = {
        service_type: d.service_type,
        service_name: d.service_name,
        service_code: d.service_code,
        service_id: selectedSvcId || undefined,
        price: parseFloat(d.price as unknown as string),
        nhis_tariff: parseFloat((d.nhis_tariff as unknown as string) || '0'),
        discount_allowed: d.discount_allowed ?? true,
        price_list_id: d.price_list_id || undefined,
      }
      if (editingPrice?.id) {
        return api.put(`/billing/service-prices/${editingPrice.id}`, payload)
      }
      return api.post('/billing/service-prices', payload)
    },
    onSuccess: () => {
      toast.success(editingPrice ? 'Price updated' : 'Price added')
      qc.invalidateQueries({ queryKey: ['billing', 'service-prices'] })
      setPriceModal(null)
      setEditingPrice(null)
      priceForm.reset()
    },
    onError: () => toast.error('Failed to save price'),
  })

  const deletePriceMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/billing/service-prices/${id}`),
    onSuccess: () => {
      toast.success('Price deleted')
      qc.invalidateQueries({ queryKey: ['billing', 'service-prices'] })
    },
    onError: () => toast.error('Failed to delete price'),
  })

  const voidInvoiceMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.delete(`/billing/invoices/${id}`, { data: { reason } }),
    onSuccess: () => {
      toast.success('Invoice voided')
      qc.invalidateQueries({ queryKey: ['billing'] })
      setVoidModal(null)
      setVoidReason('')
      setSelectedInvoice(null)
    },
    onError: () => toast.error('Failed to void invoice'),
  })

  // ─── Helpers ──────────────────────────────────────────────────

  const invoices: Invoice[] = invoiceData?.data ?? []

  const tabs: { label: string; value: Tab; icon?: React.ReactNode }[] = [
    { label: 'Outstanding', value: 'Pending' },
    { label: 'Partial', value: 'Partially Paid' },
    { label: 'Paid', value: 'Paid' },
    { label: 'All', value: '' },
    ...(canManagePrices ? [{ label: 'Service Prices', value: 'prices' as Tab, icon: <Tag className="w-3.5 h-3.5" /> }] : []),
  ]

  function openEditPrice(p: ServicePrice) {
    setEditingPrice(p)
    const svcType = p.service_type ?? p.serviceType ?? ''
    const svcName = p.service_name ?? p.serviceName ?? ''
    const svcCode = p.service_code ?? p.serviceCode ?? ''
    setSvcQuery(svcName)
    setDebouncedSvcQuery(svcName)
    setSelectedSvcId((p as unknown as Record<string, string>).service_id ?? (p as unknown as Record<string, string>).serviceId ?? null)
    setSvcDropOpen(false)
    priceForm.reset({
      service_type: svcType,
      service_name: svcName,
      service_code: svcCode,
      price: String(p.price),
      nhis_tariff: String(p.nhis_tariff ?? p.nhisTariff ?? 0),
      discount_allowed: p.discount_allowed ?? p.discountAllowed ?? true,
      price_list_id: p.price_list_id ?? p.priceListId,
    })
    setPriceModal('edit')
  }

  function openAddPrice() {
    setEditingPrice(null)
    setSvcQuery('')
    setDebouncedSvcQuery('')
    setSelectedSvcId(null)
    setSvcDropOpen(false)
    priceForm.reset({ discount_allowed: true, nhis_tariff: '0' })
    setPriceModal('add')
  }

  const addItem = () =>
    setNewItems((prev) => [
      ...prev,
      { item_type: 'Consultation', item_name: '', item_code: '', description: '', quantity: 1, unit_price: 0 },
    ])

  const removeItem = (idx: number) =>
    setNewItems((prev) => prev.filter((_, i) => i !== idx))

  const updateItem = (idx: number, field: keyof NewItemRow, value: string | number) =>
    setNewItems((prev) => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it))

  function toggleService(id: string) {
    setCheckedServices((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function importCheckedServices() {
    const toAdd = (visitServices as { service_type: string; reference_id: string; item_code: string; item_name: string; quantity: number; unit_price: number }[])
      .filter((s) => checkedServices.has(s.reference_id) && !importedServiceIds.has(s.reference_id))
      .map((s) => ({
        item_type: s.service_type,
        item_id: s.reference_id,
        item_name: s.item_name,
        item_code: s.item_code ?? '',
        description: '',
        quantity: Number(s.quantity) || 1,
        unit_price: Number(s.unit_price) || 0,
      }))
    setImportedServiceIds((prev) => new Set([...prev, ...checkedServices]))
    setNewItems((prev) => [...prev, ...toAdd])
    setCheckedServices(new Set())
  }

  const newInvoiceTotal = newItems.reduce((s, it) => s + it.quantity * it.unit_price, 0)

  function printInvoiceReceipt(inv: Invoice) {
    const items: InvoiceItem[] = inv.items ?? []
    const facilityName = (inv as any).facility?.name ?? 'HMS Facility'
    const rows = items.map((it) => `
      <tr>
        <td style="padding:6px 8px;border-bottom:1px solid #eee">${it.item_name ?? ''}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center">${it.quantity ?? 1}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">GH&#8373;${Number(it.unit_price ?? 0).toFixed(2)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">GH&#8373;${Number(it.total_price ?? (Number(it.unit_price ?? 0) * Number(it.quantity ?? 1))).toFixed(2)}</td>
      </tr>`).join('')
    const total = Number(inv.total_amount ?? inv.totalAmount ?? 0).toFixed(2)
    const paid  = Number(inv.amount_paid ?? inv.paidAmount ?? 0).toFixed(2)
    const bal   = Number(inv.balance_due ?? inv.balanceDue ?? 0).toFixed(2)
    const isPaid = (inv.payment_status ?? inv.status) === 'Paid'
    const docLabel = isPaid ? 'RECEIPT' : 'INVOICE'
    const html = `<!DOCTYPE html><html><head><title>${docLabel} ${inv.invoice_number ?? inv.invoiceNumber ?? ''}</title>
    <style>body{font-family:Arial,sans-serif;font-size:13px;color:#333;margin:20px}
    h2{margin:0 0 4px}p{margin:2px 0}table{width:100%;border-collapse:collapse;margin-top:12px}
    th{background:#f5f5f5;padding:6px 8px;text-align:left;font-size:12px}
    .right{text-align:right}.totals td{padding:4px 8px;font-size:13px}
    @media print{button{display:none}}</style></head>
    <body>
    <div style="display:flex;justify-content:space-between;align-items:flex-start">
      <div><h2>${facilityName}</h2></div>
      <div style="text-align:right">
        <strong>${docLabel}</strong><br/>
        <span style="font-size:12px;color:#666">${inv.invoice_number ?? inv.invoiceNumber ?? ''}</span><br/>
        <span style="font-size:12px;color:#666">${new Date(inv.invoice_date ?? inv.invoiceDate ?? inv.createdAt ?? '').toLocaleDateString()}</span>
      </div>
    </div>
    <hr/>
    <p><strong>Patient:</strong> ${inv.patient?.name ?? inv.patient_name ?? inv.patientName ?? ''}</p>
    <p><strong>Status:</strong> ${inv.payment_status ?? inv.status ?? ''}</p>
    <table><thead><tr>
      <th>Item</th><th style="text-align:center">Qty</th><th class="right" style="text-align:right">Unit</th><th class="right" style="text-align:right">Total</th>
    </tr></thead><tbody>${rows}</tbody></table>
    <table class="totals" style="margin-top:8px;width:50%;margin-left:auto">
      <tr><td>Subtotal</td><td class="right" style="text-align:right">GH&#8373;${total}</td></tr>
      <tr><td>Paid</td><td class="right" style="text-align:right;color:green">GH&#8373;${paid}</td></tr>
      <tr style="font-weight:bold"><td>Balance Due</td><td class="right" style="text-align:right;color:${Number(bal)>0?'red':'green'}">GH&#8373;${bal}</td></tr>
    </table>
    <p style="margin-top:16px;font-size:11px;color:#999;text-align:center">Thank you for your patronage</p>
    <script>window.onload=function(){window.print();window.onafterprint=function(){window.close()}}</script>
    </body></html>`
    const w = window.open('', '_blank', 'width=700,height=900')
    if (w) { w.document.write(html); w.document.close() }
  }

  // ─── Render ───────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      <PageHeader
        title="Billing"
        subtitle="Invoices and payment management"
        actions={
          tab !== 'prices' ? (
            <Button leftIcon={<Plus className="w-4 h-4" />} onClick={() => setAddOpen(true)} size="sm">
              New Invoice
            </Button>
          ) : (
            <Button leftIcon={<Plus className="w-4 h-4" />} onClick={openAddPrice} size="sm">
              Add Price
            </Button>
          )
        }
      />

      {/* Dashboard stats */}
      {dashboardData && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Today's Revenue", value: formatCurrency(dashboardData.revenue_today ?? 0), color: 'text-green-600', bg: 'bg-green-50' },
            { label: 'This Month', value: formatCurrency(dashboardData.revenue_month ?? 0), color: 'text-blue-600', bg: 'bg-blue-50' },
            { label: 'Outstanding', value: formatCurrency(dashboardData.outstanding_total ?? 0), color: 'text-red-600', bg: 'bg-red-50' },
            { label: 'Total Invoices', value: String(dashboardData.invoice_stats?.total ?? 0), color: 'text-purple-600', bg: 'bg-purple-50' },
          ].map((s) => (
            <div key={s.label} className={`card p-4 ${s.bg}`}>
              <p className="text-xs text-gray-500 mb-1">{s.label}</p>
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit flex-wrap">
        {tabs.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${
              tab === t.value ? 'bg-white shadow-sm text-primary-700' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* ── Service Prices Tab ── */}
      {tab === 'prices' && canManagePrices && (
        <ServicePricesPanel
          prices={servicePriceData ?? []}
          priceLists={priceListData ?? []}
          isLoading={pricesLoading}
          search={priceSearch}
          onSearch={setPriceSearch}
          typeFilter={priceTypeFilter}
          onTypeFilter={setPriceTypeFilter}
          onEdit={openEditPrice}
          onDelete={(id) => {
            if (confirm('Delete this price entry?')) deletePriceMutation.mutate(id)
          }}
        />
      )}

      {/* ── Invoices Tab ── */}
      {tab !== 'prices' && (
        <>
          <div className="card p-3 flex items-center gap-3">
            <Search className="w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by invoice #, patient name or patient #…"
              className="flex-1 text-sm outline-none bg-transparent"
            />
          </div>

          <DataTable
            columns={[
              { key: 'invoiceNumber', header: 'Invoice #', render: (r: Invoice) => <span className="font-mono text-xs font-semibold">{r.invoice_number ?? r.invoiceNumber}</span> },
              { key: 'patientName', header: 'Patient', render: (r: Invoice) => (
                <div>
                  <p className="font-medium text-sm">{r.patient_name ?? r.patientName ?? r.patientId}</p>
                  {(r.patient_number ?? r.patientNumber) && (
                    <p className="text-xs text-gray-400">{r.patient_number ?? r.patientNumber}</p>
                  )}
                </div>
              )},
              { key: 'totalAmount', header: 'Total', render: (r: Invoice) => <span className="font-semibold">{formatCurrency(r.total_amount ?? r.totalAmount ?? 0)}</span> },
              { key: 'paidAmount', header: 'Paid', render: (r: Invoice) => formatCurrency(r.amount_paid ?? r.paidAmount ?? 0) },
              { key: 'balanceDue', header: 'Balance', render: (r: Invoice) => {
                const bal = r.balance_due ?? r.balanceDue ?? 0
                return <span className={bal > 0 ? 'text-red-600 font-semibold' : 'text-green-600'}>{formatCurrency(bal)}</span>
              }},
              { key: 'status', header: 'Status', render: (r: Invoice) => {
                const s = r.payment_status ?? r.status ?? ''
                return <span className={statusColor(s)}>{s}</span>
              }},
              { key: 'createdAt', header: 'Date', render: (r: Invoice) => formatDate(r.invoice_date ?? r.createdAt ?? '') },

              { key: 'actions', header: '', render: (r: Invoice) => (
                <div className="flex items-center gap-1">
                  <button onClick={() => setSelectedInvoice(r)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500" title="View">
                    <Eye className="w-4 h-4" />
                  </button>
                  <button className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500" title="Print" onClick={() => {
                    api.get(`/billing/invoices/${r.id}`).then((res) => printInvoiceReceipt(res.data.data ?? r)).catch(() => printInvoiceReceipt(r))
                  }}>
                    <Printer className="w-4 h-4" />
                  </button>
                  {(r.balance_due ?? r.balanceDue ?? 0) > 0 && (
                    <button
                      onClick={() => { setPayModal(r); payForm.setValue('amount', String(r.balance_due ?? r.balanceDue ?? 0)) }}
                      className="p-1.5 rounded-lg hover:bg-green-100 text-green-600 text-xs font-medium"
                      title="Pay"
                    >
                      <DollarSign className="w-4 h-4" />
                    </button>
                  )}
                  {(isAdmin || isAccounts) && !(r.voided) && (r.payment_status ?? r.status) !== 'Paid' && (
                    <button
                      onClick={() => { setVoidModal(r); setVoidReason('') }}
                      className="p-1.5 rounded-lg hover:bg-red-100 text-red-500"
                      title="Void invoice"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )},
            ]}
            data={invoices}
            keyField="id"
            isLoading={isLoading}
            emptyMessage="No invoices found"
          />
        </>
      )}

      {/* ── New Invoice Modal ── */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="New Invoice"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!selectedPatientId) { toast.error('Please select a patient'); return }
                if (!newItems.some((i) => i.item_name && i.unit_price > 0)) { toast.error('Add at least one billable item'); return }
                createInvoiceMutation.mutate()
              }}
              isLoading={createInvoiceMutation.isPending}
            >
              Create Invoice
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          {/* Patient search */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Patient <span className="text-red-500">*</span></label>
            <div className="relative">
              <input
                value={patientSearch}
                onChange={(e) => {
                  setPatientSearch(e.target.value)
                  setSelectedPatientId('')
                }}
                placeholder="Search by name or patient number…"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-primary-500"
              />
              {selectedPatientId && (
                <span className="absolute right-3 top-2 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                  Selected
                </span>
              )}
            </div>
            {patientSearch.length >= 3 && !selectedPatientId && (
              <div className="border border-gray-200 rounded-lg divide-y bg-white shadow-sm max-h-48 overflow-y-auto">
                {patientFetching ? (
                  <div className="px-3 py-2 text-sm text-gray-400">Searching…</div>
                ) : (Array.isArray(patientResults) ? patientResults : []).length === 0 ? (
                  <div className="px-3 py-2 text-sm text-gray-400">No patients found</div>
                ) : (
                  (Array.isArray(patientResults) ? patientResults : []).slice(0, 8).map((p: { id: string; first_name?: string; last_name?: string; firstName?: string; lastName?: string; patient_number?: string; patientNumber?: string }) => (
                    <button
                      key={p.id}
                      onClick={() => { setSelectedPatientId(p.id); setPatientSearch(`${p.first_name ?? p.firstName ?? ''} ${p.last_name ?? p.lastName ?? ''}`.trim()) }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center justify-between gap-3"
                    >
                      <span className="font-medium">{`${p.first_name ?? p.firstName ?? ''} ${p.last_name ?? p.lastName ?? ''}`.trim()}</span>
                      <span className="shrink-0 text-xs font-mono bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{p.patient_number ?? p.patientNumber}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="space-y-1">
            <label htmlFor="invoice-notes" className="text-sm font-medium text-gray-700">Notes</label>
            <input id="invoice-notes" value={invoiceNotes} onChange={(e) => setInvoiceNotes(e.target.value)} placeholder="Optional" className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none" />
          </div>

          {/* Visit services checklist */}
          {selectedPatientId && (() => {
            type VS = { service_type: string; reference_id: string; reference_number: string | null; item_code: string; item_name: string; category: string | null; quantity: number; unit_price: number }
            const svcs = (visitServices as VS[]).filter((s) => !importedServiceIds.has(s.reference_id))
            return (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">Patient Services</span>
                  <div className="flex items-center gap-2">
                    {svcs.length > 0 && (
                      <button
                        onClick={() => {
                          if (checkedServices.size === svcs.length) setCheckedServices(new Set())
                          else setCheckedServices(new Set(svcs.map((s) => s.reference_id)))
                        }}
                        className="text-xs text-gray-500 hover:text-gray-700 underline"
                      >
                        {checkedServices.size === svcs.length ? 'Deselect all' : 'Select all'}
                      </button>
                    )}
                    {checkedServices.size > 0 && (
                      <button
                        onClick={importCheckedServices}
                        className="text-xs bg-primary-600 text-white px-3 py-1 rounded-lg hover:bg-primary-700 flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" /> Add {checkedServices.size} to invoice
                      </button>
                    )}
                  </div>
                </div>
                {visitServicesFetching && (
                  <div className="text-xs text-gray-400 py-3 text-center">Loading services…</div>
                )}
                {!visitServicesFetching && svcs.length === 0 && (
                  <div className="text-xs text-gray-400 py-3 text-center border border-dashed border-gray-200 rounded-lg">
                    No services recorded for this patient
                  </div>
                )}
                {!visitServicesFetching && svcs.length > 0 && (
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="w-8 px-2 py-2"></th>
                          <th className="px-2 py-2 text-left font-medium text-gray-500">Type</th>
                          <th className="px-2 py-2 text-left font-medium text-gray-500">Service / Item</th>
                          <th className="px-2 py-2 text-left font-medium text-gray-500">Code</th>
                          <th className="px-2 py-2 text-right font-medium text-gray-500">Qty</th>
                          <th className="px-2 py-2 text-right font-medium text-gray-500">Price (GH₵)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {svcs.map((svc) => {
                          const checked = checkedServices.has(svc.reference_id)
                          return (
                            <tr
                              key={svc.reference_id}
                              onClick={() => toggleService(svc.reference_id)}
                              className={`cursor-pointer transition-colors ${checked ? 'bg-primary-50' : 'hover:bg-gray-50'}`}
                            >
                              <td className="px-2 py-1.5 text-center">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleService(svc.reference_id)}
                                  className="rounded accent-primary-600 cursor-pointer"
                                />
                              </td>
                              <td className="px-2 py-1.5">
                                <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${SVC_TYPE_BADGE[svc.service_type] ?? 'bg-gray-100 text-gray-600'}`}>
                                  {svc.service_type}
                                </span>
                              </td>
                              <td className="px-2 py-1.5 font-medium text-gray-800">{svc.item_name}</td>
                              <td className="px-2 py-1.5 text-gray-400">{svc.item_code}</td>
                              <td className="px-2 py-1.5 text-right">{svc.quantity}</td>
                              <td className="px-2 py-1.5 text-right font-medium">{formatCurrency(Number(svc.unit_price) * Number(svc.quantity))}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })()}

          {/* Manual invoice line items */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">Invoice Items</span>
              <button onClick={addItem} className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" /> Add row
              </button>
            </div>
            {newItems.length === 0 ? (
              <div className="text-xs text-gray-400 py-2 text-center border border-dashed border-gray-200 rounded-lg">
                Select services above or click "Add row" to add items manually
              </div>
            ) : (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-2 py-2 text-left font-medium text-gray-500">Type</th>
                      <th className="px-2 py-2 text-left font-medium text-gray-500">Name</th>
                      <th className="px-2 py-2 text-left font-medium text-gray-500">Code</th>
                      <th className="px-2 py-2 text-right font-medium text-gray-500">Qty</th>
                      <th className="px-2 py-2 text-right font-medium text-gray-500">Unit (GH₵)</th>
                      <th className="px-2 py-2 text-right font-medium text-gray-500">Total</th>
                      <th className="w-6"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {newItems.map((it, idx) => (
                      <tr key={`item-${idx}`}>
                        <td className="px-1 py-1">
                          <select
                            value={it.item_type}
                            onChange={(e) => updateItem(idx, 'item_type', e.target.value)}
                            className="text-xs border-0 outline-none bg-transparent w-28"
                          >
                            {SERVICE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                          </select>
                        </td>
                        <td className="px-1 py-1">
                          <input value={it.item_name} onChange={(e) => updateItem(idx, 'item_name', e.target.value)} placeholder="Service name" className="text-xs outline-none w-full border-0 bg-transparent" />
                        </td>
                        <td className="px-1 py-1">
                          <input value={it.item_code} onChange={(e) => updateItem(idx, 'item_code', e.target.value)} placeholder="Code" className="text-xs outline-none w-16 border-0 bg-transparent" />
                        </td>
                        <td className="px-1 py-1">
                          <input type="number" min={1} value={it.quantity} onChange={(e) => updateItem(idx, 'quantity', Number.parseInt(e.target.value) || 1)} className="text-xs outline-none w-10 text-right border-0 bg-transparent" />
                        </td>
                        <td className="px-1 py-1">
                          <input type="number" min={0} step="0.01" value={it.unit_price} onChange={(e) => updateItem(idx, 'unit_price', Number.parseFloat(e.target.value) || 0)} className="text-xs outline-none w-20 text-right border-0 bg-transparent" />
                        </td>
                        <td className="px-2 py-1 text-right font-medium">{formatCurrency(it.quantity * it.unit_price)}</td>
                        <td className="px-1 py-1">
                          <button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50">
                    <tr>
                      <td colSpan={5} className="px-2 py-2 text-right text-xs font-semibold text-gray-600">Total</td>
                      <td className="px-2 py-2 text-right text-sm font-bold text-gray-800">{formatCurrency(newInvoiceTotal)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* ── Invoice Detail Modal ── */}
      {selectedInvoice && (
        <Modal
          open={!!selectedInvoice}
          onClose={() => setSelectedInvoice(null)}
          title={`Invoice ${selectedInvoice.invoice_number ?? selectedInvoice.invoiceNumber}`}
          size="lg"
          footer={
            (invoiceDetail?.balance_due ?? invoiceDetail?.balanceDue ?? selectedInvoice.balance_due ?? selectedInvoice.balanceDue ?? 0) > 0 ? (
              <>
                <Button variant="secondary" onClick={() => setSelectedInvoice(null)}>Close</Button>
                <Button variant="secondary" leftIcon={<Printer className="w-4 h-4" />} onClick={() => printInvoiceReceipt(invoiceDetail ?? selectedInvoice)}>
                  Print
                </Button>
                <Button
                  leftIcon={<CheckCircle className="w-4 h-4" />}
                  onClick={() => {
                    setPayModal(selectedInvoice)
                    setSelectedInvoice(null)
                    payForm.setValue('amount', String(invoiceDetail?.balance_due ?? invoiceDetail?.balanceDue ?? selectedInvoice.balance_due ?? selectedInvoice.balanceDue ?? 0))
                  }}
                >
                  Record Payment
                </Button>
              </>
            ) : (
              <>
                <Button variant="secondary" onClick={() => setSelectedInvoice(null)}>Close</Button>
                <Button variant="secondary" leftIcon={<Printer className="w-4 h-4" />} onClick={() => printInvoiceReceipt(invoiceDetail ?? selectedInvoice)}>
                  Print
                </Button>
              </>
            )
          }
        >
          <InvoiceDetailView invoice={invoiceDetail ?? selectedInvoice} />
        </Modal>
      )}

      {/* ── Payment Modal ── */}
      {payModal && (
        <Modal
          open={!!payModal}
          onClose={() => setPayModal(null)}
          title="Record Payment"
          size="sm"
          footer={
            <>
              <Button variant="secondary" onClick={() => setPayModal(null)}>Cancel</Button>
              <Button
                leftIcon={<CheckCircle className="w-4 h-4" />}
                onClick={payForm.handleSubmit((d) =>
                  payMutation.mutate({ invoice: payModal, amount: parseFloat(d.amount), payment_method: d.payment_method })
                )}
                isLoading={payMutation.isPending}
              >
                Confirm Payment
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <div className="p-3 bg-gray-50 rounded-lg text-sm">
              <p><span className="text-gray-500">Invoice:</span> <strong>{payModal.invoice_number ?? payModal.invoiceNumber}</strong></p>
              <p><span className="text-gray-500">Patient:</span> <strong>{payModal.patient_name ?? payModal.patientName}</strong></p>
              <p><span className="text-gray-500">Balance Due:</span> <strong className="text-red-600">{formatCurrency(payModal.balance_due ?? payModal.balanceDue ?? 0)}</strong></p>
            </div>
            <FormField label="Amount" required>
              <Input
                type="number" step="0.01"
                {...payForm.register('amount', { required: 'Required', min: { value: 0.01, message: 'Must be positive' } })}
                placeholder="Amount"
              />
            </FormField>
            <FormField label="Payment Method" required>
              <Select
                options={PAYMENT_METHODS}
                placeholder="Select payment method"
                {...payForm.register('payment_method', { required: 'Required' })}
              />
            </FormField>
            <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded flex items-center gap-2">
              <AlertCircle className="w-3 h-3 flex-shrink-0" />
              Partial payments are accepted. Enter exact amount received.
            </p>
          </div>
        </Modal>
      )}

      {/* ── Void Invoice Modal ── */}
      {voidModal && (
        <Modal
          open={!!voidModal}
          onClose={() => { setVoidModal(null); setVoidReason('') }}
          title="Void Invoice"
          size="sm"
          footer={
            <>
              <Button variant="secondary" onClick={() => { setVoidModal(null); setVoidReason('') }}>Cancel</Button>
              <Button
                variant="danger"
                onClick={() => {
                  if (!voidReason.trim()) { toast.error('Please enter a reason'); return }
                  voidInvoiceMutation.mutate({ id: voidModal.id, reason: voidReason })
                }}
                isLoading={voidInvoiceMutation.isPending}
              >
                Void Invoice
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              You are about to void <strong>{voidModal.invoice_number ?? voidModal.invoiceNumber}</strong> for{' '}
              <strong>{voidModal.patient_name ?? voidModal.patientName}</strong>.
              This cannot be undone.
            </p>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Reason <span className="text-red-500">*</span></label>
              <textarea
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder="Enter reason for voiding this invoice…"
                rows={3}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-red-400 resize-none"
              />
            </div>
          </div>
        </Modal>
      )}

      {/* ── Service Price Modal ── */}
      {priceModal && (
        <Modal
          open={!!priceModal}
          onClose={() => { setPriceModal(null); setEditingPrice(null); priceForm.reset() }}
          title={editingPrice ? 'Edit Service Price' : 'Add Service Price'}
          size="md"
          footer={
            <>
              <Button variant="secondary" onClick={() => { setPriceModal(null); setEditingPrice(null); priceForm.reset() }}>Cancel</Button>
              <Button onClick={priceForm.handleSubmit((d) => savePriceMutation.mutate(d as unknown as Parameters<typeof savePriceMutation.mutate>[0]))} isLoading={savePriceMutation.isPending}>
                {editingPrice ? 'Update Price' : 'Add Price'}
              </Button>
            </>
          }
        >
          <form className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Service Type" required>
                <Select
                  options={SERVICE_TYPES}
                  placeholder="Select type"
                  {...priceForm.register('service_type', {
                    required: 'Required',
                    onChange: () => {
                      priceForm.setValue('service_name', '')
                      priceForm.setValue('service_code', '')
                      setSvcQuery('')
                      setDebouncedSvcQuery('')
                      setSelectedSvcId(null)
                      setSvcDropOpen(false)
                    },
                  })}
                />
              </FormField>
              <FormField label="Service Code" required>
                <Input {...priceForm.register('service_code', { required: 'Required' })} placeholder="e.g. PROC001" />
              </FormField>
            </div>
            <FormField label="Service Name" required>
              {watchedSvcType && !CATALOG_TYPES.has(watchedSvcType) ? (
                /* No catalog — plain text input */
                <Input
                  {...priceForm.register('service_name', { required: 'Required' })}
                  placeholder="e.g. General Consultation"
                />
              ) : (
                /* Catalog types — searchable combobox */
                <div className="relative" ref={svcDropRef}>
                  <input
                    type="text"
                    value={svcQuery}
                    onChange={(e) => {
                      const val = e.target.value
                      setSvcQuery(val)
                      priceForm.setValue('service_name', val)
                      setSvcDropOpen(true)
                      setSelectedSvcId(null)
                    }}
                    onFocus={() => { if (svcQuery.length >= 1 || svcCatalog.length > 0) setSvcDropOpen(true) }}
                    placeholder={watchedSvcType ? `Search ${watchedSvcType} services…` : 'Select a service type first'}
                    disabled={!watchedSvcType}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-50 disabled:text-gray-400"
                  />
                  {/* Hidden RHF field to keep validation working */}
                  <input type="hidden" {...priceForm.register('service_name', { required: 'Required' })} />
                  {/* Dropdown */}
                  {svcDropOpen && svcCatalog.length > 0 && (
                    <div className="absolute z-50 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg max-h-52 overflow-y-auto">
                      {svcCatalog.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault() // prevent onBlur firing before click
                            priceForm.setValue('service_name', item.name, { shouldValidate: true })
                            priceForm.setValue('service_code', item.code, { shouldValidate: true })
                            setSvcQuery(item.name)
                            setSelectedSvcId(item.id)
                            setSvcDropOpen(false)
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-primary-50 border-b border-gray-100 last:border-0 transition-colors"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="block text-sm font-medium text-gray-800">{item.name}</span>
                            {item.source && (
                              <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded font-medium ${item.source === 'Dental' ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
                                {item.source}
                              </span>
                            )}
                          </div>
                          {(item.code || item.category) && (
                            <span className="block text-xs text-gray-500">
                              {[item.code, item.category].filter(Boolean).join(' · ')}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                  {svcDropOpen && debouncedSvcQuery.length >= 2 && svcCatalog.length === 0 && (
                    <div className="absolute z-50 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow py-2 px-3 text-sm text-gray-500">
                      No services found
                    </div>
                  )}
                </div>
              )}
            </FormField>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Price (GH₵)" required>
                <Input type="number" step="0.01" min="0" {...priceForm.register('price', { required: 'Required', min: 0 })} placeholder="0.00" />
              </FormField>
              <FormField label="NHIS Tariff (GH₵)">
                <Input type="number" step="0.01" min="0" {...priceForm.register('nhis_tariff')} placeholder="0.00" />
              </FormField>
            </div>
            {priceListData && priceListData.length > 0 && (
              <FormField label="Price List">
                <Select
                  options={priceListData.map((pl) => ({ value: pl.id, label: pl.price_list_name ?? pl.priceListName ?? '' }))}
                  placeholder="Use facility default"
                  {...priceForm.register('price_list_id')}
                />
              </FormField>
            )}
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" defaultChecked {...priceForm.register('discount_allowed')} className="rounded" />
              Allow discounts on this item
            </label>
          </form>
        </Modal>
      )}
    </div>
  )
}

// ─── Invoice Detail Sub-component ─────────────────────────────────────────────

function InvoiceDetailView({ invoice }: { invoice: Invoice }) {
  const total = invoice.total_amount ?? invoice.totalAmount ?? 0
  const paid = invoice.amount_paid ?? invoice.paidAmount ?? 0
  const balance = invoice.balance_due ?? invoice.balanceDue ?? 0
  const status = invoice.payment_status ?? invoice.status ?? ''
  const items: InvoiceItem[] = invoice.items ?? []

  return (
    <div className="space-y-4">
      <div className="p-4 bg-gray-50 rounded-xl grid grid-cols-2 gap-2 text-sm">
        <span className="text-gray-500">Patient</span>
        <span className="font-medium">{invoice.patient?.name ?? invoice.patient_name ?? invoice.patientName ?? invoice.patientId}</span>
        <span className="text-gray-500">Status</span>
        <span className={statusColor(status)}>{status}</span>
        <span className="text-gray-500">Date</span>
        <span>{formatDate(invoice.invoice_date ?? invoice.invoiceDate ?? invoice.createdAt ?? '')}</span>
        {invoice.due_date && <><span className="text-gray-500">Due Date</span><span>{formatDate(invoice.due_date)}</span></>}
        {invoice.visit?.visit_number && <><span className="text-gray-500">Visit</span><span>{invoice.visit.visit_number}</span></>}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total', value: formatCurrency(total) },
          { label: 'Paid', value: formatCurrency(paid), cls: 'text-green-600' },
          { label: 'Balance', value: formatCurrency(balance), cls: balance > 0 ? 'text-red-600' : 'text-green-600' },
        ].map((s) => (
          <div key={s.label} className="card p-3 text-center">
            <p className="text-xs text-gray-500">{s.label}</p>
            <p className={`text-lg font-bold ${s.cls ?? ''}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {items.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5"><List className="w-4 h-4" />Line Items</p>
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">Service</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">Type</th>
                  <th className="px-2 py-2 text-right font-medium text-gray-500">Qty</th>
                  <th className="px-2 py-2 text-right font-medium text-gray-500">Unit</th>
                  <th className="px-2 py-2 text-right font-medium text-gray-500">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((it) => (
                  <tr key={it.id}>
                    <td className="px-3 py-2">
                      <p className="font-medium">{it.item_name ?? it.itemName}</p>
                      {(it.description) && <p className="text-gray-400">{it.description}</p>}
                    </td>
                    <td className="px-3 py-2">
                      <span className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-600 text-xs">{it.item_type ?? it.itemType}</span>
                    </td>
                    <td className="px-2 py-2 text-right">{it.quantity}</td>
                    <td className="px-2 py-2 text-right">{formatCurrency(it.unit_price ?? it.unitPrice ?? 0)}</td>
                    <td className="px-2 py-2 text-right font-semibold">{formatCurrency(it.total_price ?? it.totalPrice ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {invoice.payments && invoice.payments.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-2">Payments</p>
          <div className="space-y-1">
            {invoice.payments.map((p) => (
              <div key={p.id} className="flex justify-between items-center text-xs py-1.5 px-3 bg-green-50 rounded">
                <span className="text-gray-600">{formatDate(p.payment_date ?? p.paymentDate ?? '')} · {p.payment_method ?? p.paymentMethod}</span>
                <span className="font-semibold text-green-700">{formatCurrency(p.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Service Prices Panel ─────────────────────────────────────────────────────

interface ServicePricesPanelProps {
  prices: ServicePrice[]
  priceLists: PriceList[]
  isLoading: boolean
  search: string
  onSearch: (v: string) => void
  typeFilter: string
  onTypeFilter: (v: string) => void
  onEdit: (p: ServicePrice) => void
  onDelete: (id: string) => void
}

function ServicePricesPanel({ prices, isLoading, search, onSearch, typeFilter, onTypeFilter, onEdit, onDelete }: ServicePricesPanelProps) {
  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap">
        <div className="card p-2.5 flex items-center gap-2 flex-1 min-w-48">
          <Search className="w-4 h-4 text-gray-400 shrink-0" />
          <input value={search} onChange={(e) => onSearch(e.target.value)} placeholder="Search service prices…" className="flex-1 text-sm outline-none bg-transparent" />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => onTypeFilter(e.target.value)}
          className="text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="">All Types</option>
          {SERVICE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>

      {isLoading ? (
        <div className="text-center py-10 text-gray-400 text-sm">Loading prices…</div>
      ) : prices.length === 0 ? (
        <div className="text-center py-10 space-y-2">
          <Tag className="w-8 h-8 text-gray-300 mx-auto" />
          <p className="text-gray-400 text-sm">No service prices configured.</p>
          <p className="text-gray-400 text-xs">Add prices for procedures, lab tests, drugs, etc. so they are billed automatically when rendered.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Service</th>
                <th className="px-3 py-3 text-left font-medium text-gray-500">Code</th>
                <th className="px-3 py-3 text-left font-medium text-gray-500">Type</th>
                <th className="px-3 py-3 text-right font-medium text-gray-500">Price (GH₵)</th>
                <th className="px-3 py-3 text-right font-medium text-gray-500">NHIS</th>
                <th className="px-3 py-3 text-left font-medium text-gray-500">Price List</th>
                <th className="w-20"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {prices.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{p.service_name ?? p.serviceName}</td>
                  <td className="px-3 py-3 font-mono text-xs text-gray-500">{p.service_code ?? p.serviceCode}</td>
                  <td className="px-3 py-3">
                    <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs font-medium">{p.service_type ?? p.serviceType}</span>
                  </td>
                  <td className="px-3 py-3 text-right font-semibold">{formatCurrency(p.price)}</td>
                  <td className="px-3 py-3 text-right text-gray-500">{p.nhis_tariff ?? p.nhisTariff ? formatCurrency(p.nhis_tariff ?? p.nhisTariff ?? 0) : '—'}</td>
                  <td className="px-3 py-3 text-xs text-gray-400">{p.price_list_name ?? p.priceListName ?? '—'}</td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => onEdit(p)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500" title="Edit">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => onDelete(p.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 hover:text-red-600" title="Delete">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="text-xs text-gray-400 bg-blue-50 border border-blue-100 rounded-lg p-3 flex gap-2">
        <Settings className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
        <span>
          Prices configured here are applied <strong>automatically</strong> when services are rendered — dental procedures, lab tests, and dispensed drugs will be added to patient invoices without manual entry. Use the <strong>Service Code</strong> to match a catalog item (optional).
        </span>
      </div>
    </div>
  )
}

