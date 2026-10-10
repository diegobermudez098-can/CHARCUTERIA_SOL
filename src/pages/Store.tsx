import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatCOP, formatQuantity, lineTotal } from '../lib/money'
import { errMsg } from '../lib/db'
import type { PublicInfo, PublicProduct } from '../lib/types'
import { Alert, Btn, Empty, Field, inputCls } from '../components/ui'

interface Line { product: PublicProduct; qty: number }
interface Done { number: number; token: string; total: number; summary: string }

const digits = (s: string) => s.replace(/\D/g, '')
const waLink = (number: string, text: string) => `https://wa.me/${digits(number)}?text=${encodeURIComponent(text)}`

export default function Store() {
  const [products, setProducts] = useState<PublicProduct[]>([])
  const [info, setInfo] = useState<PublicInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState<Line[]>([])
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [method, setMethod] = useState<'pickup' | 'delivery'>('pickup')
  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [key, setKey] = useState(() => crypto.randomUUID())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState<Done | null>(null)

  useEffect(() => {
    Promise.all([supabase.rpc('get_public_catalog'), supabase.rpc('get_public_info')]).then(([c, i]) => {
      if (c.error) setError('No pudimos cargar el catálogo. Intenta de nuevo en un momento.')
      setProducts((c.data ?? []) as PublicProduct[])
      setInfo((i.data ?? null) as PublicInfo | null)
      setLoading(false)
    })
  }, [])

  const lines = cart.map((l) => {
    const ok = Number.isInteger(l.qty) && l.qty > 0
    return { ...l, ok, total: ok ? lineTotal(l.product.sale_mode, l.product.price, l.qty) : 0 }
  })
  const subtotal = lines.reduce((s, l) => s + l.total, 0)
  const fee = method === 'delivery' && info?.delivery_enabled ? info.delivery_fee : 0
  const total = subtotal + fee

  const add = (p: PublicProduct) =>
    setCart((c) => (c.some((l) => l.product.id === p.id) ? c : [...c, { product: p, qty: p.sale_mode === 'weight' ? 500 : 1 }]))
  const setQty = (id: string, qty: number) => setCart((c) => c.map((l) => (l.product.id === id ? { ...l, qty } : l)))

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (lines.length === 0 || lines.some((l) => !l.ok)) return setError('Revisa las cantidades de tu pedido')
    if (name.trim().length < 2) return setError('Escribe tu nombre')
    if (digits(phone).length < 7) return setError('Escribe un teléfono válido')
    if (method === 'delivery' && address.trim().length < 5) return setError('Escribe la dirección de entrega')
    setBusy(true)
    const { data, error } = await supabase.rpc('create_public_order', {
      p_name: name, p_phone: phone, p_method: method, p_address: method === 'delivery' ? address : null,
      p_notes: notes || null, p_key: key,
      p_items: lines.map((l) => ({ product_id: l.product.id, quantity: l.qty })),
    })
    setBusy(false)
    if (error) return setError(errMsg(error))   // misma clave: reintentar no duplica el pedido
    const r = data as { number: number; token: string; total: number }
    const summary = [
      `Hola, hice el pedido #${r.number} en ${info?.business_name ?? 'SOL'}:`,
      ...lines.map((l) => `- ${l.product.name}: ${formatQuantity(l.product.sale_mode, l.qty)}`),
      `Total estimado: ${formatCOP(r.total)}`,
      method === 'delivery' ? `Entrega a domicilio: ${address}` : 'Recojo en el establecimiento',
      `A nombre de ${name.trim()}`,
    ].join('\n')
    setDone({ number: r.number, token: r.token, total: r.total, summary })
    setCart([]); setNotes(''); setKey(crypto.randomUUID())
  }

  const shown = products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
  const groups = Array.from(new Set(shown.map((p) => p.category ?? 'Otros')))
  const businessName = info?.business_name ?? 'SOL'

  if (done) {
    const statusUrl = `${window.location.origin}/pedido/${done.token}`
    return (
      <main className="min-h-screen bg-sol-50 p-4 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow p-6 max-w-md w-full space-y-3">
          <h1 className="text-2xl font-bold text-sol-700">¡Pedido recibido!</h1>
          <p>Tu pedido <b>#{done.number}</b> quedó registrado por un total estimado de <b>{formatCOP(done.total)}</b>. {businessName} lo confirmará contigo; el precio final se valida al momento de preparar y cobrar.</p>
          <p className="text-sm">Guarda este enlace para consultar el estado:</p>
          <input readOnly value={statusUrl} className={inputCls} onFocus={(e) => e.currentTarget.select()} />
          <div className="flex flex-wrap gap-2">
            <Link to={`/pedido/${done.token}`} className="rounded-lg px-3 py-2 text-sm font-semibold bg-sol-600 text-white">Ver estado del pedido</Link>
            {info?.whatsapp_number && (
              <a href={waLink(info.whatsapp_number, done.summary)} target="_blank" rel="noreferrer" className="rounded-lg px-3 py-2 text-sm font-semibold border bg-white">
                Abrir WhatsApp con el resumen
              </a>
            )}
            <Btn variant="ghost" onClick={() => setDone(null)}>Hacer otro pedido</Btn>
          </div>
          {info?.whatsapp_number && <p className="text-xs text-gray-500">El botón solo abre WhatsApp con el mensaje escrito; tú decides si lo envías. Tu pedido ya está registrado aunque no uses WhatsApp.</p>}
        </div>
      </main>
    )
  }

  return (
    <div className="min-h-screen bg-sol-50">
      <header className="bg-sol-600 text-white">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <h1 className="text-3xl font-bold">{businessName}</h1>
          <p className="text-sol-100">Charcutería y carnicería · Haz tu pedido en línea</p>
          {info?.address && <p className="text-sm mt-1">📍 {info.address}</p>}
          {info?.whatsapp_number && (
            <a href={waLink(info.whatsapp_number, `Hola ${businessName}, quisiera hacer una consulta.`)} target="_blank" rel="noreferrer" className="inline-block mt-2 underline text-sm">
              Escríbenos por WhatsApp
            </a>
          )}
        </div>
      </header>

      <div className="max-w-6xl mx-auto p-4 grid lg:grid-cols-[1fr_380px] gap-4">
        <section>
          <input placeholder="Buscar producto…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm bg-white mb-3" />
          {loading ? <p>Cargando…</p> : shown.length === 0 ? <Empty>No hay productos disponibles por ahora</Empty> : groups.map((g) => (
            <div key={g} className="mb-4">
              <h2 className="font-bold text-sol-900 mb-2">{g}</h2>
              <div className="grid sm:grid-cols-2 gap-3">
                {shown.filter((p) => (p.category ?? 'Otros') === g).map((p) => (
                  <article key={p.id} className="bg-white rounded-xl border p-3 flex flex-col justify-between gap-2">
                    <div>
                      <h3 className="font-semibold">{p.name}</h3>
                      {p.description && <p className="text-xs text-gray-500">{p.description}</p>}
                      <p className="text-sm mt-1"><b>{formatCOP(p.price)}</b>{p.sale_mode === 'weight' ? ' por kg' : ' por unidad'}</p>
                    </div>
                    <Btn disabled={!p.available} onClick={() => add(p)}>{p.available ? 'Agregar' : 'Agotado'}</Btn>
                  </article>
                ))}
              </div>
            </div>
          ))}
        </section>

        <aside id="carrito" className="bg-white rounded-xl border p-4 h-fit lg:sticky lg:top-4 space-y-3">
          <h2 className="font-bold text-lg">Tu pedido</h2>
          {lines.length === 0 ? <Empty>Aún no has agregado productos</Empty> : (
            <ul className="divide-y">
              {lines.map((l) => (
                <li key={l.product.id} className="py-2 text-sm space-y-1">
                  <div className="flex justify-between gap-2"><b>{l.product.name}</b><b>{formatCOP(l.total)}</b></div>
                  <div className="flex items-center gap-1 flex-wrap">
                    {l.product.sale_mode === 'weight' ? (
                      <>
                        {[250, 500, 1000].map((g) => (
                          <button key={g} type="button" onClick={() => setQty(l.product.id, g)} className={`border rounded px-2 py-0.5 ${l.qty === g ? 'bg-sol-100' : ''}`}>{formatQuantity('weight', g)}</button>
                        ))}
                        <input aria-label={`Gramos de ${l.product.name}`} inputMode="numeric" value={l.qty || ''} onChange={(e) => setQty(l.product.id, Number(e.target.value.replace(/\D/g, '')))} className={`w-20 border rounded px-2 py-0.5 ${l.ok ? '' : 'border-red-500'}`} />
                        <span className="text-xs">g</span>
                      </>
                    ) : (
                      <>
                        <button type="button" aria-label="Menos" onClick={() => setQty(l.product.id, Math.max(1, l.qty - 1))} className="border rounded px-2">−</button>
                        <span className="w-8 text-center">{l.qty}</span>
                        <button type="button" aria-label="Más" onClick={() => setQty(l.product.id, l.qty + 1)} className="border rounded px-2">+</button>
                      </>
                    )}
                    <button type="button" onClick={() => setCart((c) => c.filter((x) => x.product.id !== l.product.id))} className="ml-auto text-red-600">Quitar</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {lines.length > 0 && (
            <form onSubmit={submit} className="space-y-3">
              <Field label="Tu nombre"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} /></Field>
              <Field label="Teléfono"><input className={inputCls} inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required /></Field>
              <Field label="¿Cómo lo recibes?">
                <select className={inputCls} value={method} onChange={(e) => setMethod(e.target.value as 'pickup' | 'delivery')}>
                  <option value="pickup">Recojo en el establecimiento</option>
                  {info?.delivery_enabled && <option value="delivery">Entrega a domicilio</option>}
                </select>
              </Field>
              {method === 'delivery' && <Field label="Dirección de entrega"><input className={inputCls} value={address} onChange={(e) => setAddress(e.target.value)} required maxLength={300} /></Field>}
              <Field label="Observaciones (opcional)"><input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} /></Field>
              <div className="text-sm space-y-1 border-t pt-2">
                <p className="flex justify-between"><span>Subtotal</span><span>{formatCOP(subtotal)}</span></p>
                {method === 'delivery' && <p className="flex justify-between"><span>Domicilio</span><span>{formatCOP(fee)}</span></p>}
                <p className="flex justify-between font-bold text-base"><span>Total estimado</span><span>{formatCOP(total)}</span></p>
                <p className="text-xs text-gray-500">El precio final se confirma al preparar el pedido. El pago se acuerda con el negocio.</p>
              </div>
              {error && <Alert>{error}</Alert>}
              <Btn disabled={busy} className="w-full py-3 text-base">{busy ? 'Enviando…' : 'Enviar pedido'}</Btn>
            </form>
          )}
          {lines.length === 0 && error && <Alert>{error}</Alert>}
        </aside>
      </div>
      <footer className="text-center text-xs text-gray-500 py-4">
        <Link to="/ingresar" className="underline">Acceso del personal</Link>
      </footer>
    </div>
  )
}
