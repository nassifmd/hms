import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import type { User, LoginPayload, AuthResponse } from '@/types'
import api from '@/lib/api'
import toast from 'react-hot-toast'

interface AuthContextValue {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (payload: LoginPayload) => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get<{ success: boolean; data: { user: User } }>('/auth/me')
      setUser(data.data.user)
    } catch {
      setUser(null)
      localStorage.removeItem('accessToken')
      localStorage.removeItem('refreshToken')
    }
  }, [])

  // Try to restore session on mount
  useEffect(() => {
    const token = localStorage.getItem('accessToken')
    if (token) {
      refresh().finally(() => setIsLoading(false))
    } else {
      setIsLoading(false)
    }
  }, [refresh])

  const login = useCallback(async (payload: LoginPayload) => {
    const { data } = await api.post<{ success: boolean; data: AuthResponse }>('/auth/login', payload)
    const { user, accessToken, refreshToken } = data.data
    localStorage.setItem('accessToken', accessToken)
    localStorage.setItem('refreshToken', refreshToken)
    api.defaults.headers.common.Authorization = `Bearer ${accessToken}`
    setUser(user)
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout')
    } catch {
      // best-effort
    }
    localStorage.removeItem('accessToken')
    localStorage.removeItem('refreshToken')
    delete api.defaults.headers.common.Authorization
    setUser(null)
    toast.success('Logged out successfully')
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        logout,
        refresh,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
