'use client'

import { useEffect } from 'react'

export type ToastKind = 'success' | 'error' | 'info'
export interface ToastItem {
  id: number
  kind: ToastKind
  message: string
}

const STYLES: Record<ToastKind, { bg: string; border: string; icon: string }> = {
  success: { bg: 'bg-green-50',  border: 'border-green-200',  icon: '✅' },
  error:   { bg: 'bg-red-50',    border: 'border-red-200',    icon: '⚠️' },
  info:    { bg: 'bg-[#F0F4FF]', border: 'border-[#D6E2FF]',  icon: 'ℹ️' },
}

export function ToastStack({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: number) => void }) {
  return (
    <div className="fixed top-20 right-4 z-[300] flex flex-col gap-2 max-w-[calc(100vw-2rem)] md:max-w-sm pointer-events-none">
      {toasts.map(t => <ToastRow key={t.id} toast={t} onDismiss={onDismiss} />)}
    </div>
  )
}

function ToastRow({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: number) => void }) {
  const s = STYLES[toast.kind]
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), 3500)
    return () => clearTimeout(timer)
  }, [toast.id, onDismiss])
  return (
    <div
      className={`${s.bg} ${s.border} border rounded-2xl px-4 py-3 shadow-xl flex items-start gap-3 pointer-events-auto animate-toast-in`}
    >
      <span className="text-lg flex-shrink-0">{s.icon}</span>
      <p className="text-sm text-[#0A0B0D] font-semibold flex-1 leading-snug break-words">{toast.message}</p>
      <button
        onClick={() => onDismiss(toast.id)}
        className="text-[#8A919E] hover:text-[#0A0B0D] flex-shrink-0 text-sm font-bold leading-none px-1"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  )
}
