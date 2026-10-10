import { useEffect, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Navigate, Route, Routes } from 'react-router-dom'
import { supabase } from './lib/supabase'
import Layout from './components/Layout'
import { Alert, Btn, Field, inputCls } from './components/ui'
import { BUSINESS_NAME } from './lib/brand'
import Sales from './pages/Sales'
import SalesHistory from './pages/SalesHistory'
import Products from './pages/Products'
import Customers from './pages/Customers'
import Debts from './pages/Debts'
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
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) setError('El correo o la contraseña no coinciden. Revisa que el correo esté bien escrito y sin espacios.')
    setLoading(false)
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-sol-50 p-4">
      <form onSubmit={onSubmit} className="w-full max-w-md bg-white rounded-3xl shadow p-8 space-y-5">
        <h1 className="text-4xl font-extrabold text-sol-700 leading-tight">{BUSINESS_NAME}</h1>
        <p className="text-lg text-gray-700">Escribe tu correo y tu contraseña para entrar.</p>
        <Field label="Correo">
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            autoComplete="username" autoCapitalize="none" spellCheck={false} className={inputCls} />
        </Field>
        <div>
          <Field label="Contraseña">
            <input type={show ? 'text' : 'password'} required value={password} onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password" className={inputCls} />
          </Field>
          <button type="button" onClick={() => setShow(!show)} className="mt-2 text-base font-semibold underline text-sol-900">
            {show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          </button>
        </div>
        {error && <Alert>{error}</Alert>}
        <Btn variant="good" disabled={loading} className="w-full py-4 text-xl">{loading ? 'Entrando…' : 'Entrar'}</Btn>
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

  if (!ready) return <p className="p-6 text-xl">Cargando…</p>

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
        <Route path="/deudas" element={<Debts />} />
        <Route path="/gastos" element={<Expenses />} />
        <Route path="/reportes" element={<Reports />} />
        <Route path="/auditoria" element={<Audit />} />
        <Route path="/ajustes" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
