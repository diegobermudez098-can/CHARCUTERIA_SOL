import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { formatCOP, parseCOP } from '../lib/money'
import { errMsg, fmtDate } from '../lib/db'
import { useProfiles } from '../lib/hooks'
import { methodLabel, type Customer, type Debt, type DebtPayment, type Method, type Sale } from '../lib/types'
import { Alert, Btn, Choice, Empty, Field, Modal, PageTitle, inputCls } from '../components/ui'

const NEEDS_SQL = 'No se pudo guardar el cambio. Falta ejecutar el script de clientes en Supabase (supabase-clientes.sql).'

function CustomerForm({ customer, onDone, onClose }: { customer: Customer | null; onDone: () => void; onClose: () => void }) {
  const [name, setName] = useState(customer?.name ?? '')
  const [phone, setPhone] = useState(customer?.phone ?? '')
  const [notes, setNotes] = useState(customer?.notes ?? '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!name.trim()) return setError('Escribe el nombre del cliente')
    const data = { name: name.trim(), phone: phone.trim() || null, notes: notes.trim() || null }
    setBusy(true)
    if (customer) {
      const { data: rows, error } = await supabase.from('customers').update(data).eq('id', customer.id).select('id')
      setBusy(false)
      if (error) return setError(errMsg(error))
      if (!rows || rows.length === 0) return setError(NEEDS_SQL)
    } else {
      const { error } = await supabase.from('customers').insert(data)
      setBusy(false)
      if (error) return setError(errMsg(error))
    }
    onDone()
  }

  return (
    <Modal title={customer ? 'Editar cliente' : 'Nuevo cliente'} onClose={onClose}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <Field label="Nombre"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Teléfono (opcional)" hint="Con este número puedes recordarle por WhatsApp lo que debe">
          <input inputMode="tel" className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label="Notas (opcional)"><input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        {error && <Alert>{error}</Alert>}
        <div className="grid grid-cols-2 gap-3">
          <Btn type="button" variant="ghost" onClick={onClose}>Cancelar</Btn>
          <Btn variant="good" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</Btn>
        </div>
      </form>
    </Modal>
  )
}

export function CustomerDetail({ customer, onChanged, onClose }: { customer: Customer; onChanged: () => void; onClose: () => void }) {
  const [debts, setDebts] = useState<Debt[]>([])
  const [sales, setSales] = useState<Sale[]>([])
  const [loaded, setLoaded] = useState(false)
  const [editing, setEditing] = useState(false)
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
    setLoaded(true)
  }, [customer.id])
  useEffect(() => { load() }, [load])

  const pending = debts.filter((d) => d.status === 'pending').reduce((s, d) => s + d.balance, 0)

  async function submitPay(e: FormEvent) {
    e.preventDefault()
    if (!payFor) return
    const a = parseCOP(amount)
    if (!Number.isInteger(a) || a <= 0) return setError('Escribe cuánto abona, solo con números. Ejemplo: 20000')
    if (a > payFor.balance) return setError(`El abono no puede ser mayor que lo que debe (${formatCOP(payFor.balance)})`)
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

  async function remove() {
    setError('')
    if (!loaded) return
    if (pending > 0) return setError(`Todavía debe ${formatCOP(pending)}. Primero registra sus abonos y luego puedes eliminarlo.`)
    const hasHistory = debts.length > 0 || sales.length > 0
    const ask = hasHistory
      ? `“${customer.name}” tiene compras anotadas. Se va a ocultar de las listas, pero sus ventas quedan guardadas. ¿Continuar?`
      : `¿Eliminar a “${customer.name}”? Esto no se puede deshacer.`
    if (!window.confirm(ask)) return
    setBusy(true)
    const res = hasHistory
      ? await supabase.from('customers').update({ active: false }).eq('id', customer.id).select('id')
      : await supabase.from('customers').delete().eq('id', customer.id).select('id')
    setBusy(false)
    if (res.error) return setError(hasHistory || /policy|permission|row-level/i.test(res.error.message) ? NEEDS_SQL : errMsg(res.error))
    if (!res.data || res.data.length === 0) return setError(NEEDS_SQL)
    onChanged(); onClose()
  }

  return (
    <Modal title={customer.name} onClose={onClose}>
      <p className="text-base text-gray-700">{customer.phone ?? 'Sin teléfono'}{customer.notes ? ` · ${customer.notes}` : ''}</p>
      <p className="text-2xl font-extrabold">Debe: <span className={pending > 0 ? 'text-amber-800' : 'text-green-700'}>{formatCOP(pending)}</span></p>
      <div className="grid grid-cols-2 gap-3">
        <Btn variant="ghost" onClick={() => setEditing(true)}>✏️ Editar datos</Btn>
        <Btn variant="ghost" disabled={busy || !loaded} onClick={remove}>🗑️ Eliminar</Btn>
      </div>
      {error && !payFor && !revFor && <Alert>{error}</Alert>}

      <h4 className="text-xl font-bold mt-2">Lo que debe</h4>
      {debts.length === 0 ? <Empty>No tiene deudas</Empty> : debts.map((d) => (
        <div key={d.id} className="border-2 border-gray-200 rounded-xl p-3 text-base space-y-2">
          <div className="flex justify-between gap-2">
            <span>Venta #{d.sales?.number} · {fmtDate(d.created_at)}</span>
            <span>{d.status === 'pending' ? <b className="text-amber-800">Pendiente</b> : d.status === 'paid' ? <b className="text-green-700">Pagada</b> : 'Anulada'}</span>
          </div>
          <div>Fiado {formatCOP(d.original_amount)} · Falta <b>{formatCOP(d.balance)}</b></div>
          {d.debt_payments.map((p) => (
            <div key={p.id} className={`text-sm ${p.reversed_at ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
              Abonó {formatCOP(p.amount)} · {methodLabel[p.method]} · {fmtDate(p.created_at)} · {profiles[p.user_id] ?? ''}
              {p.reversed_at && <span className="no-underline"> (revertido: {p.reverse_reason})</span>}
              {!p.reversed_at && d.status !== 'voided' && <button onClick={() => { setRevFor(p); setError('') }} className="ml-2 underline text-red-700">Deshacer abono</button>}
            </div>
          ))}
          {d.status === 'pending' && <Btn variant="primary" onClick={() => { setPayFor(d); setError('') }}>Registrar abono</Btn>}
        </div>
      ))}

      {payFor && (
        <form onSubmit={submitPay} noValidate className="border-2 border-sol-700 rounded-xl p-4 space-y-3">
          <p className="text-lg font-bold">Abono a la venta #{payFor.sales?.number} (falta {formatCOP(payFor.balance)})</p>
          <Field label="¿Cuánto abona?"><input inputMode="numeric" className={inputCls} value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <div>
            <p className="text-base font-semibold">¿Cómo pagó?</p>
            <Choice<Method> value={method} onChange={setMethod} options={[{ value: 'cash', label: 'Efectivo', icon: '💵' }, { value: 'transfer', label: 'Transferencia', icon: '📱' }]} />
          </div>
          {error && <Alert>{error}</Alert>}
          <div className="grid grid-cols-2 gap-3">
            <Btn type="button" variant="ghost" onClick={() => { setPayFor(null); setError('') }}>Cancelar</Btn>
            <Btn variant="good" disabled={busy}>{busy ? 'Guardando…' : 'Guardar abono'}</Btn>
          </div>
        </form>
      )}

      {revFor && (
        <form onSubmit={submitRev} className="border-2 border-red-400 rounded-xl p-4 space-y-3">
          <p className="text-lg font-bold">Deshacer el abono de {formatCOP(revFor.amount)}</p>
          <Field label="¿Por qué? (obligatorio)"><input className={inputCls} value={revReason} onChange={(e) => setRevReason(e.target.value)} required minLength={3} /></Field>
          {error && <Alert>{error}</Alert>}
          <div className="grid grid-cols-2 gap-3">
            <Btn type="button" variant="ghost" onClick={() => { setRevFor(null); setError('') }}>Cancelar</Btn>
            <Btn variant="danger" disabled={busy}>{busy ? 'Guardando…' : 'Deshacer abono'}</Btn>
          </div>
        </form>
      )}

      <h4 className="text-xl font-bold mt-2">Compras</h4>
      {sales.length === 0 ? <Empty>Todavía no ha comprado</Empty> : (
        <ul className="text-base divide-y">
          {sales.map((s) => (
            <li key={s.id} className="py-2 flex justify-between"><span>#{s.number} · {fmtDate(s.created_at)}{s.status === 'voided' ? ' · anulada' : ''}</span><b>{formatCOP(s.total)}</b></li>
          ))}
        </ul>
      )}
      {editing && <CustomerForm customer={customer} onDone={() => { setEditing(false); onChanged(); onClose() }} onClose={() => setEditing(false)} />}
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
    setCustomers(((c.data ?? []) as Customer[]).filter((x) => x.active !== false))
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const shown = customers.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()) || (c.phone ?? '').includes(search))

  return (
    <>
      <PageTitle right={<Btn variant="good" onClick={() => setCreating(true)}>+ Nuevo cliente</Btn>}>Clientes</PageTitle>
      <div className="space-y-3 mb-4">
        <input aria-label="Buscar cliente" placeholder="🔍 Buscar cliente por nombre o teléfono…" value={search} onChange={(e) => setSearch(e.target.value)} className={`${inputCls} mt-0`} />
        {!loading && <p className="text-base text-gray-700">{customers.length === 1 ? '1 cliente' : `${customers.length} clientes`}{search ? ` · ${shown.length} encontrados` : ''}</p>}
      </div>
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}
      {loading ? <Empty>Cargando…</Empty> : shown.length === 0 ? (
        <Empty>{customers.length === 0 ? 'Todavía no hay clientes. Toca “Nuevo cliente” para agregar el primero.' : 'No encontré ese cliente'}</Empty>
      ) : (
        <ul className="bg-white rounded-2xl border-2 border-gray-200 divide-y-2 divide-gray-100 overflow-hidden">
          {shown.map((c) => (
            <li key={c.id}>
              <button onClick={() => setSelected(c)} className="w-full text-left px-4 py-4 flex justify-between items-center gap-3 hover:bg-sol-50">
                <span className="text-xl font-bold">{c.name}<br /><span className="text-base font-normal text-gray-600">{c.phone ?? 'Sin teléfono'}</span></span>
                {balances[c.id] ? <span className="text-right text-lg font-extrabold text-amber-800">Debe<br />{formatCOP(balances[c.id])}</span> : <span className="text-base text-gray-500">Al día</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {creating && <CustomerForm customer={null} onDone={() => { setCreating(false); load() }} onClose={() => setCreating(false)} />}
      {selected && <CustomerDetail customer={selected} onChanged={load} onClose={() => setSelected(null)} />}
    </>
  )
}
