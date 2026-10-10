import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Btn } from './ui'
import { BUSINESS_NAME } from '../lib/brand'

// Lo que se usa todos los días va siempre a la vista; lo demás está en "Más".
const main: [string, string, string][] = [
  ['/', '🛒', 'Vender'], ['/productos', '📦', 'Productos'], ['/clientes', '👥', 'Clientes'], ['/deudas', '📒', 'Quién me debe'],
]
const more: [string, string][] = [
  ['/gastos', 'Gastos'], ['/pedidos', 'Pedidos'], ['/historial', 'Ventas hechas'],
  ['/reportes', 'Reportes'], ['/auditoria', 'Registro de cambios'], ['/ajustes', 'Ajustes'],
]

export default function Layout() {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  const inMore = more.some(([to]) => pathname.startsWith(to))
  const tab = 'rounded-xl px-2 py-2 text-base font-bold flex flex-col items-center gap-0.5 border-2'

  return (
    <div className="min-h-screen bg-sol-50">
      <header className="bg-white border-b-2 sm:sticky top-0 z-40 print:hidden">
        <div className="max-w-6xl mx-auto px-4 py-3 space-y-3">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-sol-700 leading-tight">{BUSINESS_NAME}</h1>
            <Btn variant="ghost" onClick={() => supabase.auth.signOut()}>Salir</Btn>
          </div>
          <nav className="grid grid-cols-3 sm:grid-cols-5 gap-2" aria-label="Principal">
            {main.map(([to, icon, label]) => (
              <NavLink key={to} to={to} end={to === '/'} onClick={() => setOpen(false)}
                className={({ isActive }) => `${tab} ${isActive ? 'bg-sol-700 text-white border-sol-700' : 'bg-sol-100 text-sol-900 border-transparent hover:border-sol-700'}`}>
                <span aria-hidden="true" className="text-2xl">{icon}</span>{label}
              </NavLink>
            ))}
            <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}
              className={`${tab} ${open || inMore ? 'bg-sol-700 text-white border-sol-700' : 'bg-sol-100 text-sol-900 border-transparent hover:border-sol-700'}`}>
              <span aria-hidden="true" className="text-2xl">☰</span>Más
            </button>
          </nav>
          {open && (
            <nav className="grid grid-cols-2 sm:grid-cols-3 gap-2" aria-label="Más opciones">
              {more.map(([to, label]) => (
                <NavLink key={to} to={to} onClick={() => setOpen(false)}
                  className={({ isActive }) => `rounded-xl border-2 px-4 py-3 text-lg font-semibold ${isActive ? 'border-sol-700 bg-sol-100' : 'border-gray-300 hover:bg-gray-50'}`}>
                  {label}
                </NavLink>
              ))}
              <a href="/tienda" target="_blank" rel="noreferrer" className="rounded-xl border-2 border-gray-300 hover:bg-gray-50 px-4 py-3 text-lg font-semibold">Ver tienda ↗</a>
            </nav>
          )}
        </div>
      </header>
      <main className="max-w-6xl mx-auto p-4"><Outlet /></main>
    </div>
  )
}
