import { Navigate } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import Button from '@/components/ui/Button'
import { useNavigate } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
      <div className="text-center max-w-sm">
        <div className="text-8xl font-bold text-gray-200 mb-4">404</div>
        <h1 className="text-xl font-semibold text-gray-800 mb-2">Page Not Found</h1>
        <p className="text-gray-500 text-sm mb-6">The page you're looking for doesn't exist.</p>
        <Button onClick={() => history.back()} variant="secondary">Go Back</Button>
      </div>
    </div>
  )
}

export function UnauthorizedPage() {
  const navigate = useNavigate()
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center p-4">
      <div className="text-center max-w-sm">
        <ShieldAlert className="w-14 h-14 text-red-300 mx-auto mb-4" />
        <h1 className="text-xl font-semibold text-gray-800 mb-2">Access Denied</h1>
        <p className="text-gray-500 text-sm mb-6">You don't have permission to access this page.</p>
        <Button onClick={() => navigate('/dashboard')} variant="secondary">Back to Dashboard</Button>
      </div>
    </div>
  )
}
