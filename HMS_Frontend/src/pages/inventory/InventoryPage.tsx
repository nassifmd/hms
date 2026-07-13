import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, AlertTriangle, Package, TrendingDown, Clock, Pencil, PackagePlus, History, Scale, Trash2, SlidersHorizontal, FileDown, FileText, ArrowRightLeft, Warehouse, Pill } from 'lucide-react'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import type { InventoryItem } from '@/types'
import PageHeader from '@/components/ui/PageHeader'
import DataTable from '@/components/ui/DataTable'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { FormField, Input, Select, Textarea } from '@/components/ui/Form'
import { formatDate, formatCurrency, statusColor } from '@/lib/utils'
import { useDebounce } from '@/lib/useDebounce'

const itemTypeOptions = [
  { value: 'Medicine', label: 'Medicine' },
  { value: 'Consumable', label: 'Consumable' },
  { value: 'Equipment', label: 'Equipment' },
  { value: 'Reagent', label: 'Reagent' },
  { value: 'PPE', label: 'PPE' },
  { value: 'Other', label: 'Other' },
]

const categoryOptions = [
  { value: 'Medication', label: 'Medication' },
  { value: 'Equipment', label: 'Equipment' },
  { value: 'Consumable', label: 'Consumable' },
  { value: 'Reagent', label: 'Reagent' },
  { value: 'PPE', label: 'PPE' },
  { value: 'Other', label: 'Other' },
]

const unitOptions = [
  // Solid oral dosage forms
  { value: 'Tablet', label: 'Tablet' },
  { value: 'Capsule', label: 'Capsule' },
  { value: 'Caplet', label: 'Caplet' },
  { value: 'Sachet', label: 'Sachet' },
  { value: 'Suppository', label: 'Suppository' },
  { value: 'Lozenge', label: 'Lozenge' },
  // Liquid dosage forms
  { value: 'mL', label: 'mL (millilitre)' },
  { value: 'L', label: 'L (litre)' },
  { value: 'Bottle', label: 'Bottle' },
  { value: 'Vial', label: 'Vial' },
  { value: 'Ampoule', label: 'Ampoule' },
  { value: 'Syringe', label: 'Syringe' },
  { value: 'Drop', label: 'Drop' },
  // Topical / inhaled
  { value: 'Tube', label: 'Tube' },
  { value: 'Patch', label: 'Patch' },
  { value: 'Inhaler', label: 'Inhaler' },
  { value: 'Puff', label: 'Puff' },
  // Weight / volume measures
  { value: 'g', label: 'g (gram)' },
  { value: 'mg', label: 'mg (milligram)' },
  { value: 'mcg', label: 'mcg (microgram)' },
  // Packaging units
  { value: 'Box', label: 'Box' },
  { value: 'Pack', label: 'Pack' },
  { value: 'Roll', label: 'Roll' },
  { value: 'Pair', label: 'Pair' },
  { value: 'Piece', label: 'Piece' },
  { value: 'Set', label: 'Set' },
  { value: 'Unit', label: 'Unit' },
]

interface InventoryDashboard {
  summary?: { unique_items: number; total_units: number; total_value: number; total_batches: number }
  low_stock_items?: number
  expiring_soon?: number
  expired?: { count: number; value: number }
}

const adjustmentReasonOptions = [
  // Remove
  { value: 'Damaged',       label: 'Damaged',           dir: 'remove' },
  { value: 'Lost/Stolen',   label: 'Lost / Stolen',     dir: 'remove' },
  { value: 'Internal Use',  label: 'Internal Use',      dir: 'remove' },
  { value: 'Transfer Out',  label: 'Transfer Out',      dir: 'remove' },
  { value: 'Sample/Test',   label: 'Sample / Testing',  dir: 'remove' },
  // Add
  { value: 'Found/Surplus', label: 'Found / Surplus',   dir: 'add' },
  { value: 'Return',        label: 'Customer Return',   dir: 'add' },
  { value: 'Transfer In',   label: 'Transfer In',       dir: 'add' },
  // Either
  { value: 'Correction',    label: 'Correction',        dir: 'both' },
  { value: 'Other',         label: 'Other',             dir: 'both' },
]

export default function InventoryPage() {
  const qc = useQueryClient()
  const [stockLocation, setStockLocation] = useState<'Store' | 'Pharmacy'>('Store')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [categoryFilter, setCategoryFilter] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [restockItem, setRestockItem] = useState<InventoryItem | null>(null)
  const [editItem, setEditItem] = useState<InventoryItem | null>(null)
  const [historyItem, setHistoryItem] = useState<InventoryItem | null>(null)
  const [historyTab, setHistoryTab] = useState<'edits' | 'movements'>('movements')
  const [adjustItem, setAdjustItem] = useState<InventoryItem | null>(null)
  const [disposeItem, setDisposeItem] = useState<InventoryItem | null>(null)
  const [stockAdjItem, setStockAdjItem] = useState<InventoryItem | null>(null)
  const [transferItem, setTransferItem] = useState<InventoryItem | null>(null)
  const [page, setPage] = useState(1)
  const [exporting, setExporting] = useState<'pdf' | 'csv' | 'xlsx' | null>(null)

  const fetchAllForExport = async (): Promise<InventoryItem[]> => {
    const res = await api.get('/inventory/items', {
      params: { category: categoryFilter || undefined, search: search || undefined, stock_location: stockLocation, limit: 9999, page: 1 },
    })
    return res.data.data as InventoryItem[]
  }

  const exportToPDF = async () => {
    setExporting('pdf')
    try {
      const rows = await fetchAllForExport()
      const jsPDF = (await import('jspdf')).default
      const autoTable = (await import('jspdf-autotable')).default
      const doc = new jsPDF({ orientation: 'landscape' })
      doc.setFontSize(14)
      doc.text('Inventory Stock Report', 14, 15)
      doc.setFontSize(9)
      doc.text(`Generated: ${new Date().toLocaleString()}  |  Filters: ${categoryFilter || 'All categories'}${search ? ' | Search: ' + search : ''}`, 14, 21)
      autoTable(doc, {
        startY: 27,
        head: [['Item Name', 'SKU', 'Category', 'Type', 'Unit', 'Stock', 'Min Stock', 'Unit Price (GHS)', 'Expiry', 'Status']],
        body: rows.map((r) => [
          r.name,
          r.sku ?? '',
          r.category,
          r.item_type ?? '',
          r.unit,
          r.currentStock,
          r.minimumStock,
          formatCurrency(r.unitPrice),
          r.expiryDate ? formatDate(r.expiryDate) : '—',
          r.status,
        ]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [37, 99, 235] },
        alternateRowStyles: { fillColor: [248, 250, 252] },
      })
      doc.save(`inventory-stock-${new Date().toISOString().slice(0, 10)}.pdf`)
    } catch {
      toast.error('Failed to export PDF')
    } finally {
      setExporting(null)
    }
  }

  const exportToCSV = async () => {
    setExporting('csv')
    try {
      const rows = await fetchAllForExport()
      const headers = ['Item Name', 'SKU', 'Category', 'Type', 'Unit', 'Current Stock', 'Min Stock', 'Unit Price (GHS)', 'Expiry Date', 'Supplier', 'Status']
      const escape = (v: unknown) => {
        const s = String(v ?? '')
        return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
      }
      const lines = [
        headers.join(','),
        ...rows.map((r) => [
          escape(r.name),
          escape(r.sku ?? ''),
          escape(r.category),
          escape(r.item_type ?? ''),
          escape(r.unit),
          r.currentStock,
          r.minimumStock,
          r.unitPrice,
          r.expiryDate ? formatDate(r.expiryDate) : '',
          escape(r.supplier ?? ''),
          escape(r.status),
        ].join(','))
      ]
      const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `inventory-stock-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Failed to export CSV')
    } finally {
      setExporting(null)
    }
  }

  const exportToExcel = async () => {
    setExporting('xlsx')
    try {
      const rows = await fetchAllForExport()
      const wsData = [
        ['Item Name', 'SKU', 'Category', 'Type', 'Unit', 'Current Stock', 'Min Stock', 'Unit Price (GHS)', 'Expiry Date', 'Supplier', 'Status'],
        ...rows.map((r) => [
          r.name,
          r.sku ?? '',
          r.category,
          r.item_type ?? '',
          r.unit,
          r.currentStock,
          r.minimumStock,
          r.unitPrice,
          r.expiryDate ? formatDate(r.expiryDate) : '',
          r.supplier ?? '',
          r.status,
        ]),
      ]
      const XLSX = await import('xlsx')
      const ws = XLSX.utils.aoa_to_sheet(wsData)
      // Auto column widths
      ws['!cols'] = wsData[0].map((_, ci) => ({
        wch: Math.max(...wsData.map((row) => String(row[ci] ?? '').length), 10)
      }))
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Inventory')
      XLSX.writeFile(wb, `inventory-stock-${new Date().toISOString().slice(0, 10)}.xlsx`)
    } catch {
      toast.error('Failed to export Excel')
    } finally {
      setExporting(null)
    }
  }

  const addForm = useForm()
  const watchedCategory = addForm.watch('category', '')

  const { data: catalogData } = useQuery<{ id: string; name: string; code?: string }[]>({
    queryKey: ['inventory', 'catalog', watchedCategory],
    queryFn: () =>
      api.get('/inventory/catalog', { params: { category: watchedCategory } }).then((r) => r.data.data),
    enabled: !!watchedCategory && watchedCategory !== 'Other',
    staleTime: 5 * 60 * 1000,
  })

  const catalogNames: string[] = catalogData?.map((c) => c.name) ?? []

  const handleItemNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const typed = e.target.value
    addForm.setValue('item_name', typed)
    const match = catalogData?.find((c) => c.name.toLowerCase() === typed.toLowerCase())
    if (match?.code) {
      addForm.setValue('item_code', match.code)
    }
  }

  const { data, isLoading } = useQuery({
    queryKey: ['inventory', stockLocation, categoryFilter, debouncedSearch, page],
    queryFn: () =>
      api.get('/inventory/items', {
        params: { category: categoryFilter || undefined, search: debouncedSearch || undefined, stock_location: stockLocation, page, limit: 20 },
      }).then((r) => r.data),
  })

  const { data: dashboardData } = useQuery<InventoryDashboard>({
    queryKey: ['inventory', 'dashboard', stockLocation],
    queryFn: () => api.get('/inventory/dashboard', { params: { stock_location: stockLocation } }).then((r) => r.data.data as InventoryDashboard),
  })

  const items: InventoryItem[] = data?.data ?? []
  const pagination = data?.pagination

  const editForm = useForm()

  const { data: editItemDetail } = useQuery({
    queryKey: ['inventory', 'item-detail', editItem?.id],
    queryFn: () => api.get(`/inventory/items/${editItem!.id}`).then((r) => r.data.data),
    enabled: !!editItem,
    staleTime: 0,
  })

  useEffect(() => {
    if (editItemDetail) {
      editForm.reset({
        item_name:          editItemDetail.item_name,
        category:           editItemDetail.category,
        item_type:          editItemDetail.item_type,
        description:        editItemDetail.description ?? '',
        manufacturer:       editItemDetail.manufacturer ?? '',
        unit_of_measure:    editItemDetail.unit_of_measure,
        reorder_level:      editItemDetail.reorder_level,
        maximum_level:      editItemDetail.maximum_level,
        storage_location:   editItemDetail.storage_location ?? '',
        storage_conditions: editItemDetail.storage_conditions ?? '',
      })
    }
  }, [editItemDetail])

  const { data: historyData, isFetching: historyLoading } = useQuery({
    queryKey: ['inventory', 'history', historyItem?.id],
    queryFn: () => api.get(`/inventory/items/${historyItem!.id}/history`).then((r) => r.data.data),
    enabled: !!historyItem,
    staleTime: 0,
  })

  const { data: adjustBatches = [] } = useQuery<any[]>({
    queryKey: ['inventory', 'batches', adjustItem?.id, stockLocation],
    queryFn: () => api.get(`/inventory/batches`, { params: { item_id: adjustItem!.id, stock_location: stockLocation } }).then((r) => r.data.data),
    enabled: !!adjustItem,
    staleTime: 0,
  })

  const { data: expiredBatches = [] } = useQuery<any[]>({
    queryKey: ['inventory', 'expired-batches', disposeItem?.id, stockLocation],
    queryFn: () =>
      api.get(`/inventory/batches`, { params: { item_id: disposeItem!.id, expired_only: true, stock_location: stockLocation } })
        .then((r) => (r.data.data as any[]).filter((b) => b.quantity_on_hand > 0)),
    enabled: !!disposeItem,
    staleTime: 0,
  })

  const disposeForm = useForm<{ notes: string }>()

  const stockAdjForm = useForm<{ direction: 'add' | 'remove'; quantity: number; reason: string; notes: string }>({
    defaultValues: { direction: 'remove' },
  })
  const watchDirection = stockAdjForm.watch('direction')
  const watchReason = stockAdjForm.watch('reason')

  // Auto-flip direction when a reason with a fixed direction is picked
  useEffect(() => {
    const match = adjustmentReasonOptions.find((o) => o.value === watchReason)
    if (match && match.dir !== 'both') {
      stockAdjForm.setValue('direction', match.dir as 'add' | 'remove')
    }
  }, [watchReason])

  const disposeMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: unknown }) =>
      api.post(`/inventory/items/${id}/dispose-expired`, payload),
    onSuccess: (res) => {
      toast.success(res.data.message ?? 'Expired stock disposed')
      qc.invalidateQueries({ queryKey: ['inventory'] })
      setDisposeItem(null)
      disposeForm.reset()
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message ?? 'Failed to dispose stock'),
  })

  const stockAdjMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: unknown }) =>
      api.post(`/inventory/items/${id}/adjustment`, payload),
    onSuccess: (res) => {
      toast.success(res.data.message ?? 'Stock adjusted')
      qc.invalidateQueries({ queryKey: ['inventory'] })
      setStockAdjItem(null)
      stockAdjForm.reset({ direction: 'remove' })
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message ?? 'Failed to adjust stock'),
  })

  const adjustForm = useForm<{ batch_id: string; new_quantity: number; reason: string }>()

  const adjustMutation = useMutation({
    mutationFn: ({ batch_id, payload }: { batch_id: string; payload: unknown }) =>
      api.patch(`/inventory/batches/${batch_id}/adjust`, payload),
    onSuccess: () => {
      toast.success('Stock quantity corrected')
      qc.invalidateQueries({ queryKey: ['inventory'] })
      setAdjustItem(null)
      adjustForm.reset()
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message ?? 'Failed to adjust stock'),
  })

  const createMutation = useMutation({
    mutationFn: (payload: unknown) => api.post('/inventory/items', payload),
    onSuccess: () => {
      toast.success('Item added to inventory')
      qc.invalidateQueries({ queryKey: ['inventory'] })
      setAddOpen(false)
      addForm.reset()
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error?.message
      toast.error(msg ?? 'Failed to add item')
    },
  })

  const restockMutation = useMutation({
    mutationFn: (payload: unknown) => api.post('/inventory/batches', payload),
    onSuccess: () => {
      toast.success('Stock received successfully')
      qc.invalidateQueries({ queryKey: ['inventory'] })
      setRestockItem(null)
      restockForm.reset()
    },
    onError: () => toast.error('Failed to receive stock'),
  })

  const editMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: unknown }) =>
      api.put(`/inventory/items/${id}`, payload),
    onSuccess: () => {
      toast.success('Item updated successfully')
      qc.invalidateQueries({ queryKey: ['inventory'] })
      setEditItem(null)
      editForm.reset()
    },
    onError: () => toast.error('Failed to update item'),
  })

  const restockForm = useForm()

  const transferForm = useForm<{ quantity: number; notes: string }>()
  const transferMutation = useMutation({
    mutationFn: (payload: unknown) => api.post('/inventory/transfer', payload),
    onSuccess: (res) => {
      toast.success(res.data.message ?? 'Stock transferred to Pharmacy')
      qc.invalidateQueries({ queryKey: ['inventory'] })
      setTransferItem(null)
      transferForm.reset()
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message ?? 'Transfer failed'),
  })

  const columns = useMemo(() => [
    { key: 'name', header: 'Item Name', render: (r: InventoryItem) => (
      <div>
        <p className="font-medium">{r.name}</p>
        {r.sku && <p className="text-xs text-gray-400 font-mono">{r.sku}</p>}
      </div>
    )},
    { key: 'category', header: 'Category' },
    { key: 'currentStock', header: 'Stock', render: (r: InventoryItem) => (
      <div className="flex items-center gap-2">
        <span className={r.currentStock <= r.minimumStock ? 'text-red-600 font-semibold' : 'font-medium'}>
          {r.currentStock}
        </span>
        <span className="text-gray-400 text-xs">/ min {r.minimumStock}</span>
        {r.currentStock <= r.minimumStock && <AlertTriangle className="w-3.5 h-3.5 text-red-500" />}
      </div>
    )},
    { key: 'unit', header: 'Unit' },
    { key: 'unitPrice', header: 'Unit Price', render: (r: InventoryItem) => formatCurrency(r.unitPrice) },
    { key: 'expiryDate', header: 'Expiry', render: (r: InventoryItem) => r.expiryDate ? formatDate(r.expiryDate) : '—' },
    { key: 'status', header: 'Status', render: (r: InventoryItem) => <span className={statusColor(r.status)}>{r.status}</span> },
    { key: 'actions', header: '', render: (r: InventoryItem) => (
      <div className="flex items-center gap-1">
        {stockLocation === 'Store' && (
          <>
            <button
              title="Receive Stock"
              onClick={() => { setRestockItem(r); restockForm.reset({ item_id: r.id }) }}
              className="p-1.5 rounded-lg hover:bg-green-50 text-green-600"
            >
              <PackagePlus className="w-4 h-4" />
            </button>
            <button
              title="Transfer to Pharmacy"
              onClick={() => { setTransferItem(r); transferForm.reset() }}
              className="p-1.5 rounded-lg hover:bg-indigo-50 text-indigo-600"
            >
              <ArrowRightLeft className="w-4 h-4" />
            </button>
          </>
        )}
        <button
          title="Adjust Stock"
          onClick={() => { setAdjustItem(r); adjustForm.reset() }}
          className="p-1.5 rounded-lg hover:bg-amber-50 text-amber-500"
        >
          <Scale className="w-4 h-4" />
        </button>
        <button
          title="Stock Adjustment"
          onClick={() => { setStockAdjItem(r); stockAdjForm.reset({ direction: 'remove' }) }}
          className="p-1.5 rounded-lg hover:bg-purple-50 text-purple-500"
        >
          <SlidersHorizontal className="w-4 h-4" />
        </button>
        <button
          title="Edit Item"
          onClick={() => setEditItem(r)}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
        >
          <Pencil className="w-4 h-4" />
        </button>
        {r.status === 'Expired' && (
          <button
            title="Dispose Expired Stock"
            onClick={() => { setDisposeItem(r); disposeForm.reset() }}
            className="p-1.5 rounded-lg hover:bg-red-50 text-red-500"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
        <button
          title="View History"
          onClick={() => { setHistoryItem(r); setHistoryTab('movements') }}
          className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-500"
        >
          <History className="w-4 h-4" />
        </button>
      </div>
    )},
  ], [])

  return (
    <div className="space-y-5">
      <PageHeader
        title="Inventory"
        subtitle="Stock management and alerts"
        actions={
          stockLocation === 'Store' ? (
            <Button leftIcon={<Plus className="w-4 h-4" />} onClick={() => setAddOpen(true)} size="sm">
              Add Item
            </Button>
          ) : undefined
        }
      />

      {/* Store / Pharmacy tabs */}
      <div className="flex border-b border-gray-200">
        {([
          { key: 'Store' as const, label: 'Store', icon: <Warehouse className="w-4 h-4" />, desc: 'Receiving & main stock' },
          { key: 'Pharmacy' as const, label: 'Pharmacy', icon: <Pill className="w-4 h-4" />, desc: 'Dispensing stock' },
        ]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setStockLocation(tab.key); setPage(1) }}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
              stockLocation === tab.key
                ? 'border-primary-600 text-primary-700'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
            <span className="text-xs text-gray-400 hidden sm:inline">— {tab.desc}</span>
          </button>
        ))}
      </div>

      {/* Dashboard stats */}
      {dashboardData && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Unique Items', value: dashboardData.summary?.unique_items ?? 0, icon: <Package className="w-5 h-5 text-blue-500" />, bg: 'bg-blue-50' },
            { label: 'Total Units', value: dashboardData.summary?.total_units ?? 0, icon: <Package className="w-5 h-5 text-green-500" />, bg: 'bg-green-50' },
            { label: 'Low Stock Items', value: dashboardData.low_stock_items ?? 0, icon: <TrendingDown className="w-5 h-5 text-amber-500" />, bg: 'bg-amber-50' },
            { label: 'Expiring (30d)', value: dashboardData.expiring_soon ?? 0, icon: <Clock className="w-5 h-5 text-red-500" />, bg: 'bg-red-50' },
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

      {/* Low stock warning */}
      {(dashboardData?.low_stock_items ?? 0) > 0 && (
        <div className="card p-3 bg-amber-50 border-amber-200 flex items-center gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <p className="text-sm text-amber-800">
            <strong>{dashboardData!.low_stock_items}</strong> item(s) are below reorder level and need restocking.
          </p>
        </div>
      )}

      {/* Filters */}
      <div className="card p-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 flex-1">
          <Search className="w-4 h-4 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search items…" className="flex-1 text-sm outline-none bg-transparent" />
        </div>
        <Select
          options={categoryOptions}
          placeholder="All categories"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="w-40 text-sm py-1.5"
        />
        <div className="flex items-center gap-1.5 border-l border-gray-200 pl-3">
          <button
            title="Export PDF"
            onClick={exportToPDF}
            disabled={!!exporting}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 border border-red-200 disabled:opacity-50 disabled:cursor-wait"
          >
            <FileText className="w-3.5 h-3.5" />
            {exporting === 'pdf' ? 'Exporting…' : 'PDF'}
          </button>
          <button
            title="Export CSV"
            onClick={exportToCSV}
            disabled={!!exporting}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-green-700 hover:bg-green-50 border border-green-200 disabled:opacity-50 disabled:cursor-wait"
          >
            <FileDown className="w-3.5 h-3.5" />
            {exporting === 'csv' ? 'Exporting…' : 'CSV'}
          </button>
          <button
            title="Export Excel"
            onClick={exportToExcel}
            disabled={!!exporting}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-emerald-700 hover:bg-emerald-50 border border-emerald-200 disabled:opacity-50 disabled:cursor-wait"
          >
            <FileDown className="w-3.5 h-3.5" />
            {exporting === 'xlsx' ? 'Exporting…' : 'Excel'}
          </button>
        </div>
      </div>

      <DataTable columns={columns} data={items} keyField="id" isLoading={isLoading} emptyMessage="No inventory items found" />

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Page {pagination.page} of {pagination.totalPages}</span>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Button variant="secondary" size="sm" disabled={page === pagination.totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}

      {/* Add Item Modal */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add Inventory Item" size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={addForm.handleSubmit((d) => createMutation.mutate(d))} isLoading={createMutation.isPending}>
              Add Item
            </Button>
          </>
        }
      >
        <form className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Category" className="sm:col-span-2">
            <Select options={categoryOptions} placeholder="Select category" {...addForm.register('category')} />
          </FormField>
          <FormField label="Item Name" required className="sm:col-span-2">
            <input
              list="catalog-item-names"
              {...addForm.register('item_name', { required: 'Required' })}
              onChange={handleItemNameChange}
              placeholder={watchedCategory ? `Search ${watchedCategory} name…` : 'Select a category first, then type item name'}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 bg-white"
            />
            <datalist id="catalog-item-names">
              {catalogNames.map((name) => <option key={name} value={name} />)}
            </datalist>
            {watchedCategory && catalogNames.length === 0 && watchedCategory !== 'Other' && (
              <p className="text-xs text-gray-400 mt-1">No catalog entries found — type the name manually</p>
            )}
          </FormField>
          <FormField label="Item Code / SKU" required>
            <Input {...addForm.register('item_code', { required: 'Required' })} placeholder="e.g. MED-0001" />
          </FormField>
          <FormField label="Item Type" required>
            <Select options={itemTypeOptions} placeholder="Select type" {...addForm.register('item_type', { required: 'Required' })} />
          </FormField>
          <FormField label="Unit of Measure">
            <input
              list="unit-options"
              {...addForm.register('unit_of_measure')}
              placeholder="e.g. Tablet, mL, Box…"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 bg-white"
            />
            <datalist id="unit-options">
              {unitOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </datalist>
          </FormField>
          <FormField label="Reorder Level">
            <Input type="number" {...addForm.register('reorder_level', { valueAsNumber: true })} placeholder="0" />
          </FormField>
          <FormField label="Maximum Level">
            <Input type="number" {...addForm.register('maximum_level', { valueAsNumber: true })} placeholder="0" />
          </FormField>
          <FormField label="Manufacturer">
            <Input {...addForm.register('manufacturer')} placeholder="Manufacturer name" />
          </FormField>
          <FormField label="Storage Location">
            <Input {...addForm.register('storage_location')} placeholder="e.g. Pharmacy Store A" />
          </FormField>
          <FormField label="Storage Conditions">
            <Input {...addForm.register('storage_conditions')} placeholder="e.g. Store below 25°C" />
          </FormField>
          <FormField label="Description" className="sm:col-span-2">
            <Textarea {...addForm.register('description')} placeholder="Optional notes about this item" rows={2} />
          </FormField>
        </form>
      </Modal>

      {/* Receive Stock Modal */}
      <Modal
        open={!!restockItem}
        onClose={() => setRestockItem(null)}
        title={`Receive Stock — ${restockItem?.name ?? ''}`}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRestockItem(null)}>Cancel</Button>
            <Button
              onClick={restockForm.handleSubmit((d) =>
                restockMutation.mutate({ ...d, item_id: restockItem!.id, item_type: restockItem!.item_type })
              )}
              isLoading={restockMutation.isPending}
            >
              Receive Stock
            </Button>
          </>
        }
      >
        <form className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Batch Number" required className="sm:col-span-2">
            <Input
              {...restockForm.register('batch_number', { required: 'Required' })}
              placeholder="e.g. BN-2026-001"
            />
          </FormField>
          <FormField label="Quantity Received" required>
            <Input
              type="number"
              {...restockForm.register('quantity_on_hand', { required: 'Required', valueAsNumber: true, min: 1 })}
              placeholder="0"
            />
          </FormField>
          <FormField label="Unit Cost (GHS)" required>
            <Input
              type="number"
              step="0.01"
              {...restockForm.register('unit_cost', { required: 'Required', valueAsNumber: true, min: 0 })}
              placeholder="0.00"
            />
          </FormField>
          <FormField label="Expiry Date">
            <Input type="date" {...restockForm.register('expiry_date')} />
          </FormField>
          <FormField label="Manufacturing Date">
            <Input type="date" {...restockForm.register('manufacturing_date')} />
          </FormField>
          <FormField label="Storage Location" className="sm:col-span-2">
            <Input {...restockForm.register('location')} placeholder="e.g. Shelf A3" />
          </FormField>
          <FormField label="Notes" className="sm:col-span-2">
            <Textarea {...restockForm.register('notes')} placeholder="Optional notes" rows={2} />
          </FormField>
        </form>
      </Modal>

      {/* ── Dispose Expired Stock Modal ── */}
      <Modal
        open={!!disposeItem}
        onClose={() => setDisposeItem(null)}
        title={`Dispose Expired Stock — ${disposeItem?.name ?? ''}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDisposeItem(null)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={disposeForm.handleSubmit((d) =>
                disposeMutation.mutate({ id: disposeItem!.id, payload: d })
              )}
              isLoading={disposeMutation.isPending}
            >
              Confirm Disposal
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            This will write off all expired batches with remaining stock. A disposal movement record will be saved for each batch.
          </p>

          {expiredBatches.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Loading expired batches…</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    <th className="px-3 py-2 font-medium text-gray-500">Batch No.</th>
                    <th className="px-3 py-2 font-medium text-gray-500">Expired</th>
                    <th className="px-3 py-2 font-medium text-gray-500 text-right">Qty</th>
                    <th className="px-3 py-2 font-medium text-gray-500 text-right">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {expiredBatches.map((b: any) => (
                    <tr key={b.id}>
                      <td className="px-3 py-2 font-mono">{b.batch_number}</td>
                      <td className="px-3 py-2 text-red-600">{formatDate(b.expiry_date)}</td>
                      <td className="px-3 py-2 text-right font-medium">{b.quantity_on_hand}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(b.quantity_on_hand * b.unit_cost)}</td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50 font-semibold">
                    <td className="px-3 py-2" colSpan={2}>Total write-off</td>
                    <td className="px-3 py-2 text-right">
                      {expiredBatches.reduce((s: number, b: any) => s + Number(b.quantity_on_hand), 0)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {formatCurrency(expiredBatches.reduce((s: number, b: any) => s + b.quantity_on_hand * b.unit_cost, 0))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          <FormField label="Disposal Notes">
            <Textarea
              placeholder="e.g. Expired medication disposed per protocol"
              rows={2}
              {...disposeForm.register('notes')}
            />
          </FormField>
        </div>
      </Modal>

      {/* ── Stock Adjustment Modal ── */}
      <Modal
        open={!!stockAdjItem}
        onClose={() => setStockAdjItem(null)}
        title={`Stock Adjustment — ${stockAdjItem?.name ?? ''}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setStockAdjItem(null)}>Cancel</Button>
            <Button
              onClick={stockAdjForm.handleSubmit((d) =>
                stockAdjMutation.mutate({ id: stockAdjItem!.id, payload: { ...d, stock_location: stockLocation } })
              )}
              isLoading={stockAdjMutation.isPending}
            >
              Confirm Adjustment
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {/* Current stock banner */}
          <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
            <span className="text-sm text-gray-500">Current Stock</span>
            <span className="text-lg font-bold text-gray-800">
              {stockAdjItem?.currentStock ?? 0}
              <span className="text-sm font-normal text-gray-400 ml-1">{stockAdjItem?.unit}</span>
            </span>
          </div>

          {/* Direction toggle */}
          <FormField label="Direction" required>
            {(() => {
              const activeClass = (dir: 'add' | 'remove') => {
                if (dir === 'remove') return 'bg-red-50 border-red-400 text-red-700'
                return 'bg-green-50 border-green-400 text-green-700'
              }
              return (
                <div className="flex gap-2">
                  {(['remove', 'add'] as const).map((dir) => (
                    <label
                      key={dir}
                      className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg border cursor-pointer text-sm font-medium transition-colors ${
                        watchDirection === dir
                          ? activeClass(dir)
                          : 'border-gray-300 text-gray-500 hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="radio"
                        value={dir}
                        {...stockAdjForm.register('direction')}
                        className="sr-only"
                      />
                      {dir === 'remove' ? '− Remove' : '+ Add'}
                    </label>
                  ))}
                </div>
              )
            })()}
          </FormField>

          <FormField label="Reason" required>
            <Select
              options={adjustmentReasonOptions.filter(
                (o) => o.dir === 'both' || o.dir === watchDirection
              )}
              placeholder="Select reason…"
              {...stockAdjForm.register('reason', { required: 'Reason is required' })}
            />
          </FormField>

          <FormField label="Quantity" required>
            <Input
              type="number"
              min={1}
              max={watchDirection === 'remove' ? stockAdjItem?.currentStock : undefined}
              placeholder="Enter quantity"
              {...stockAdjForm.register('quantity', {
                required: 'Required',
                valueAsNumber: true,
                min: { value: 1, message: 'Must be at least 1' },
                ...(watchDirection === 'remove' && stockAdjItem
                  ? { max: { value: stockAdjItem.currentStock, message: `Cannot exceed current stock (${stockAdjItem.currentStock})` } }
                  : {}),
              })}
            />
          </FormField>

          <FormField label="Notes">
            <Textarea
              placeholder="Optional — additional details"
              rows={2}
              {...stockAdjForm.register('notes')}
            />
          </FormField>
        </div>
      </Modal>

      {/* ── Adjust Stock Modal ── */}
      <Modal
        open={!!adjustItem}
        onClose={() => setAdjustItem(null)}
        title={`Adjust Stock — ${adjustItem?.name ?? ''}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAdjustItem(null)}>Cancel</Button>
            <Button
              onClick={adjustForm.handleSubmit((d) =>
                adjustMutation.mutate({ batch_id: d.batch_id, payload: { new_quantity: d.new_quantity, reason: d.reason } })
              )}
              isLoading={adjustMutation.isPending}
            >
              Save Correction
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Use this to correct a quantity that was entered incorrectly. An adjustment record will be saved for audit purposes.
          </p>
          <FormField label="Batch" required>
            <Select
              options={adjustBatches.map((b: any) => ({
                value: b.id,
                label: `Batch ${b.batch_number} — current qty: ${b.quantity_on_hand}${
                  b.expiry_date ? ` | exp: ${formatDate(b.expiry_date)}` : ''
                }`,
              }))}
              placeholder={adjustBatches.length === 0 ? 'No batches found' : 'Select batch to correct…'}
              {...adjustForm.register('batch_id', { required: 'Select a batch' })}
            />
          </FormField>
          <FormField label="Correct Quantity" required>
            <Input
              type="number"
              min={0}
              placeholder="Enter the actual (correct) quantity"
              {...adjustForm.register('new_quantity', { required: 'Required', valueAsNumber: true, min: 0 })}
            />
          </FormField>
          <FormField label="Reason" required>
            <Textarea
              placeholder="e.g. Entry error — actual count is 50 not 500"
              rows={2}
              {...adjustForm.register('reason', { required: 'Reason is required' })}
            />
          </FormField>
        </div>
      </Modal>

      {/* ── Edit Item Modal ── */}
      <Modal
        open={!!editItem}
        onClose={() => setEditItem(null)}
        title={`Edit — ${editItem?.name ?? ''}`}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditItem(null)}>Cancel</Button>
            <Button
              onClick={editForm.handleSubmit((d) =>
                editMutation.mutate({ id: editItem!.id, payload: d })
              )}
              isLoading={editMutation.isPending}
            >
              Save Changes
            </Button>
          </>
        }
      >
        <form className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Category">
            <Select options={categoryOptions} placeholder="Select category" {...editForm.register('category')} />
          </FormField>
          <FormField label="Item Type">
            <Select options={itemTypeOptions} placeholder="Select type" {...editForm.register('item_type')} />
          </FormField>
          <FormField label="Item Name" required className="sm:col-span-2">
            <Input {...editForm.register('item_name', { required: 'Required' })} placeholder="Item name" />
          </FormField>
          <FormField label="Unit of Measure">
            <input
              list="edit-unit-options"
              {...editForm.register('unit_of_measure')}
              placeholder="e.g. Tablet, mL, Box…"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 bg-white"
            />
            <datalist id="edit-unit-options">
              {unitOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </datalist>
          </FormField>
          <FormField label="Reorder Level">
            <Input type="number" {...editForm.register('reorder_level', { valueAsNumber: true })} placeholder="0" />
          </FormField>
          <FormField label="Maximum Level">
            <Input type="number" {...editForm.register('maximum_level', { valueAsNumber: true })} placeholder="0" />
          </FormField>
          <FormField label="Manufacturer">
            <Input {...editForm.register('manufacturer')} placeholder="Manufacturer name" />
          </FormField>
          <FormField label="Storage Location">
            <Input {...editForm.register('storage_location')} placeholder="e.g. Pharmacy Store A" />
          </FormField>
          <FormField label="Storage Conditions">
            <Input {...editForm.register('storage_conditions')} placeholder="e.g. Store below 25°C" />
          </FormField>
          <FormField label="Description" className="sm:col-span-2">
            <Textarea {...editForm.register('description')} placeholder="Optional notes" rows={2} />
          </FormField>
        </form>
      </Modal>

      {/* ── Item History Modal ── */}
      <Modal
        open={!!historyItem}
        onClose={() => setHistoryItem(null)}
        title={`History — ${historyItem?.name ?? ''}`}
        size="lg"
      >
        <div className="space-y-3">
          {/* Tabs */}
          <div className="flex border-b border-gray-200">
            {(['movements', 'edits'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setHistoryTab(tab)}
                className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors ${
                  historyTab === tab
                    ? 'border-primary-600 text-primary-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab === 'movements' ? 'Stock Movements' : 'Edit History'}
              </button>
            ))}
          </div>

          {historyLoading && (
            <div className="text-center py-6 text-sm text-gray-400">Loading…</div>
          )}

          {/* Stock Movements */}
          {!historyLoading && historyTab === 'movements' && (
            <div className="overflow-x-auto">
              {(historyData?.movements ?? []).length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">No stock movements recorded</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 text-left">
                      <th className="px-3 py-2 font-medium text-gray-500">Date</th>
                      <th className="px-3 py-2 font-medium text-gray-500">Type</th>
                      <th className="px-3 py-2 font-medium text-gray-500">Batch</th>
                      <th className="px-3 py-2 font-medium text-gray-500 text-right">Qty</th>
                      <th className="px-3 py-2 font-medium text-gray-500 text-right">Unit Cost</th>
                      <th className="px-3 py-2 font-medium text-gray-500">By</th>
                      <th className="px-3 py-2 font-medium text-gray-500">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {historyData.movements.map((m: any) => (
                      <tr key={m.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 whitespace-nowrap">{formatDate(m.created_at)}</td>
                        <td className="px-3 py-2">
                          {(() => {
                            const cls: Record<string, string> = {
                              Receipt:    'bg-green-100 text-green-700',
                              Issue:      'bg-red-100 text-red-700',
                              Adjustment: 'bg-amber-100 text-amber-700',
                            }
                            return (
                              <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${cls[m.movement_type] ?? 'bg-gray-100 text-gray-600'}`}>
                                {m.movement_type}
                              </span>
                            )
                          })()}
                        </td>
                        <td className="px-3 py-2 font-mono">{m.batch_number ?? '—'}</td>
                        <td className="px-3 py-2 text-right font-medium">{m.quantity}</td>
                        <td className="px-3 py-2 text-right">{m.unit_cost ? formatCurrency(m.unit_cost) : '—'}</td>
                        <td className="px-3 py-2">{m.user_name ?? '—'}</td>
                        <td className="px-3 py-2 text-gray-500 max-w-[180px] truncate">{m.notes ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Edit History */}
          {!historyLoading && historyTab === 'edits' && (
            <div className="space-y-2">
              {(historyData?.edits ?? []).length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">No edits recorded yet</p>
              ) : (
                historyData.edits.map((e: any) => {
                  const oldV = e.old_values ?? {}
                  const newV = e.new_values ?? {}
                  const changed = Object.keys(newV).filter(
                    (k) => !['updated_at', 'created_at'].includes(k) &&
                            JSON.stringify(oldV[k]) !== JSON.stringify(newV[k])
                  )
                  return (
                    <div key={e.id} className="border border-gray-200 rounded-lg p-3 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-gray-700">{e.user_name ?? 'System'}</span>
                        <span className="text-xs text-gray-400">{formatDate(e.created_at)}</span>
                      </div>
                      {changed.length === 0 ? (
                        <p className="text-xs text-gray-400">No field changes recorded</p>
                      ) : (
                        <div className="space-y-1">
                          {changed.map((field) => (
                            <div key={field} className="grid grid-cols-[120px_1fr] gap-2 text-xs">
                              <span className="font-medium text-gray-500 capitalize">{field.replace(/_/g, ' ')}</span>
                              <span>
                                <span className="line-through text-red-500 mr-2">{String(oldV[field] ?? '—')}</span>
                                <span className="text-green-700">{String(newV[field] ?? '—')}</span>
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          )}
        </div>
      </Modal>

      {/* ── Transfer to Pharmacy Modal ── */}
      <Modal
        open={!!transferItem}
        onClose={() => setTransferItem(null)}
        title={`Transfer to Pharmacy — ${transferItem?.name ?? ''}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setTransferItem(null)}>Cancel</Button>
            <Button
              onClick={transferForm.handleSubmit((d) =>
                transferMutation.mutate({ item_id: transferItem!.id, quantity: d.quantity, notes: d.notes })
              )}
              isLoading={transferMutation.isPending}
            >
              Transfer to Pharmacy
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
            <span className="text-sm text-gray-500">Available in Store</span>
            <span className="text-lg font-bold text-gray-800">
              {transferItem?.currentStock ?? 0}
              <span className="text-sm font-normal text-gray-400 ml-1">{transferItem?.unit}</span>
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2">
            <ArrowRightLeft className="w-4 h-4 flex-shrink-0" />
            <span>Stock will be moved from <strong>Store</strong> to <strong>Pharmacy</strong> using FEFO (First Expired, First Out).</span>
          </div>
          <FormField label="Quantity to Transfer" required>
            <Input
              type="number"
              min={1}
              max={transferItem?.currentStock}
              placeholder="Enter quantity"
              {...transferForm.register('quantity', {
                required: 'Required',
                valueAsNumber: true,
                min: { value: 1, message: 'Must be at least 1' },
                max: { value: transferItem?.currentStock ?? 0, message: `Cannot exceed store stock (${transferItem?.currentStock ?? 0})` },
              })}
            />
          </FormField>
          <FormField label="Notes">
            <Textarea
              placeholder="Optional — transfer notes"
              rows={2}
              {...transferForm.register('notes')}
            />
          </FormField>
        </div>
      </Modal>
    </div>
  )
}
