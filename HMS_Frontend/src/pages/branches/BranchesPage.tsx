import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, GitBranch, Pencil, CheckCircle, XCircle, Trash2, ToggleLeft } from 'lucide-react'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import type { Branch } from '@/types'
import PageHeader from '@/components/ui/PageHeader'
import DataTable from '@/components/ui/DataTable'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { FormField, Input, Select } from '@/components/ui/Form'

const BRANCH_STATUS_OPTIONS = [
  { value: 'Active', label: 'Active' },
  { value: 'Inactive', label: 'Inactive' },
  { value: 'Suspended', label: 'Suspended' },
  { value: 'Under Construction', label: 'Under Construction' },
]

export default function BranchesPage() {
  const qc = useQueryClient()
  const [addOpen, setAddOpen] = useState(false)
  const [editBranch, setEditBranch] = useState<Branch | null>(null)
  const [statusBranch, setStatusBranch] = useState<Branch | null>(null)
  const [deleteBranch, setDeleteBranch] = useState<Branch | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['branches'],
    queryFn: () => api.get('/branches').then((r) => r.data),
  })

  const branches: Branch[] = data?.data ?? []

  const createMutation = useMutation({
    mutationFn: (payload: unknown) => api.post('/branches', payload),
    onSuccess: () => {
      toast.success('Branch created')
      qc.invalidateQueries({ queryKey: ['branches'] })
      setAddOpen(false)
      addForm.reset()
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Failed to create branch'
      toast.error(msg)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: unknown }) => api.put(`/branches/${id}`, payload),
    onSuccess: () => {
      toast.success('Branch updated')
      qc.invalidateQueries({ queryKey: ['branches'] })
      setEditBranch(null)
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Failed to update branch'
      toast.error(msg)
    },
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/branches/${id}/status`, { status }),
    onSuccess: () => {
      toast.success('Branch status updated')
      qc.invalidateQueries({ queryKey: ['branches'] })
      setStatusBranch(null)
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Failed to update status'
      toast.error(msg)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/branches/${id}`),
    onSuccess: () => {
      toast.success('Branch deactivated')
      qc.invalidateQueries({ queryKey: ['branches'] })
      setDeleteBranch(null)
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Failed to deactivate branch'
      toast.error(msg)
    },
  })

  const addForm = useForm<Partial<Branch>>()
  const editForm = useForm<Partial<Branch>>()
  const statusForm = useForm<{ status: string }>()

  const openEdit = (branch: Branch) => {
    editForm.reset({
      name:    branch.name,
      code:    branch.code,
      phone:   branch.phone,
      email:   branch.email,
      address: branch.address,
    })
    setEditBranch(branch)
  }

  const openStatus = (branch: Branch) => {
    statusForm.reset({ status: (branch as unknown as Record<string, string>).status ?? (branch.isActive ? 'Active' : 'Inactive') })
    setStatusBranch(branch)
  }

  const columns = [
    { key: 'name', header: 'Branch Name', render: (r: Branch) => (
      <div className="flex items-center gap-2">
        <GitBranch className="w-4 h-4 text-primary-500" />
        <span className="font-medium">{r.name}</span>
      </div>
    )},
    { key: 'code', header: 'Code', render: (r: Branch) => <span className="font-mono text-xs badge-blue">{r.code}</span> },
    { key: 'phone', header: 'Phone', render: (r: Branch) => r.phone ?? '—' },
    { key: 'email', header: 'Email', render: (r: Branch) => r.email ?? '—' },
    { key: 'address', header: 'Address', render: (r: Branch) => <span className="text-xs text-gray-500">{r.address ?? '—'}</span> },
    { key: 'isActive', header: 'Status', render: (r: Branch) => (
      r.isActive
        ? <span className="flex items-center gap-1 text-green-600 text-sm"><CheckCircle className="w-3.5 h-3.5" /> Active</span>
        : <span className="flex items-center gap-1 text-red-500 text-sm"><XCircle className="w-3.5 h-3.5" /> Inactive</span>
    )},
    { key: 'actions', header: '', render: (r: Branch) => (
      <div className="flex items-center gap-1">
        <button onClick={() => openEdit(r)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500" title="Edit">
          <Pencil className="w-4 h-4" />
        </button>
        <button onClick={() => openStatus(r)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500" title="Change Status">
          <ToggleLeft className="w-4 h-4" />
        </button>
        <button onClick={() => setDeleteBranch(r)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-400" title="Deactivate">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    )},
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="Branches"
        subtitle="Hospital branches and facilities"
        actions={
          <Button leftIcon={<Plus className="w-4 h-4" />} onClick={() => setAddOpen(true)} size="sm">
            Add Branch
          </Button>
        }
      />

      <DataTable columns={columns} data={branches} keyField="id" isLoading={isLoading} emptyMessage="No branches found" />

      {/* Add Branch Modal */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add Branch" size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={addForm.handleSubmit((d) => createMutation.mutate(d))} isLoading={createMutation.isPending}>
              Create Branch
            </Button>
          </>
        }
      >
        <form className="space-y-4">
          <FormField label="Branch Name" required>
            <Input {...addForm.register('name', { required: 'Required' })} placeholder="e.g. Main Campus" />
          </FormField>
          <FormField label="Branch Code" required>
            <Input {...addForm.register('code', { required: 'Required' })} placeholder="e.g. MAIN" />
          </FormField>
          <FormField label="Phone">
            <Input type="tel" {...addForm.register('phone')} />
          </FormField>
          <FormField label="Email">
            <Input type="email" {...addForm.register('email')} />
          </FormField>
          <FormField label="Address">
            <Input {...addForm.register('address')} />
          </FormField>
        </form>
      </Modal>

      {/* Edit Branch Modal */}
      <Modal
        open={!!editBranch}
        onClose={() => setEditBranch(null)}
        title={`Edit Branch — ${editBranch?.name ?? ''}`}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditBranch(null)}>Cancel</Button>
            <Button
              onClick={editForm.handleSubmit((d) => {
              if (editBranch) updateMutation.mutate({ id: editBranch.id, payload: d })
              })}
              isLoading={updateMutation.isPending}
            >
              Save Changes
            </Button>
          </>
        }
      >
        <form className="space-y-4">
          <FormField label="Branch Name" required>
            <Input {...editForm.register('name', { required: 'Required' })} />
          </FormField>
          <FormField label="Branch Code" required>
            <Input {...editForm.register('code', { required: 'Required' })} />
          </FormField>
          <FormField label="Phone">
            <Input type="tel" {...editForm.register('phone')} />
          </FormField>
          <FormField label="Email">
            <Input type="email" {...editForm.register('email')} />
          </FormField>
          <FormField label="Address">
            <Input {...editForm.register('address')} />
          </FormField>
        </form>
      </Modal>

      {/* Change Status Modal */}
      <Modal
        open={!!statusBranch}
        onClose={() => setStatusBranch(null)}
        title={`Change Status — ${statusBranch?.name ?? ''}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setStatusBranch(null)}>Cancel</Button>
            <Button
              onClick={statusForm.handleSubmit((d) => {
              if (statusBranch) statusMutation.mutate({ id: statusBranch.id, status: d.status })
              })}
              isLoading={statusMutation.isPending}
            >
              Update Status
            </Button>
          </>
        }
      >
        <FormField label="New Status" required>
          <Select options={BRANCH_STATUS_OPTIONS} placeholder="Select status" {...statusForm.register('status', { required: 'Required' })} />
        </FormField>
      </Modal>

      {/* Confirm Delete Modal */}
      <Modal
        open={!!deleteBranch}
        onClose={() => setDeleteBranch(null)}
        title="Deactivate Branch"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteBranch(null)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => { if (deleteBranch) deleteMutation.mutate(deleteBranch.id) }}
              isLoading={deleteMutation.isPending}
            >
              Deactivate
            </Button>
          </>
        }
      >
        <p className="text-sm text-gray-600">
          Are you sure you want to deactivate <strong>{deleteBranch?.name}</strong>? This action can be reversed by changing the branch status.
        </p>
      </Modal>
    </div>
  )
}
