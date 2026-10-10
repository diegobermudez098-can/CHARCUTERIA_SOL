import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { formatCOP } from '../lib/money'
import { errMsg, fmtDate, toInt } from '../lib/db'
import { useProfiles } from '../lib/hooks'
import { methodLabel, type Customer, type Debt, type DebtPayment, type Method, type Sale } from '../lib/types'
import { Alert, Btn, Empty, Field, Modal, PageTitle, inputCls } from '../components/ui'

function CustomerForm({ onDone, onClose }: { onDone: () => void; onClose: () => void }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  async function submit(e: FormEvent) {
    e.preventDefault()
    const { error } = await supabase.from('customers').insert({ name: name.trim(), phone: phone.trim() || null, notes: notes.trim() || null })
    if (error) return setError(errMsg(error))
    onDone()
  }
  return (
    <Modal title="Nuevo cliente" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Nombre"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required /></Field>
        <Field label="Teléfono (opcional)"><input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
        <Field label="Notas (opcional)"><input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        {error && <Alert>{error}</Alert>}
        <Btn className="w-full">Guardar</Btn>
      </form>
    </Modal>
  )
}

function CustomerDetail({ customer, onChanged, onClose }: { customer: Customer; onChanged: () => void; onClose: () => void }) {
  const [debts, setDebts] = useState<Debt[]>([])
  const [sales, setSales] = useState<Sale[]>([])
  const [payFor, setPayFor] = useState<Debt | null>(null)
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<Method>('cash')
  const [payKey, setPayKey] = useState(() => crypto.randomUUID())
  const [revFor, setRevFor] = useState<DebtPayment | null>(null)
  const [revReason, setRevReason] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const profiles = useProfiles()

  const load = useCallback(async () => {
    const [d, s] = await Promise.all([
      supabase.from('debts').select('*, sales(number), debt_payments(*)').eq('customer_id', customer.id).order('created_at', { ascending: false }),
      supabase.from('sales').select('*').eq('customer_id', customer.id).order('created_at', { ascending: false }).limit(30),
    ])
    setDebts((d.data ?? []) as Debt[])
    setSales((s.data ?? []) as Sale[])
  }, [customer.id])
  useEffect(() => { load() }, [load])

  const pending = debts.filter((d) => d.status === 'pending').reduce((s, d) => s + d.balance, 0)

  async function submitPay(e: FormEvent) {
    e.preventDefault()
    if (!payFor) return
    const a = toInt(amount)
    if (!Number.isInteger(a) || a <= 0) return setError('El abono debe ser un entero mayor que cero')
    if (a > payFor.balance) return setError(`El abono no puede superar el saldo (${formatCOP(payFor.balance)})`)
    setBusy(true); setError('')
    const { error } = await supabase.rpc('register_debt_payment', { p_debt_id: payFor.id, p_amount: a, p_method: method, p_key: payKey })
    setBusy(false)
    if (error) return setError(errMsg(error))
    setPayFor(null); setAmount(''); setPayKey(crypto.randomUUID())
    load(); onChanged()
  }

  async function submitRev(e: FormEvent) {
    e.preventDefault()
    if (!revFor) return
    setBusy(true); setError('')
    const { error } = await supabase.rpc('reverse_debt_payment', { p_payment_id: revFor.id, p_reason: revReason })
    setBusy(false)
    if (error) return setError(errMsg(error))
    setRevFor(null); setRevReason('')
    load(); onChanged()
  }

  return (
    <Modal title={customer.name} onClose={onClose}>
      <p className="text-sm text-gray-600">{customer.phone ?? 'Sin teléfono'}{customer.notes ? ` · ${customer.notes}` : ''}</p>
      <p className="text-lg font-bold">Saldo pendiente: {formatCOP(pending)}</p>

      <h4 className="font-semibold mt-2">Deudas</h4>
      {debts.length === 0 ? <Empty>Sin deudas registradas</Empty> : debts.map((d) => (
        <div key={d.id} className="border rounded-lg p-2 text-sm space-y-1">
          <div className="flex justify-between gap-2">
            <span>Venta #{d.sales?.number} · {fmtDate(d.created_at)}</span>
            <span>{d.status === 'pending' ? <b className="text-amber-700">Pendiente</b> : d.status === 'paid' ? <b className="text-green-700">Pagada</b> : 'Anulada'}</span>
          </div>
          <div>Original {formatCOP(d.original_amount)} · Saldo <b>{formatCOP(d.balance)}</b></div>
          {d.debt_payments.map((p) => (
            <div key={p.id} className={`text-xs ${p.reversed_at ? 'text-gray-400 line-through' : 'text-gray-600'}`}>
              Abono {formatCOP(p.amount)} · {methodLabel[p.method]} · {fmtDate(p.created_at)} · {profiles[p.user_id] ?? ''}
              {p.reversed_at && <span className="no-underline"> (revertido: {p.reverse_reason})</span>}
              {!p.reversed_at && d.status !== 'voided' && <button onClick={() => { setRevFor(p); setError('') }} className="ml-2 underline text-red-600">Revertir</button>}
            </div>
          ))}
          {d.status === 'pending' && <Btn variant="ghost" onClick={() => { setPayFor(d); setError('') }}>Registrar abono</Btn>}
        </div>
      ))}

      {payFor && (
        <form onSubmit={submitPay} className="border-2 border-sol-500 rounded-lg p-3 space-y-2">
          <p className="text-sm font-semibold">Abono a la venta #{payFor.sales?.number} (saldo {formatCOP(payFor.balance)})</p>
          <Field label="Valor del abono"><input inputMode="numeric" className={inputCls} value={amount} onChange={(e) => setAmount(e.target.value)} required /></Field>
          <Field label="Medio de pago">
            <select className={inputCls} value={method} onChange={(e) => setMethod(e.target.value as Method)}>
              <option value="cash">Efectivo</option><option value="transfer">Transferencia</option>
            </select>
          </Field>
          {error && <Alert>{error}</Alert>}
          <Btn disabled={busy} className="w-full">{busy ? 'Guardando…' : 'Guardar abono'}</Btn>
        </form>
      )}

      {revFor && (
        <form onSubmit={submitRev} className="border-2 border-red-400 rounded-lg p-3 space-y-2">
          <p className="text-sm font-semibold">Revertir abono de {formatCOP(revFor.amount)}</p>
          <Field label="Motivo (obligatorio)"><input className={inputCls} value={revReason} onChange={(e) => setRevReason(e.target.value)} required minLength={3} /></Field>
          {error && <Alert>{error}</Alert>}
          <Btn variant="danger" disabled={busy} className="w-full">{busy ? 'Guardando…' : 'Confirmar reversión'}</Btn>
        </form>
      )}

      <h4 className="font-semibold mt-2">Historial de compras</h4>
      {sales.length === 0 ? <Empty>Sin compras</Empty> : (
        <ul className="text-sm divide-y">
          {sales.map((s) => (
            <li key={s.id} className="py-1 flex justify-between"><span>#{s.number} · {fmtDate(s.created_at)}{s.status === 'voided' ? ' · anulada' : ''}</span><span>{formatCOP(s.total)}</span></li>
          ))}
        </ul>
      )}
    </Modal>
  )
}

export default function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [balances, setBalances] = useState<Record<string, number>>({})
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [selected, setSelected] = useState<Customer | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const [c, d] = await Promise.all([
      supabase.from('customers').select('*').order('name'),
      supabase.from('debts').select('customer_id, balance').eq('status', 'pending'),
    ])
    if (c.error) setError(errMsg(c.error))
    const b: Record<string, number> = {}
    for (const r of (d.data ?? []) as { customer_id: string; balance: number }[]) b[r.customer_id] = (b[r.customer_id] ?? 0) + r.balance
    setBalances(b)
    setCustomers((c.data ?? []) as Customer[])
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const shown = customers.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()) || (c.phone ?? '').includes(search))
  const totalPending = Object.values(balances).reduce((a, b) => a + b, 0)

  return (
    <>
      <PageTitle right={<Btn onClick={() => setCreating(true)}>+ Nuevo cliente</Btn>}>Clientes y fiados</PageTitle>
      <div className="flex flex-wrap gap-3 items-center mb-3">
        <input placeholder="Buscar cliente…" value={search} onChange={(e) => setSearch(e.target.value)} className="border rounded-lg px-3 py-2 text-sm bg-white" />
        <p className="text-sm ml-auto">Total por cobrar: <b>{formatCOP(totalPending)}</b></p>
      </div>
      {error && <Alert>{error}</Alert>}
      {loading ? <p>Cargando…</p> : shown.length === 0 ? <Empty>No hay clientes</Empty> : (
        <ul className="bg-white rounded-xl border divide-y">
          {shown.map((c) => (
            <li key={c.id}>
              <button onClick={() => setSelected(c)} className="w-full text-left p-3 flex justify-between gap-2 hover:bg-sol-50 text-sm">
                <span>{c.name}<br /><span className="text-xs text-gray-500">{c.phone ?? 'Sin teléfono'}</span></span>
                <b className={balances[c.id] ? 'text-amber-700' : 'text-gray-400'}>{formatCOP(balances[c.id] ?? 0)}</b>
              </button>
            </li>
          ))}
        </ul>
      )}
      {creating && <CustomerForm onDone={() => { setCreating(false); load() }} onClose={() => setCreating(false)} />}
      {selected && <CustomerDetail customer={selected} onChanged={load} onClose={() => setSelected(null)} />}
    </>
  )
}
