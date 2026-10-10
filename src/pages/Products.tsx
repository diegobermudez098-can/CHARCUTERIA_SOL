import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { formatCOP, formatQuantity, parseCOP, parseQty, qtyToInput } from '../lib/money'
import { errMsg, fmtDate } from '../lib/db'
import { useProfiles } from '../lib/hooks'
import { uploadProductPhoto } from '../lib/images'
import { CATALOG, EMOJI_CHOICES, emojiFor, type CatalogItem } from '../lib/catalog'
import type { Category, InventoryMovement, Product, SaleMode } from '../lib/types'
import { Alert, Btn, Choice, Empty, Field, Modal, PageTitle, inputCls } from '../components/ui'
import ProductPhoto from '../components/ProductPhoto'

function ProductForm({ product, categories, onDone, onClose }: {
  product: Product | null; categories: Category[]; onDone: (notice?: string) => void; onClose: () => void
}) {
  const [step, setStep] = useState<'pick' | 'form'>(product ? 'form' : 'pick')
  const [pickSearch, setPickSearch] = useState('')
  const [name, setName] = useState(product?.name ?? '')
  const [mode, setMode] = useState<SaleMode>(product?.sale_mode ?? 'weight')
  const [price, setPrice] = useState(product ? String(product.price) : '')
  const [initial, setInitial] = useState('')
  const [cost, setCost] = useState(product && product.cost > 0 ? String(product.cost) : '')
  const [description, setDescription] = useState(product?.description ?? '')
  const [categoryId, setCategoryId] = useState(product?.category_id ?? '')
  const [newCategory, setNewCategory] = useState('')
  const [minStock, setMinStock] = useState(product && product.min_stock > 0 ? qtyToInput(product.sale_mode, product.min_stock) : '')
  const [emojiPick, setEmojiPick] = useState<string | null>(product?.image_url?.startsWith('emoji:') ? product.image_url.slice(6) : null)
  const [photo, setPhoto] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(product?.image_url && !product.image_url.startsWith('emoji:') ? product.image_url : null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => () => { if (preview?.startsWith('blob:')) URL.revokeObjectURL(preview) }, [preview])

  const emoji = emojiPick ?? emojiFor(name)
  const shownImage = preview ?? (emoji ? `emoji:${emoji}` : null)

  function pickPhoto(f: File | undefined) {
    if (!f) return
    setPhoto(f)
    setPreview(URL.createObjectURL(f))
  }
  function choose(item: CatalogItem | null) {
    if (item) { setName(item.name); setMode(item.mode); setEmojiPick(item.emoji) }
    setStep('form')
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    const p = parseCOP(price)
    if (!name.trim()) return setError('Escribe el nombre del producto')
    if (!Number.isInteger(p) || p <= 0) return setError('Escribe el precio de venta, solo con números. Ejemplo: 25000')
    const c = cost.trim() === '' ? 0 : parseCOP(cost)
    if (!Number.isInteger(c)) return setError('El costo no es válido. Escribe solo números')
    const m = minStock.trim() === '' ? 0 : parseQty(mode, minStock)
    if (!Number.isInteger(m)) return setError('El aviso de “se está acabando” no es válido. Ejemplo: 2 o 2,5')
    let q = 0
    if (!product && initial.trim() !== '') {
      q = parseQty(mode, initial)
      if (!Number.isInteger(q) || q <= 0) return setError('Escribe cuánto tienes ahora. Ejemplo: 10 o 2,5. Si no lo sabes, déjalo vacío')
    }
    setBusy(true)
    try {
      const image_url = photo ? await uploadProductPhoto(photo) : preview ? undefined : emoji ? `emoji:${emoji}` : undefined
      let catId: string | null = categoryId || null
      if (newCategory.trim()) {
        const { data, error } = await supabase.from('categories').insert({ name: newCategory.trim() }).select().single()
        if (error) throw error
        catId = (data as Category).id
      }
      const base = {
        name: name.trim(), description: description.trim() || null, category_id: catId, price: p, cost: c, min_stock: m,
        ...(image_url ? { image_url } : {}),
      }
      if (product) {
        const { error } = await supabase.from('products').update(base).eq('id', product.id)
        if (error) throw error
        return onDone()
      }
      const { data, error } = await supabase.from('products').insert({ ...base, sale_mode: mode }).select('id').single()
      if (error) throw error
      if (q > 0) {
        const mv = await supabase.rpc('register_inventory_movement', {
          p_product_id: (data as { id: string }).id, p_kind: 'entry', p_quantity: q, p_reason: 'Existencias iniciales',
        })
        if (mv.error) return onDone('El producto se guardó, pero no se pudo anotar cuánto hay. Toca “Agregar existencias” en su tarjeta.')
      }
      onDone()
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setBusy(false)
    }
  }

  if (step === 'pick') {
    const q = pickSearch.trim().toLowerCase()
    const items = CATALOG.filter((i) => i.name.toLowerCase().includes(q))
    return (
      <Modal title="¿Qué producto vas a agregar?" onClose={onClose}>
        <input aria-label="Buscar en la lista" placeholder="🔍 Buscar: pollo, chorizo, queso…" value={pickSearch} onChange={(e) => setPickSearch(e.target.value)} className={`${inputCls} mt-0`} />
        <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[45vh] overflow-y-auto">
          {items.map((i) => (
            <li key={i.name}>
              <button type="button" onClick={() => choose(i)} className="w-full h-full rounded-xl border-2 border-gray-200 bg-white hover:border-sol-700 p-2 flex flex-col items-center gap-1 text-center">
                <span aria-hidden="true" className="text-4xl">{i.emoji}</span>
                <span className="text-base font-bold leading-tight">{i.name}</span>
              </button>
            </li>
          ))}
        </ul>
        {items.length === 0 && <Empty>No está en la lista. Escríbelo tú misma.</Empty>}
        <Btn type="button" variant="ghost" className="w-full" onClick={() => choose(null)}>✏️ Otro producto (escribir el nombre)</Btn>
      </Modal>
    )
  }

  const weight = mode === 'weight'
  const priceNum = parseCOP(price)
  return (
    <Modal title={product ? 'Editar producto' : 'Agregar producto'} onClose={onClose}>
      <form onSubmit={submit} noValidate className="space-y-5">
        <div className="flex items-center gap-4">
          <ProductPhoto name={name || '?'} url={shownImage} className="w-24 h-24 text-6xl rounded-2xl shrink-0" />
          <div className="flex-1">
            <Field label="¿Cómo se llama?">
              <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ejemplo: Pollo entero" />
            </Field>
            {!product && <button type="button" onClick={() => setStep('pick')} className="mt-1 text-base font-semibold underline text-sol-900">Elegir otro de la lista</button>}
          </div>
        </div>

        <div>
          <p className="text-base font-semibold">¿Cómo lo vendes?</p>
          <Choice<SaleMode> value={mode} onChange={setMode} disabled={!!product}
            options={[{ value: 'weight', label: 'Por kilo', icon: '⚖️' }, { value: 'unit', label: 'Por unidad', icon: '1️⃣' }]} />
          {product && <p className="text-sm text-gray-600 mt-1">Esto no se puede cambiar en un producto que ya existe.</p>}
        </div>

        <div>
          <Field label={weight ? '¿A cuánto vendes el kilo?' : '¿A cuánto vendes cada unidad?'} hint="Escribe el valor en pesos. Ejemplo: 25000">
            <input inputMode="numeric" className={inputCls} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="25000" />
          </Field>
          {Number.isInteger(priceNum) && priceNum > 0 && (
            <p className="mt-1 text-xl font-extrabold text-sol-900">{formatCOP(priceNum)}{weight ? ' el kilo' : ' cada uno'}</p>
          )}
        </div>

        {!product ? (
          <Field label={weight ? '¿Cuántos kilos tienes ahora?' : '¿Cuántas unidades tienes ahora?'}
            hint="Sin existencias el producto no aparece en la pantalla de vender. Ejemplo: 10 o 2,5">
            <input inputMode="decimal" className={inputCls} value={initial} onChange={(e) => setInitial(e.target.value)} />
          </Field>
        ) : (
          <p className="text-base text-gray-700">Para cambiar cuánto hay, toca “Agregar existencias” en la tarjeta del producto.</p>
        )}

        <details className="rounded-xl border-2 border-gray-200 p-4">
          <summary className="cursor-pointer text-lg font-semibold">Más opciones (no son obligatorias)</summary>
          <div className="space-y-4 mt-4">
            <div>
              <p className="text-base font-semibold">Dibujo del producto</p>
              <div className="flex flex-wrap gap-2 mt-1">
                {EMOJI_CHOICES.map((em) => (
                  <button key={em} type="button" aria-label={`Dibujo ${em}`} aria-pressed={!preview && emoji === em}
                    onClick={() => { setEmojiPick(em); setPhoto(null); setPreview(null) }}
                    className={`h-14 w-14 rounded-xl border-2 text-3xl ${!preview && emoji === em ? 'border-sol-700 bg-sol-100' : 'border-gray-300 bg-white hover:bg-gray-50'}`}>{em}</button>
                ))}
              </div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => pickPhoto(e.target.files?.[0])} />
              <Btn type="button" variant="ghost" className="mt-3 text-base" onClick={() => fileRef.current?.click()}>📷 Usar una foto propia</Btn>
            </div>
            <Field label={weight ? '¿Cuánto te cuesta el kilo?' : '¿Cuánto te cuesta cada unidad?'} hint="Sirve para saber cuánto ganas">
              <input inputMode="numeric" className={inputCls} value={cost} onChange={(e) => setCost(e.target.value)} />
            </Field>
            <Field label={`Avisarme cuando queden menos de (${weight ? 'kilos' : 'unidades'})`}>
              <input inputMode="decimal" className={inputCls} value={minStock} onChange={(e) => setMinStock(e.target.value)} />
            </Field>
            <Field label="Categoría">
              <select className={inputCls} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">Sin categoría</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="O crea una categoría nueva">
              <input className={inputCls} value={newCategory} onChange={(e) => setNewCategory(e.target.value)} />
            </Field>
            <Field label="Nota (opcional)">
              <input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} />
            </Field>
          </div>
        </details>

        {error && <Alert>{error}</Alert>}
        <div className="grid grid-cols-2 gap-3">
          <Btn type="button" variant="ghost" onClick={onClose}>Cancelar</Btn>
          <Btn variant="good" disabled={busy}>{busy ? 'Guardando…' : 'Guardar producto'}</Btn>
        </div>
      </form>
    </Modal>
  )
}

function StockForm({ product, onDone, onClose }: { product: Product; onDone: (notice?: string) => void; onClose: () => void }) {
  const [kind, setKind] = useState<'entry' | 'adjustment'>('entry')
  const [qty, setQty] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const weight = product.sale_mode === 'weight'
  const unitWord = weight ? 'kilos' : 'unidades'

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    const n = parseQty(product.sale_mode, qty)
    if (!Number.isInteger(n)) return setError(`Escribe la cantidad en ${unitWord}. Ejemplo: ${weight ? '2,5' : '10'}`)
    let amount = n
    if (kind === 'entry' && n <= 0) return setError('La cantidad que llegó debe ser mayor que cero')
    if (kind === 'adjustment') {
      amount = n - product.stock
      if (amount === 0) return setError('Esa es la misma cantidad que ya está anotada')
    }
    setBusy(true)
    const { error } = await supabase.rpc('register_inventory_movement', {
      p_product_id: product.id, p_kind: kind, p_quantity: amount,
      p_reason: reason.trim() || (kind === 'adjustment' ? 'Conteo de inventario' : null),
    })
    setBusy(false)
    if (error) return setError(errMsg(error))
    onDone(`Listo: ahora hay ${formatQuantity(product.sale_mode, product.stock + amount)} de ${product.name}.`)
  }

  return (
    <Modal title={`Agregar existencias · ${product.name}`} onClose={onClose}>
      <p className="text-lg">Ahora hay: <b>{formatQuantity(product.sale_mode, product.stock)}</b></p>
      <form onSubmit={submit} noValidate className="space-y-5">
        <Choice<'entry' | 'adjustment'> value={kind} onChange={setKind}
          options={[{ value: 'entry', label: 'Llegó mercancía', icon: '➕' }, { value: 'adjustment', label: 'Contar de nuevo', icon: '🔢' }]} />
        <Field label={kind === 'entry' ? `¿Cuántos ${unitWord} llegaron?` : `¿Cuántos ${unitWord} hay realmente?`}
          hint={weight ? 'Ejemplo: 2,5 es dos kilos y medio' : 'Ejemplo: 10'}>
          <input inputMode="decimal" className={inputCls} value={qty} onChange={(e) => setQty(e.target.value)} />
        </Field>
        <Field label="Nota (opcional)">
          <input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        {error && <Alert>{error}</Alert>}
        <div className="grid grid-cols-2 gap-3">
          <Btn type="button" variant="ghost" onClick={onClose}>Cancelar</Btn>
          <Btn variant="good" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</Btn>
        </div>
      </form>
    </Modal>
  )
}

const kindLabel: Record<string, string> = { entry: 'Llegó mercancía', adjustment: 'Conteo', sale: 'Venta', sale_void: 'Venta anulada' }

function Movements({ product, onClose }: { product: Product; onClose: () => void }) {
  const [rows, setRows] = useState<InventoryMovement[] | null>(null)
  const profiles = useProfiles()
  useEffect(() => {
    supabase.from('inventory_movements').select('*').eq('product_id', product.id)
      .order('created_at', { ascending: false }).limit(50)
      .then(({ data }) => setRows((data ?? []) as InventoryMovement[]))
  }, [product.id])
  return (
    <Modal title={`Movimientos · ${product.name}`} onClose={onClose}>
      {!rows ? <p className="text-lg">Cargando…</p> : rows.length === 0 ? <Empty>Todavía no hay movimientos</Empty> : (
        <ul className="divide-y text-base">
          {rows.map((m) => (
            <li key={m.id} className="py-3 flex justify-between gap-3">
              <span>
                {kindLabel[m.kind] ?? m.kind}{m.reason ? ` · ${m.reason}` : ''}
                <br /><span className="text-sm text-gray-600">{fmtDate(m.created_at)} · {profiles[m.user_id] ?? ''}</span>
              </span>
              <b className={`text-lg ${m.quantity < 0 ? 'text-red-700' : 'text-green-700'}`}>{m.quantity < 0 ? '-' : '+'}{formatQuantity(product.sale_mode, Math.abs(m.quantity))}</b>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}

export default function Products() {
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [lowOnly, setLowOnly] = useState(false)
  const [editing, setEditing] = useState<Product | 'new' | null>(null)
  const [stockFor, setStockFor] = useState<Product | null>(null)
  const [movesFor, setMovesFor] = useState<Product | null>(null)

  const load = useCallback(async () => {
    const [p, c] = await Promise.all([
      supabase.from('products').select('*').order('name'),
      supabase.from('categories').select('*').order('name'),
    ])
    if (p.error) setError(errMsg(p.error))
    setProducts((p.data ?? []) as Product[])
    setCategories((c.data ?? []) as Category[])
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  async function toggle(p: Product) {
    if (p.active && !window.confirm(`¿Quitar “${p.name}” de la lista para vender? Puedes volver a activarlo cuando quieras.`)) return
    const { error } = await supabase.from('products').update({ active: !p.active }).eq('id', p.id)
    if (error) setError(errMsg(error)); else load()
  }

  const shown = products.filter((p) =>
    (showInactive || p.active) &&
    (!lowOnly || p.stock <= p.min_stock) &&
    (!catFilter || p.category_id === catFilter) &&
    p.name.toLowerCase().includes(search.toLowerCase()))
  const done = (msg?: string) => { setEditing(null); setStockFor(null); setNotice(msg ?? ''); load() }

  return (
    <>
      <PageTitle right={<Btn variant="good" onClick={() => setEditing('new')}>+ Agregar producto</Btn>}>Productos</PageTitle>
      <div className="space-y-3 mb-5">
        <input aria-label="Buscar producto" placeholder="🔍 Buscar producto…" value={search} onChange={(e) => setSearch(e.target.value)} className={`${inputCls} mt-0`} />
        <div className="flex flex-wrap gap-x-6 gap-y-3 items-center text-base">
          {categories.length > 0 && (
            <select aria-label="Categoría" value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="border-2 border-gray-300 rounded-xl px-3 py-2 bg-white">
              <option value="">Todas las categorías</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <label className="flex items-center gap-2"><input type="checkbox" className="h-6 w-6" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} /> Solo los que se están acabando</label>
          <label className="flex items-center gap-2"><input type="checkbox" className="h-6 w-6" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Ver también los quitados</label>
        </div>
      </div>
      <div className="space-y-3 mb-4">
        {notice && <Alert kind="ok">{notice}</Alert>}
        {error && <Alert>{error}</Alert>}
      </div>
      {loading ? <Empty>Cargando…</Empty> : shown.length === 0 ? (
        products.length === 0 ? (
          <div className="text-center py-10 space-y-4">
            <p className="text-2xl font-bold">Todavía no tienes productos</p>
            <p className="text-lg text-gray-700">Agrega el primero y escribe cuánto tienes para poder venderlo.</p>
            <Btn variant="good" onClick={() => setEditing('new')}>+ Agregar el primer producto</Btn>
          </div>
        ) : <Empty>No encontré productos con ese nombre</Empty>
      ) : (
        <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {shown.map((p) => {
            const empty = p.stock <= 0
            const low = !empty && p.stock <= p.min_stock
            return (
              <li key={p.id} className={`bg-white rounded-2xl border-2 border-gray-200 overflow-hidden flex flex-col ${p.active ? '' : 'opacity-60'}`}>
                <ProductPhoto name={p.name} url={p.image_url} className="w-full h-40 text-6xl" />
                <div className="p-4 space-y-3 flex-1 flex flex-col">
                  <div>
                    <h3 className="text-xl font-extrabold leading-tight">{p.name}{p.active ? '' : ' (quitado)'}</h3>
                    <p className="text-lg font-bold text-sol-900">{formatCOP(p.price)}{p.sale_mode === 'weight' ? ' el kilo' : ' cada uno'}</p>
                  </div>
                  <p className="text-lg">
                    Hay: <b>{formatQuantity(p.sale_mode, p.stock)}</b>
                    {empty && <span className="ml-2 text-sm font-bold bg-red-100 text-red-800 rounded-lg px-2 py-1">Sin existencias</span>}
                    {low && <span className="ml-2 text-sm font-bold bg-amber-100 text-amber-900 rounded-lg px-2 py-1">Se está acabando</span>}
                  </p>
                  <div className="mt-auto space-y-2">
                    <Btn variant="primary" className="w-full" onClick={() => setStockFor(p)}>Agregar existencias</Btn>
                    <div className="grid grid-cols-3 gap-2">
                      <Btn variant="ghost" className="px-2 text-base" onClick={() => setEditing(p)}>Editar</Btn>
                      <Btn variant="ghost" className="px-2 text-base" onClick={() => setMovesFor(p)}>Movimientos</Btn>
                      <Btn variant="ghost" className="px-2 text-base" onClick={() => toggle(p)}>{p.active ? 'Quitar' : 'Activar'}</Btn>
                    </div>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {editing && <ProductForm product={editing === 'new' ? null : editing} categories={categories} onDone={done} onClose={() => setEditing(null)} />}
      {stockFor && <StockForm product={stockFor} onDone={done} onClose={() => setStockFor(null)} />}
      {movesFor && <Movements product={movesFor} onClose={() => setMovesFor(null)} />}
    </>
  )
}
