import { NavLink, Outlet } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const links: [string, string][] = [
  ['/', 'Vender'], ['/pedidos', 'Pedidos'], ['/historial', 'Ventas'], ['/productos', 'Productos'],
  ['/clientes', 'Clientes'], ['/caja', 'Caja'], ['/gastos', 'Gastos'], ['/reportes', 'Reportes'],
  ['/auditoria', 'Historial'], ['/ajustes', 'Ajustes'],
]

export default function Layout() {
  return (
    <div className="min-h-screen bg-sol-50">
      <header className="bg-white border-b sticky top-0 z-40 print:hidden">
        <div className="max-w-6xl mx-auto px-4 py-2 flex items-center gap-4">
          <h1 className="text-2xl font-bold text-sol-700">SOL</h1>
          <nav className="flex gap-1 overflow-x-auto flex-1" aria-label="Principal">
            {links.map(([to, label]) => (
              <NavLink key={to} to={to} end={to === '/'}
                className={({ isActive }) => `px-3 py-1.5 rounded-lg text-sm whitespace-nowrap ${isActive ? 'bg-sol-600 text-white' : 'hover:bg-sol-100'}`}>
                {label}
              </NavLink>
            ))}
          </nav>
          <a href="/tienda" target="_blank" rel="noreferrer" className="text-sm underline whitespace-nowrap">Ver tienda</a>
          <button onClick={() => supabase.auth.signOut()} className="text-sm underline whitespace-nowrap">Salir</button>
        </div>
      </header>
      <main className="max-w-6xl mx-auto p-4"><Outlet /></main>
    </div>
  )
}
