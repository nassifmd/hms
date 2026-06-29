import { Loader2 } from 'lucide-react'

export default function LoadingScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
      <Loader2 className="w-10 h-10 text-primary-600 animate-spin" />
      <p className="mt-3 text-sm text-gray-500">Loading…</p>
    </div>
  )
}
