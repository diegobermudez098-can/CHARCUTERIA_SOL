import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatCOP, formatQuantity, lineTotal, parseCOP } from '../lib/money'
import { errMsg, toInt } from '../lib/db'
import { paymentsPayload, validatePayments } from '../lib/sales'
import type { Customer, Product } from '../lib/types'
import { Alert, Btn, Choice, Empty, Field, PageTitle, inputCls } from '../components/ui'
import ProductPhoto from '../components/ProductPhoto'
import Receipt from '../components/Receipt'

type PayMode = 'cash' | 'transfer' | 'credit' | 'mixed'
interface CartLine { product: Product; qty: string }

const money = (s: string): number => (s.trim() === '' ? 0 : parseCOP(s))
const gramChips: [number, string][] = [[250, '¼ kilo'], [500, '½ kilo'], [1000, '1 kilo'], [2000, '2 kilos']]

export default function Sales() {
  const [products, setProducts] = useState<Product[] | null>(null)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState<CartLine[]>([])
  const [discount, setDiscount] = useState('')
  const [payMode, setPayMode] = useState<PayMode>('cash')
  const [mixed, setMixed] = useState({ cash: '', transfer: '', credit: '' })
  const [customerId, setCustomerId] = useState('')
  const [newCustomer, setNewCustomer] = useState('')
  const [key, setKey] = useState(() => crypto.randomUUID())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [receiptId, setReceiptId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [p, c] = await Promise.all([
      supabase.from('products').select('*').eq('active', true).gt('stock', 0).order('name'),
      supabase.from('customers').select('*').order('name'),
    ])
    if (p.error) setError(errMsg(p.error))
    setProducts((p.data ?? []) as Product[])
    setCustomers(((c.data ?? []) as Customer[]).filter((x) => x.active !== false))
  }, [])
  useEffect(() => { load() }, [load])

  const lines = cart.map((l) => {
    const q = toInt(l.qty)
    const ok = Number.isInteger(q) && q > 0 && q <= l.product.stock
    const problem = ok ? '' : Number.isInteger(q) && q > l.product.stock
      ? `Solo hay ${formatQuantity(l.product.sale_mode, l.product.stock)}`
      : 'Escribe una cantidad mayor que cero'
    return { ...l, q, ok, problem, total: ok ? lineTotal(l.product.sale_mode, l.product.price, q) : 0 }
  })
  const subtotal = lines.reduce((s, l) => s + l.total, 0)
  const disc = money(discount)
  const discOk = Number.isInteger(disc) && disc >= 0 && disc <= subtotal
  const total = discOk ? subtotal - disc : 0
  const nums = payMode === 'mixed'
    ? { cash: money(mixed.cash), transfer: money(mixed.transfer), credit: money(mixed.credit) }
    : { cash: payMode === 'cash' ? total : 0, transfer: payMode === 'transfer' ? total : 0, credit: payMode === 'credit' ? total : 0 }
  const payError = lines.length === 0 ? null : validatePayments(total, nums, customerId !== '')
  const canConfirm = !busy && lines.length > 0 && lines.every((l) => l.ok) && discOk && !payError
  const mixedLeft = total - (nums.cash + nums.transfer + nums.credit)
  const showCustomerNow = payMode === 'credit' || payMode === 'mixed'

  function add(p: Product) {
    setCart((c) => c.some((l) => l.product.id === p.id) ? c : [...c, { product: p, qty: p.sale_mode === 'weight' ? '250' : '1' }])
  }
  const setQty = (id: string, qty: string) => setCart((c) => c.map((x) => x.product.id === id ? { ...x, qty } : x))

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
    setCart([]); setDiscount(''); setPayMode('cash'); setMixed({ cash: '', transfer: '', credit: '' }); setCustomerId('')
    setKey(crypto.randomUUID())
    load()
  }

  const results = (products ?? []).filter((p) => p.name.toLowerCase().includes(search.toLowerCase())).slice(0, 60)

  const customerBlock = (
    <div className="space-y-3">
      <Field label={payMode === 'cash' || payMode === 'transfer' ? 'Cliente (opcional)' : 'Cliente (obligatorio para fiar)'}>
        <select className={inputCls} value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
          <option value="">— Elegir cliente —</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
        <Field label="¿No está en la lista? Escribe su nombre">
          <input className={inputCls} value={newCustomer} onChange={(e) => setNewCustomer(e.target.value)} />
        </Field>
        <Btn variant="ghost" onClick={addCustomer}>Crear</Btn>
      </div>
    </div>
  )

  return (
    <>
      <PageTitle>Vender</PageTitle>
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}

      <div className="grid lg:grid-cols-[1fr_27rem] gap-5 items-start">
        <section aria-label="Productos" className="space-y-3">
          <input aria-label="Buscar producto" placeholder="🔍 Buscar producto…" value={search} onChange={(e) => setSearch(e.target.value)} className={`${inputCls} mt-0`} />
          {products === null ? <Empty>Cargando productos…</Empty> : products.length === 0 ? (
            <div className="bg-white rounded-2xl border-2 border-gray-200 text-center p-8 space-y-4">
              <p className="text-2xl font-bold">Todavía no hay productos para vender</p>
              <p className="text-lg text-gray-700">Un producto aparece aquí cuando tiene existencias. Ve a Productos, agrégalo y escribe cuánto tienes.</p>
              <Link to="/productos" className="inline-block rounded-xl bg-sol-700 hover:bg-sol-900 text-white font-bold text-lg px-6 py-3">Ir a Productos</Link>
            </div>
          ) : results.length === 0 ? <Empty>No encontré “{search}”</Empty> : (
            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {results.map((p) => {
                const inCart = cart.some((l) => l.product.id === p.id)
                return (
                  <li key={p.id}>
                    <button type="button" onClick={() => add(p)} aria-label={`Agregar ${p.name}`}
                      className={`w-full h-full text-left rounded-2xl border-2 bg-white overflow-hidden flex flex-col hover:border-sol-700 active:bg-sol-50 ${inCart ? 'border-green-600 ring-2 ring-green-600' : 'border-gray-200'}`}>
                      <ProductPhoto name={p.name} url={p.image_url} className="w-full h-24 sm:h-28 text-4xl" />
                      <span className="p-3 block">
                        <span className="block text-lg font-bold leading-tight">{p.name}</span>
                        <span className="block text-base font-semibold text-sol-900">{formatCOP(p.price)}{p.sale_mode === 'weight' ? ' el kilo' : ''}</span>
                        <span className="block text-sm text-gray-600">Hay {formatQuantity(p.sale_mode, p.stock)}</span>
                        {inCart && <span className="block text-sm font-bold text-green-700">✓ En la venta</span>}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section aria-label="Venta actual" className="bg-white rounded-2xl border-2 border-gray-200 p-4 space-y-4 lg:sticky lg:top-4">
          <h3 className="text-2xl font-extrabold">La venta</h3>
          {lines.length === 0 ? <Empty>Toca un producto de la lista para agregarlo</Empty> : (
            <ul className="divide-y-2 divide-gray-100">
              {lines.map((l) => {
                const weight = l.product.sale_mode === 'weight'
                const q = Number.isInteger(l.q) ? l.q : 0
                return (
                  <li key={l.product.id} className="py-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-lg font-bold leading-tight">{l.product.name}</span>
                      <button type="button" aria-label={`Quitar ${l.product.name}`} onClick={() => setCart((c) => c.filter((x) => x.product.id !== l.product.id))}
                        className="rounded-xl border-2 border-red-300 text-red-700 px-3 py-1 text-base font-semibold hover:bg-red-50">Quitar</button>
                    </div>
                    {weight ? (
                      <div className="flex flex-wrap gap-2">
                        {gramChips.map(([g, label]) => (
                          <button key={g} type="button" aria-pressed={q === g} onClick={() => setQty(l.product.id, String(g))}
                            className={`rounded-xl border-2 px-3 py-2 text-base font-bold ${q === g ? 'border-sol-700 bg-sol-100 text-sol-900' : 'border-gray-300 bg-white hover:bg-gray-50'}`}>{label}</button>
                        ))}
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <button type="button" aria-label="Menos" onClick={() => setQty(l.product.id, String(Math.max(1, q - 1)))}
                          className="h-12 w-12 rounded-xl border-2 border-gray-300 text-3xl font-bold leading-none hover:bg-gray-50">−</button>
                        <span className="text-2xl font-extrabold w-10 text-center">{q}</span>
                        <button type="button" aria-label="Más" onClick={() => setQty(l.product.id, String(q + 1))}
                          className="h-12 w-12 rounded-xl border-2 border-gray-300 text-3xl font-bold leading-none hover:bg-gray-50">+</button>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      {weight && (
                        <>
                          <input aria-label={`Gramos de ${l.product.name}`} inputMode="numeric" value={l.qty} onChange={(e) => setQty(l.product.id, e.target.value)}
                            className={`w-28 border-2 rounded-xl px-3 py-2 text-lg ${l.ok ? 'border-gray-300' : 'border-red-600'}`} />
                          <span className="text-base text-gray-700">gramos</span>
                        </>
                      )}
                      <b className="ml-auto text-xl">{formatCOP(l.total)}</b>
                    </div>
                    {!l.ok && <p role="alert" className="text-base font-semibold text-red-700">{l.problem}</p>}
                  </li>
                )
              })}
            </ul>
          )}

          {lines.length > 0 && (
            <div className="border-t-2 pt-4 space-y-4">
              <p className="flex justify-between items-baseline gap-2">
                <span className="text-xl font-bold">Total a cobrar</span>
                <span className="text-4xl font-extrabold text-sol-900">{formatCOP(total)}</span>
              </p>

              <div>
                <p className="text-base font-semibold">¿Cómo paga?</p>
                <Choice<PayMode> value={payMode} onChange={setPayMode}
                  options={[
                    { value: 'cash', label: 'Efectivo', icon: '💵' }, { value: 'transfer', label: 'Transferencia', icon: '📱' },
                    { value: 'credit', label: 'Fiado', icon: '📒' }, { value: 'mixed', label: 'Varias formas', icon: '🔀' },
                  ]} />
              </div>

              {payMode === 'mixed' && (
                <div className="space-y-3">
                  <Field label="Pagó en efectivo"><input inputMode="numeric" className={inputCls} value={mixed.cash} onChange={(e) => setMixed({ ...mixed, cash: e.target.value })} /></Field>
                  <Field label="Pagó por transferencia"><input inputMode="numeric" className={inputCls} value={mixed.transfer} onChange={(e) => setMixed({ ...mixed, transfer: e.target.value })} /></Field>
                  <Field label="Queda fiado"><input inputMode="numeric" className={inputCls} value={mixed.credit} onChange={(e) => setMixed({ ...mixed, credit: e.target.value })} /></Field>
                  <p className="text-lg font-bold">{mixedLeft === 0 ? '✓ Está completo' : mixedLeft > 0 ? `Falta por anotar: ${formatCOP(mixedLeft)}` : `Se pasó por: ${formatCOP(-mixedLeft)}`}</p>
                </div>
              )}

              {showCustomerNow && customerBlock}

              <details className="rounded-xl border-2 border-gray-200 p-3">
                <summary className="cursor-pointer text-base font-semibold">Descuento{showCustomerNow ? '' : ' y cliente'} (opcional)</summary>
                <div className="space-y-3 mt-3">
                  <Field label="Descuento en pesos">
                    <input inputMode="numeric" className={inputCls} value={discount} onChange={(e) => setDiscount(e.target.value)} />
                  </Field>
                  {!discOk && <Alert>El descuento no puede ser mayor que el valor de la venta.</Alert>}
                  {!showCustomerNow && customerBlock}
                </div>
              </details>

              {payError && <Alert>{payError}</Alert>}
              <Btn variant="good" onClick={confirm} disabled={!canConfirm} className="w-full py-4 text-2xl">
                {busy ? 'Guardando…' : `Cobrar ${formatCOP(total)}`}
              </Btn>
            </div>
          )}
        </section>
      </div>
      {receiptId && <Receipt saleId={receiptId} onClose={() => setReceiptId(null)} />}
    </>
  )
}
