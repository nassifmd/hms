import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, parseISO, formatDistanceToNow } from 'date-fns'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | Date, fmt = 'dd MMM yyyy') {
  if (!date) return '—'
  try {
    const d = typeof date === 'string' ? parseISO(date) : date
    return format(d, fmt)
  } catch {
    return '—'
  }
}

export function formatDateTime(date: string | Date) {
  return formatDate(date, 'dd MMM yyyy, h:mm a')
}

export function timeAgo(date: string | Date) {
  if (!date) return '—'
  try {
    const d = typeof date === 'string' ? parseISO(date) : date
    return formatDistanceToNow(d, { addSuffix: true })
  } catch {
    return '—'
  }
}

export function formatCurrency(amount: number, currency = 'GHS') {
  return new Intl.NumberFormat('en-GH', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount ?? 0)
}

export function formatNumber(n: number) {
  return new Intl.NumberFormat('en-GH').format(n ?? 0)
}

export function calcAge(dob: string) {
  if (!dob) return '—'
  const birth = new Date(dob)
  const diff = Date.now() - birth.getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25))
}

export function getInitials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export function statusColor(status: string): string {
  const map: Record<string, string> = {
    active: 'badge-green',
    completed: 'badge-green',
    paid: 'badge-green',
    'in stock': 'badge-green',
    dispensed: 'badge-green',
    scheduled: 'badge-blue',
    confirmed: 'badge-blue',
    pending: 'badge-yellow',
    processing: 'badge-yellow',
    'partially paid': 'badge-yellow',
    'low stock': 'badge-yellow',
    cancelled: 'badge-red',
    voided: 'badge-red',
    'out of stock': 'badge-red',
    expired: 'badge-red',
    'no-show': 'badge-gray',
    inactive: 'badge-gray',
  }
  return map[status?.toLowerCase()] ?? 'badge-gray'
}
