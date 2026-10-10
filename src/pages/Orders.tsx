import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { formatCOP, formatQuantity } from '../lib/money'
import { errMsg, fmtDate, toInt } from '../lib/db'
import { paymentsPayload, validatePayments } from '../lib/sales'
import { orderStatusLabel, type Customer, type Order, type OrderStatus } from '../lib/types'
import { Alert, Btn, Empty, Field, Modal, PageTitle, inputCls } from '../components/ui'

const flow: OrderStatus[] = ['received', 'confirmed', 'preparing', 'ready']

function Convert({ order, onDone, onClose }: { order: Order; onDone: () => void; onClose: () => void }) {
  const [total, setTotal] = useState<number | null>(null)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [customerId, setCustomerId] = useState('')
  const [pay, setPay] = useState({ cash: '', transfer: '', credit: '' })
  const [key] = useState(() => crypto.randomUUID())
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase.rpc('order_current_total', { p_order_id: order.id }).then(({ data }) => setTotal(Number(data ?? 0)))
    supabase.from('customers').select('*').order('name').then(({ data }) => setCustomers((data ?? []) as Customer[]))
  }, [order.id])

  const nums = { cash: toInt(pay.cash || '0'), transfer: toInt(pay.transfer || '0'), credit: toInt(pay.credit || '0') }
  const payError = total === null ? null : validatePayments(total, nums, customerId !== '')
  const quick = (f: 'cash' | 'transfer' | 'credit') => setPay({ cash: '', transfer: '', credit: '', [f]: String(total ?? 0) })

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setError('')
    const { error } = await supabase.rpc('convert_order_to_sale', {
      p_order_id: order.id, p_payments: paymentsPayload(nums), p_customer_id: customerId || null, p_key: key,
    })
    setBusy(false)
    if (error) return setError(errMsg(error))
    onDone()
  }

  return (
    <Modal title={`Cobrar pedido #${order.number}`} onClose={onClose}>
      {total === null ? <p className="text-sm">Calculando…</p> : (
        <form onSubmit={submit} className="space-y-3">
          <p className="text-sm">Total con precios actuales: <b className="text-lg">{formatCOP(total)}</b>
            {total !== order.estimated_total && <span className="text-amber-700"> (el cliente vio {formatCOP(order.estimated_total)})</span>}</p>
          {order.delivery_fee > 0 && <p className="text-xs text-gray-500">El domicilio ({formatCOP(order.delivery_fee)}) no se incluye en la venta de productos; cóbralo y regístralo aparte si aplica.</p>}
          <div className="flex flex-wrap gap-2">
            <Btn type="button" variant="ghost" onClick={() => quick('cash')}>Todo efectivo</Btn>
            <Btn type="button" variant="ghost" onClick={() => quick('transfer')}>Todo transferencia</Btn>
            <Btn type="button" variant="ghost" onClick={() => quick('credit')}>Todo fiado</Btn>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Efectivo"><input inputMode="numeric" className={inputCls} value={pay.cash} onChange={(e) => setPay({ ...pay, cash: e.target.value })} /></Field>
            <Field label="Transferencia"><input inputMode="numeric" className={inputCls} value={pay.transfer} onChange={(e) => setPay({ ...pay, transfer: e.target.value })} /></Field>
            <Field label="Fiado"><input inputMode="numeric" className={inputCls} value={pay.credit} onChange={(e) => setPay({ ...pay, credit: e.target.value })} /></Field>
          </div>
          <Field label="Cliente (obligatorio si hay fiado)">
            <select className={inputCls} value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">Sin cliente</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          {payError && <Alert>{payError}</Alert>}
          {error && <Alert>{error}</Alert>}
          <Btn disabled={busy || !!payError} className="w-full">{busy ? 'Guardando…' : 'Confirmar cobro y entrega'}</Btn>
        </form>
      )}
    </Modal>
  )
}

export default function Orders() {
  const [orders, setOrders] = useState<Order[]>([])
  const [filter, setFilter] = useState<'active' | OrderStatus>('active')
  const [open, setOpen] = useState<Order | null>(null)
  const [converting, setConverting] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('orders').select('*, order_items(*)').order('created_at', { ascending: false }).limit(200)
    if (error) setError(errMsg(error))
    const list = (data ?? []) as Order[]
    setOrders(list)
    setOpen((cur) => (cur ? list.find((o) => o.id === cur.id) ?? null : null))
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  async function setStatus(o: Order, status: OrderStatus) {
    setError('')
    const { error } = await supabase.from('orders').update({ status }).eq('id', o.id)
    if (error) return setError(errMsg(error))
    load()
  }

  const shown = orders.filter((o) => (filter === 'active' ? !['delivered', 'cancelled'].includes(o.status) : o.status === filter))
  const waPhone = (p: string) => (p.length === 10 ? `57${p}` : p)

  return (
    <>
      <PageTitle>Pedidos de la tienda</PageTitle>
      <div className="mb-3">
        <select value={filter} onChange={(e) => setFilter(e.target.value as 'active' | OrderStatus)} className="border rounded-lg px-3 py-2 text-sm bg-white">
          <option value="active">Pendientes</option>
          {(Object.keys(orderStatusLabel) as OrderStatus[]).map((s) => <option key={s} value={s}>{orderStatusLabel[s]}</option>)}
        </select>
      </div>
      {error && <Alert>{error}</Alert>}
      {loading ? <p>Cargando…</p> : shown.length === 0 ? <Empty>No hay pedidos en esta lista</Empty> : (
        <ul className="bg-white rounded-xl border divide-y">
          {shown.map((o) => (
            <li key={o.id}>
              <button onClick={() => setOpen(o)} className="w-full text-left p-3 flex justify-between gap-2 hover:bg-sol-50 text-sm">
                <span><b>#{o.number}</b> · {o.customer_name}<br /><span className="text-xs text-gray-500">{fmtDate(o.created_at)} · {o.delivery_method === 'delivery' ? 'Domicilio' : 'Recoge'}</span></span>
                <span className="text-right"><b>{formatCOP(o.estimated_total)}</b><br /><span className="text-xs">{orderStatusLabel[o.status]}</span></span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <Modal title={`Pedido #${open.number}`} onClose={() => setOpen(null)}>
          <div className="text-sm space-y-1">
            <p><b>{open.customer_name}</b> · {open.phone}</p>
            <p>{open.delivery_method === 'delivery' ? `Domicilio: ${open.address ?? ''}` : 'Recoge en el establecimiento'}</p>
            {open.notes && <p>Observaciones: {open.notes}</p>}
            <p>Estado: <b>{orderStatusLabel[open.status]}</b>{open.sale_id ? ' · ya registrado como venta' : ''}</p>
          </div>
          <ul className="divide-y border-y text-sm">
            {open.order_items.map((i) => <li key={i.id} className="py-1 flex justify-between gap-2"><span>{i.product_name} · {formatQuantity(i.sale_mode, i.quantity)}</span><span>{formatCOP(i.line_total)}</span></li>)}
          </ul>
          <p className="text-sm flex justify-between"><span>Total estimado (precios al pedir)</span><b>{formatCOP(open.estimated_total)}</b></p>
          <div className="flex flex-wrap gap-2">
            {flow.includes(open.status) && open.status !== 'ready' && (
              <Btn onClick={() => setStatus(open, flow[flow.indexOf(open.status) + 1])}>Pasar a: {orderStatusLabel[flow[flow.indexOf(open.status) + 1]]}</Btn>
            )}
            {open.status === 'ready' && !open.sale_id && <Btn onClick={() => setConverting(open)}>Cobrar y entregar</Btn>}
            <a href={`https://wa.me/${waPhone(open.phone)}`} target="_blank" rel="noreferrer" className="rounded-lg px-3 py-2 text-sm font-semibold border bg-white">Abrir WhatsApp</a>
            {!['delivered', 'cancelled'].includes(open.status) && (
              <Btn variant="danger" onClick={() => { if (window.confirm('¿Cancelar este pedido?')) setStatus(open, 'cancelled') }}>Cancelar pedido</Btn>
            )}
          </div>
          <p className="text-xs text-gray-500">“Abrir WhatsApp” solo abre la conversación; el sistema no envía ni confirma mensajes.</p>
        </Modal>
      )}
      {converting && <Convert order={converting} onDone={() => { setConverting(null); load() }} onClose={() => setConverting(null)} />}
    </>
  )
}
