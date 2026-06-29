import React, { useState } from 'react'
import { Lock, AlertTriangle } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { useModules, GATED_MODULES } from '@/contexts/ModulesContext'
import { useAuth } from '@/contexts/AuthContext'
import { api } from '@/lib/api'

interface ModuleGateProps {
  /** Module code — one of CLINICAL, DENTAL, EYE, LAB, INSURANCE */
  module: string
  children: React.ReactNode
}

interface ActivatePayload {
  module_code: string
  license_key: string
}

export function ModuleGate({ module: moduleCode, children }: Readonly<ModuleGateProps>) {
  const { isActive, statuses } = useModules()
  const { user } = useAuth()
  const qc = useQueryClient()
  const [licenseKey, setLicenseKey] = useState('')
  const [showForm, setShowForm] = useState(false)

  const isSysAdmin =
    user?.role === 'SYS_ADMIN' ||
    user?.roles?.some((r) => r.code === 'SYS_ADMIN')

  const moduleInfo = GATED_MODULES.find((m) => m.code === moduleCode)
  const status = statuses[moduleCode]
  const daysLeft = status?.days_remaining ?? 0

  const activateMutation = useMutation({
    mutationFn: (payload: ActivatePayload) => api.post('/admin/modules/activate', payload),
    onSuccess: () => {
      toast.success(`${moduleInfo?.label ?? moduleCode} module activated!`)
      qc.invalidateQueries({ queryKey: ['modules', 'status'] })
      setLicenseKey('')
      setShowForm(false)
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })
          ?.response?.data?.error?.message ?? 'Invalid license key'
      toast.error(msg)
    },
  })

  // ── Active module: check expiry warning then render children ──────────────────
  if (isActive(moduleCode)) {
    const showWarning = status?.active && daysLeft > 0 && daysLeft <= 30

    return (
      <>
        {showWarning && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              Your <strong>{moduleInfo?.label ?? moduleCode}</strong> module license expires in{' '}
              <strong>{daysLeft} day{daysLeft === 1 ? '' : 's'}</strong>. Contact your system
              administrator to renew.
            </span>
          </div>
        )}
        {children}
      </>
    )
  }

  // ── Locked state ──────────────────────────────────────────────────────────────
  return (
    <div className="flex items-center justify-center min-h-[60vh] p-8">
      <div className="max-w-md w-full text-center space-y-6">
        {/* Lock icon */}
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gray-100 mx-auto">
          <Lock className="w-10 h-10 text-gray-400" />
        </div>

        {/* Module name & description */}
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">
            {moduleInfo?.label ?? moduleCode} Module
          </h2>
          <p className="mt-2 text-gray-500">
            {moduleInfo?.description ?? `The ${moduleCode} module requires a paid license.`}
          </p>
        </div>

        {/* Activation card */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-4">
          {isSysAdmin ? (
            <>
              <p className="text-sm text-gray-600">
                Enter a valid license key to activate this module for your facility.
              </p>

              {showForm ? (
                <div className="space-y-3 text-left">
                  <label htmlFor="license-key-input" className="block text-sm font-medium text-gray-700">
                    License Key
                  </label>
                  <input
                    id="license-key-input"
                    type="text"
                    value={licenseKey}
                    onChange={(e) => setLicenseKey(e.target.value)}
                    placeholder="HMS-CLINICAL-..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                    spellCheck={false}
                    autoComplete="off"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() =>
                        activateMutation.mutate({ module_code: moduleCode, license_key: licenseKey.trim() })
                      }
                      disabled={!licenseKey.trim() || activateMutation.isPending}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors"
                    >
                      {activateMutation.isPending ? 'Activating…' : 'Activate Module'}
                    </button>
                    <button
                      onClick={() => { setShowForm(false); setLicenseKey('') }}
                      className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowForm(true)}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors"
                >
                  Enter License Key
                </button>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-600">
              This module requires a paid license.{' '}
              <strong>Contact your system administrator</strong> to activate it.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export default ModuleGate
