import { useEffect, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Navigate, Route, Routes } from 'react-router-dom'
import { supabase } from './lib/supabase'
import Layout from './components/Layout'
import Sales from './pages/Sales'
import SalesHistory from './pages/SalesHistory'
import Products from './pages/Products'
import Customers from './pages/Customers'
import Cash from './pages/Cash'
import Expenses from './pages/Expenses'
import Orders from './pages/Orders'
import Reports from './pages/Reports'
import Audit from './pages/Audit'
import Settings from './pages/Settings'
import Store from './pages/Store'
import OrderStatus from './pages/OrderStatus'

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError('Correo o contraseña incorrectos')
    setLoading(false)
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-sol-50 p-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm bg-white rounded-2xl shadow p-6 space-y-4">
        <h1 className="text-3xl font-bold text-sol-700">SOL</h1>
        <p className="text-sm text-gray-600">Ingresa con tu cuenta del negocio</p>
        <label className="block text-sm font-medium">
          Correo
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full border rounded-lg px-3 py-2" />
        </label>
        <label className="block text-sm font-medium">
          Contraseña
          <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full border rounded-lg px-3 py-2" />
        </label>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <button disabled={loading} className="w-full bg-sol-600 hover:bg-sol-700 text-white rounded-lg py-2 font-semibold disabled:opacity-60">
          {loading ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
    </main>
  )
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  if (!ready) return <p className="p-6">Cargando…</p>

  return (
    <Routes>
      {/* Públicas: no requieren cuenta */}
      <Route path="/tienda" element={<Store />} />
      <Route path="/pedido/:token" element={<OrderStatus />} />
      <Route path="/ingresar" element={session ? <Navigate to="/" replace /> : <Login />} />
      {/* Internas: requieren sesión */}
      <Route element={session ? <Layout /> : <Navigate to="/ingresar" replace />}>
        <Route path="/" element={<Sales />} />
        <Route path="/pedidos" element={<Orders />} />
        <Route path="/historial" element={<SalesHistory />} />
        <Route path="/productos" element={<Products />} />
        <Route path="/clientes" element={<Customers />} />
        <Route path="/caja" element={<Cash />} />
        <Route path="/gastos" element={<Expenses />} />
        <Route path="/reportes" element={<Reports />} />
        <Route path="/auditoria" element={<Audit />} />
        <Route path="/ajustes" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
