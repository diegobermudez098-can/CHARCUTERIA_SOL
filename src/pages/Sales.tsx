import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatCOP, formatQuantity, lineTotal } from '../lib/money'
import { errMsg, toInt } from '../lib/db'
import { paymentsPayload, validatePayments } from '../lib/sales'
import type { Customer, Product } from '../lib/types'
import { Alert, Btn, Empty, Field, PageTitle, inputCls } from '../components/ui'
import Receipt from '../components/Receipt'

interface CartLine { product: Product; qty: string }

export default function Sales() {
  const [products, setProducts] = useState<Product[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [cashOpen, setCashOpen] = useState<boolean | null>(null)
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState<CartLine[]>([])
  const [discount, setDiscount] = useState('')
  const [pay, setPay] = useState({ cash: '', transfer: '', credit: '' })
  const [customerId, setCustomerId] = useState('')
  const [newCustomer, setNewCustomer] = useState('')
  const [key, setKey] = useState(() => crypto.randomUUID())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [receiptId, setReceiptId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [p, c, s] = await Promise.all([
      supabase.from('products').select('*').eq('active', true).gt('stock', 0).order('name'),
      supabase.from('customers').select('*').order('name'),
      supabase.from('cash_sessions').select('id').is('closed_at', null).limit(1),
    ])
    setProducts((p.data ?? []) as Product[])
    setCustomers((c.data ?? []) as Customer[])
    setCashOpen((s.data ?? []).length > 0)
  }, [])
  useEffect(() => { load() }, [load])

  const lines = cart.map((l) => {
    const q = toInt(l.qty)
    const ok = Number.isInteger(q) && q > 0 && q <= l.product.stock
    return { ...l, q, ok, total: ok ? lineTotal(l.product.sale_mode, l.product.price, q) : 0 }
  })
  const subtotal = lines.reduce((s, l) => s + l.total, 0)
  const disc = discount.trim() === '' ? 0 : toInt(discount)
  const discOk = Number.isInteger(disc) && disc >= 0 && disc <= subtotal
  const total = discOk ? subtotal - disc : 0
  const nums = { cash: toInt(pay.cash || '0'), transfer: toInt(pay.transfer || '0'), credit: toInt(pay.credit || '0') }
  const payError = lines.length === 0 ? null : validatePayments(total, nums, customerId !== '')
  const canConfirm = !busy && lines.length > 0 && lines.every((l) => l.ok) && discOk && !payError

  function add(p: Product) {
    setCart((c) => c.some((l) => l.product.id === p.id) ? c : [...c, { product: p, qty: p.sale_mode === 'weight' ? '250' : '1' }])
  }
  const quick = (field: 'cash' | 'transfer' | 'credit') =>
    setPay({ cash: '', transfer: '', credit: '', [field]: String(total) })

  async function addCustomer() {
    if (!newCustomer.trim()) return
    const { data, error } = await supabase.from('customers').insert({ name: newCustomer.trim() }).select().single()
    if (error) return setError(errMsg(error))
    setCustomers((c) => [...c, data as Customer])
    setCustomerId((data as Customer).id)
    setNewCustomer('')
  }

  async function confirm() {
    setBusy(true)
    setError('')
    const { data, error } = await supabase.rpc('create_sale', {
      p_items: lines.map((l) => ({ product_id: l.product.id, quantity: l.q })),
      p_payments: paymentsPayload(nums),
      p_customer_id: customerId || null,
      p_discount: disc,
      p_key: key,
    })
    setBusy(false)
    if (error) return setError(errMsg(error))   // se conserva la misma clave: reintentar no duplica
    setReceiptId(data as string)
    setCart([]); setDiscount(''); setPay({ cash: '', transfer: '', credit: '' }); setCustomerId('')
    setKey(crypto.randomUUID())
    load()
  }

  const results = products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase())).slice(0, 30)

  return (
    <>
      <PageTitle>Venta rápida</PageTitle>
      {cashOpen === false && <div className="mb-3"><Alert kind="info">No hay caja abierta. Puedes vender, pero el dinero no quedará asociado a un turno de caja.</Alert></div>}
      <div className="grid lg:grid-cols-2 gap-4">
        <section className="bg-white rounded-xl border p-3">
          <input placeholder="Buscar producto…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm mb-2" autoFocus />
          {results.length === 0 ? <Empty>No hay productos con existencias</Empty> : (
            <ul className="divide-y max-h-[60vh] overflow-y-auto">
              {results.map((p) => (
                <li key={p.id}>
                  <button onClick={() => add(p)} className="w-full text-left py-2 px-1 hover:bg-sol-50 flex justify-between gap-2 text-sm">
                    <span>{p.name}<br /><span className="text-xs text-gray-500">Disponible: {formatQuantity(p.sale_mode, p.stock)}</span></span>
                    <b>{formatCOP(p.price)}{p.sale_mode === 'weight' ? '/kg' : ''}</b>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="bg-white rounded-xl border p-3 space-y-3">
          <h3 className="font-bold">Venta actual</h3>
          {lines.length === 0 ? <Empty>Agrega productos desde la lista</Empty> : (
            <ul className="divide-y">
              {lines.map((l) => (
                <li key={l.product.id} className="py-2 flex items-center gap-2 text-sm">
                  <span className="flex-1">{l.product.name}<br /><span className="text-xs text-gray-500">{l.product.sale_mode === 'weight' ? 'gramos' : 'unidades'}</span></span>
                  <input aria-label={`Cantidad de ${l.product.name}`} inputMode="numeric" value={l.qty}
                    onChange={(e) => setCart((c) => c.map((x) => x.product.id === l.product.id ? { ...x, qty: e.target.value } : x))}
                    className={`w-20 border rounded px-2 py-1 ${l.ok ? '' : 'border-red-500'}`} />
                  <b className="w-24 text-right">{formatCOP(l.total)}</b>
                  <button aria-label="Quitar" onClick={() => setCart((c) => c.filter((x) => x.product.id !== l.product.id))} className="text-red-600 px-1">✕</button>
                </li>
              ))}
            </ul>
          )}
          {lines.some((l) => !l.ok) && <Alert>Revisa las cantidades: deben ser enteras, mayores que cero y no superar las existencias.</Alert>}

          {lines.length > 0 && (
            <>
              <Field label="Descuento (COP, opcional)">
                <input inputMode="numeric" className={inputCls} value={discount} onChange={(e) => setDiscount(e.target.value)} />
              </Field>
              {!discOk && <Alert>El descuento no puede superar el subtotal.</Alert>}
              <p className="flex justify-between text-lg font-bold"><span>Total</span><span>{formatCOP(total)}</span></p>

              <div className="flex flex-wrap gap-2">
                <Btn variant="ghost" onClick={() => quick('cash')}>Todo efectivo</Btn>
                <Btn variant="ghost" onClick={() => quick('transfer')}>Todo transferencia</Btn>
                <Btn variant="ghost" onClick={() => quick('credit')}>Todo fiado</Btn>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Field label="Efectivo"><input inputMode="numeric" className={inputCls} value={pay.cash} onChange={(e) => setPay({ ...pay, cash: e.target.value })} /></Field>
                <Field label="Transferencia"><input inputMode="numeric" className={inputCls} value={pay.transfer} onChange={(e) => setPay({ ...pay, transfer: e.target.value })} /></Field>
                <Field label="Fiado"><input inputMode="numeric" className={inputCls} value={pay.credit} onChange={(e) => setPay({ ...pay, credit: e.target.value })} /></Field>
              </div>
              <p className="text-xs text-gray-500">Las transferencias quedan registradas según lo que confirma quien vende; el sistema no las verifica con el banco.</p>

              <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
                <Field label="Cliente (obligatorio si hay fiado)">
                  <select className={inputCls} value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                    <option value="">Sin cliente</option>
                    {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </Field>
                <span />
                <input placeholder="Nuevo cliente" className="border rounded-lg px-3 py-2 text-sm" value={newCustomer} onChange={(e) => setNewCustomer(e.target.value)} />
                <Btn variant="ghost" onClick={addCustomer}>Crear</Btn>
              </div>

              {payError && <Alert>{payError}</Alert>}
              {error && <Alert>{error}</Alert>}
              <Btn onClick={confirm} disabled={!canConfirm} className="w-full py-3 text-base">{busy ? 'Guardando…' : 'Confirmar venta'}</Btn>
            </>
          )}
        </section>
      </div>
      {receiptId && <Receipt saleId={receiptId} onClose={() => setReceiptId(null)} />}
    </>
  )
}
