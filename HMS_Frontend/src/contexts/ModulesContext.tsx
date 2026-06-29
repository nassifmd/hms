import React, { createContext, useContext, useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'

// ─── Module definitions ────────────────────────────────────────────────────────

export interface GatedModule {
  code: string
  label: string
  description: string
}

export const GATED_MODULES: GatedModule[] = [
  {
    code: 'CLINICAL',
    label: 'Clinical',
    description: 'Patient consultations, diagnoses, prescriptions and clinical notes',
  },
  {
    code: 'DENTAL',
    label: 'Dental',
    description: 'Dental procedures, treatment plans and dental records management',
  },
  {
    code: 'EYE',
    label: 'Eye Clinic',
    description: 'Ophthalmic examinations, visual acuity and eye prescriptions',
  },
  {
    code: 'LAB',
    label: 'Laboratory',
    description: 'Lab test requests, results management and specimen tracking',
  },
  {
    code: 'INSURANCE',
    label: 'Insurance',
    description: 'NHIS claims, insurance verification and pre-authorizations',
  },
]

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ModuleStatus {
  active: boolean
  days_remaining: number
  expires_at: string | null
  license_id?: string
  activated_at?: string
}

export interface ModulesStatusResponse {
  modules: Record<string, ModuleStatus>
}

interface ModulesContextValue {
  /** Status record keyed by module code */
  statuses: Record<string, ModuleStatus>
  isLoading: boolean
  /** Returns true if the module is active (returns true while loading to prevent flash) */
  isActive: (moduleCode: string) => boolean
  /** Invalidate and re-fetch module statuses */
  refresh: () => void
}

// ─── Context ───────────────────────────────────────────────────────────────────

const ModulesContext = createContext<ModulesContextValue | undefined>(undefined)

export function ModulesProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const { isAuthenticated } = useAuth()
  const qc = useQueryClient()

  const { data, isLoading } = useQuery<ModulesStatusResponse>({
    queryKey: ['modules', 'status'],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: ModulesStatusResponse }>('/modules/status')
      return res.data.data
    },
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,   // 5 minutes
    retry: false,
  })

  const statuses: Record<string, ModuleStatus> = data?.modules ?? {}

  // While loading, treat everything as active to avoid a flash of the lock screen
  const isActive = useCallback(
    (code: string): boolean => {
      if (isLoading) return true
      return statuses[code]?.active === true
    },
    [isLoading, statuses]
  )

  const refresh = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['modules', 'status'] })
  }, [qc])

  const contextValue = useMemo(
    () => ({ statuses, isLoading, isActive, refresh }),
    [statuses, isLoading, isActive, refresh]
  )

  return (
    <ModulesContext.Provider value={contextValue}>
      {children}
    </ModulesContext.Provider>
  )
}

export function useModules(): ModulesContextValue {
  const ctx = useContext(ModulesContext)
  if (!ctx) throw new Error('useModules must be used within ModulesProvider')
  return ctx
}

export default ModulesProvider
