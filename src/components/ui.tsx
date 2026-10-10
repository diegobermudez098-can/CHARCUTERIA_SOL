import type { ButtonHTMLAttributes, ReactNode } from 'react'

export const inputCls = 'mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-white'

export function Btn({ variant = 'primary', className = '', ...p }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' }) {
  const styles = {
    primary: 'bg-sol-600 hover:bg-sol-700 text-white',
    ghost: 'border bg-white hover:bg-gray-50',
    danger: 'bg-red-600 hover:bg-red-700 text-white',
  }[variant]
  return <button {...p} className={`rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50 ${styles} ${className}`} />
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-sm font-medium">{label}{children}</label>
}

export function Alert({ kind = 'error', children }: { kind?: 'error' | 'ok' | 'info'; children: ReactNode }) {
  const c = { error: 'bg-red-50 text-red-700', ok: 'bg-green-50 text-green-700', info: 'bg-amber-50 text-amber-800' }[kind]
  return <p role={kind === 'error' ? 'alert' : 'status'} className={`rounded-lg px-3 py-2 text-sm ${c}`}>{children}</p>
}

export function PageTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
      <h2 className="text-xl font-bold text-sol-900">{children}</h2>{right}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-center text-gray-500 py-8 text-sm">{children}</p>
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="bg-white w-full sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-lg">{title}</h3>
          <button onClick={onClose} aria-label="Cerrar" className="text-2xl leading-none px-2">×</button>
        </div>
        {children}
      </div>
    </div>
  )
}
