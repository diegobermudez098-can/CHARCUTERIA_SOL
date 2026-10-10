import { useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react'

export const inputCls = 'mt-1 w-full border-2 border-gray-300 rounded-xl px-4 py-3 text-lg bg-white focus:border-sol-700'

export function Btn({ variant = 'primary', className = '', ...p }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' | 'good' }) {
  const styles = {
    primary: 'bg-sol-700 hover:bg-sol-900 text-white border-transparent',
    good: 'bg-green-700 hover:bg-green-800 text-white border-transparent',
    ghost: 'border-gray-300 bg-white hover:bg-gray-50 text-gray-900',
    danger: 'bg-red-700 hover:bg-red-800 text-white border-transparent',
  }[variant]
  return <button {...p} className={`rounded-xl border-2 px-5 py-3 text-lg font-bold disabled:opacity-50 ${styles} ${className}`} />
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block text-base font-semibold text-gray-900">
      {label}
      {hint && <span className="block text-sm font-normal text-gray-600">{hint}</span>}
      {children}
    </label>
  )
}

export function Alert({ kind = 'error', children }: { kind?: 'error' | 'ok' | 'info'; children: ReactNode }) {
  const c = {
    error: 'bg-red-50 text-red-800 border-red-600',
    ok: 'bg-green-50 text-green-800 border-green-600',
    info: 'bg-amber-50 text-amber-900 border-amber-500',
  }[kind]
  return <p role={kind === 'error' ? 'alert' : 'status'} className={`rounded-xl border-l-8 px-4 py-3 text-base font-medium ${c}`}>{children}</p>
}

export function PageTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
      <h2 className="text-3xl font-extrabold text-sol-900">{children}</h2>{right}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-center text-gray-600 py-10 text-lg">{children}</p>
}

/** Botones grandes para elegir una opción (en vez de listas desplegables). */
export function Choice<T extends string>({ value, onChange, options, cols = 2, disabled = false }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: string; icon?: string }[]
  cols?: 2 | 3; disabled?: boolean
}) {
  return (
    <div role="radiogroup" className={`grid gap-2 mt-1 ${cols === 3 ? 'grid-cols-3' : 'grid-cols-2'} ${disabled ? 'opacity-60' : ''}`}>
      {options.map((o) => {
        const on = o.value === value
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} disabled={disabled} onClick={() => onChange(o.value)}
            className={`rounded-xl border-2 px-3 py-3 text-lg font-bold flex flex-col items-center gap-1 ${on ? 'border-sol-700 bg-sol-100 text-sol-900 ring-2 ring-sol-700' : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-50'}`}>
            {o.icon && <span aria-hidden="true" className="text-2xl">{o.icon}</span>}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="bg-white w-full sm:max-w-xl max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-extrabold text-2xl">{title}</h3>
          <button onClick={onClose} aria-label="Cerrar" className="text-3xl leading-none px-3 py-1 rounded-xl border-2 border-gray-300 hover:bg-gray-100">×</button>
        </div>
        {children}
      </div>
    </div>
  )
}
