import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { formatCOP, formatQuantity } from '../lib/money'
import { errMsg, fmtDate, toInt } from '../lib/db'
import { useProfiles } from '../lib/hooks'
import type { Category, InventoryMovement, Product, SaleMode } from '../lib/types'
import { Alert, Btn, Empty, Field, Modal, PageTitle, inputCls } from '../components/ui'

function ProductForm({ product, categories, onDone, onClose }: {
  product: Product | null; categories: Category[]; onDone: () => void; onClose: () => void
}) {
  const [name, setName] = useState(product?.name ?? '')
  const [description, setDescription] = useState(product?.description ?? '')
  const [categoryId, setCategoryId] = useState(product?.category_id ?? '')
  const [newCategory, setNewCategory] = useState('')
  const [mode, setMode] = useState<SaleMode>(product?.sale_mode ?? 'weight')
  const [price, setPrice] = useState(String(product?.price ?? ''))
  const [cost, setCost] = useState(String(product?.cost ?? ''))
  const [minStock, setMinStock] = useState(String(product?.min_stock ?? '0'))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    const p = toInt(price), c = toInt(cost), m = toInt(minStock)
    if (!name.trim()) return setError('El nombre es obligatorio')
    if (![p, c, m].every((n) => Number.isInteger(n) && n >= 0)) return setError('Precio, costo y stock mínimo deben ser números enteros iguales o mayores que cero')
    setBusy(true)
    try {
      let catId: string | null = categoryId || null
      if (newCategory.trim()) {
        const { data, error } = await supabase.from('categories').insert({ name: newCategory.trim() }).select().single()
        if (error) throw error
        catId = (data as Category).id
      }
      const base = { name: name.trim(), description: description.trim() || null, category_id: catId, price: p, cost: c, min_stock: m }
      const res = product
        ? await supabase.from('products').update(base).eq('id', product.id)
        : await supabase.from('products').insert({ ...base, sale_mode: mode })
      if (res.error) throw res.error
      onDone()
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setBusy(false)
    }
  }

  const unit = mode === 'weight' ? 'por kilogramo' : 'por unidad'
  return (
    <Modal title={product ? 'Editar producto' : 'Nuevo producto'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Nombre"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required /></Field>
        <Field label="Descripción (opcional)"><input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Categoría">
            <select className={inputCls} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Sin categoría</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="o crear categoría"><input className={inputCls} value={newCategory} onChange={(e) => setNewCategory(e.target.value)} /></Field>
        </div>
        <Field label="Modalidad de venta">
          <select className={inputCls} value={mode} onChange={(e) => setMode(e.target.value as SaleMode)} disabled={!!product}>
            <option value="weight">Por peso (kg / gramos)</option>
            <option value="unit">Por unidad</option>
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Precio de venta ${unit} (COP)`}><input inputMode="numeric" className={inputCls} value={price} onChange={(e) => setPrice(e.target.value)} required /></Field>
          <Field label={`Costo ${unit} (COP)`}><input inputMode="numeric" className={inputCls} value={cost} onChange={(e) => setCost(e.target.value)} required /></Field>
        </div>
        <Field label={`Stock mínimo (${mode === 'weight' ? 'gramos' : 'unidades'})`}>
          <input inputMode="numeric" className={inputCls} value={minStock} onChange={(e) => setMinStock(e.target.value)} />
        </Field>
        {!product && <p className="text-xs text-gray-500">Las existencias iniciales se registran después con “Entrada”.</p>}
        {error && <Alert>{error}</Alert>}
        <Btn disabled={busy} className="w-full">{busy ? 'Guardando…' : 'Guardar'}</Btn>
      </form>
    </Modal>
  )
}

function StockForm({ product, onDone, onClose }: { product: Product; onDone: () => void; onClose: () => void }) {
  const [kind, setKind] = useState<'entry' | 'adjustment'>('entry')
  const [qty, setQty] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const unit = product.sale_mode === 'weight' ? 'gramos' : 'unidades'

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    const q = toInt(qty)
    if (!Number.isInteger(q) || q === 0) return setError('La cantidad debe ser un número entero distinto de cero')
    if (kind === 'entry' && q < 0) return setError('Una entrada debe ser positiva')
    setBusy(true)
    const { error } = await supabase.rpc('register_inventory_movement', {
      p_product_id: product.id, p_kind: kind, p_quantity: q, p_reason: reason.trim() || null,
    })
    setBusy(false)
    if (error) return setError(errMsg(error))
    onDone()
  }

  return (
    <Modal title={`Inventario · ${product.name}`} onClose={onClose}>
      <p className="text-sm">Existencias actuales: <b>{formatQuantity(product.sale_mode, product.stock)}</b></p>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Tipo">
          <select className={inputCls} value={kind} onChange={(e) => setKind(e.target.value as 'entry' | 'adjustment')}>
            <option value="entry">Entrada de mercancía</option>
            <option value="adjustment">Ajuste (puede ser negativo)</option>
          </select>
        </Field>
        <Field label={`Cantidad en ${unit}`}><input inputMode="numeric" className={inputCls} value={qty} onChange={(e) => setQty(e.target.value)} required /></Field>
        <Field label={kind === 'adjustment' ? 'Motivo (obligatorio)' : 'Nota (opcional)'}>
          <input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} required={kind === 'adjustment'} />
        </Field>
        {error && <Alert>{error}</Alert>}
        <Btn disabled={busy} className="w-full">{busy ? 'Guardando…' : 'Registrar'}</Btn>
      </form>
    </Modal>
  )
}

const kindLabel: Record<string, string> = { entry: 'Entrada', adjustment: 'Ajuste', sale: 'Venta', sale_void: 'Anulación' }

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
      {!rows ? <p className="text-sm">Cargando…</p> : rows.length === 0 ? <Empty>Sin movimientos todavía</Empty> : (
        <ul className="divide-y text-sm">
          {rows.map((m) => (
            <li key={m.id} className="py-2 flex justify-between gap-2">
              <span>
                {kindLabel[m.kind] ?? m.kind}{m.reason ? ` · ${m.reason}` : ''}
                <br /><span className="text-xs text-gray-500">{fmtDate(m.created_at)} · {profiles[m.user_id] ?? ''}</span>
              </span>
              <b className={m.quantity < 0 ? 'text-red-600' : 'text-green-700'}>{m.quantity < 0 ? '-' : '+'}{formatQuantity(product.sale_mode, Math.abs(m.quantity))}</b>
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
    const { error } = await supabase.from('products').update({ active: !p.active }).eq('id', p.id)
    if (error) setError(errMsg(error)); else load()
  }

  const shown = products.filter((p) =>
    (showInactive || p.active) &&
    (!lowOnly || p.stock <= p.min_stock) &&
    (!catFilter || p.category_id === catFilter) &&
    p.name.toLowerCase().includes(search.toLowerCase()))
  const catName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? '—'
  const done = () => { setEditing(null); setStockFor(null); load() }

  return (
    <>
      <PageTitle right={<Btn onClick={() => setEditing('new')}>+ Nuevo producto</Btn>}>Productos</PageTitle>
      <div className="flex flex-wrap gap-3 items-center mb-3 text-sm">
        <input placeholder="Buscar producto…" value={search} onChange={(e) => setSearch(e.target.value)} className="border rounded-lg px-3 py-2 bg-white" />
        <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="border rounded-lg px-3 py-2 bg-white">
          <option value="">Todas las categorías</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <label className="flex items-center gap-1"><input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} /> Solo stock bajo</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Mostrar inactivos</label>
      </div>
      {error && <Alert>{error}</Alert>}
      {loading ? <p>Cargando…</p> : shown.length === 0 ? <Empty>No hay productos para mostrar</Empty> : (
        <div className="overflow-x-auto bg-white rounded-xl border">
          <table className="w-full text-sm">
            <thead className="text-left bg-sol-100"><tr>
              <th className="p-2">Producto</th><th className="p-2">Categoría</th><th className="p-2">Precio</th>
              <th className="p-2">Costo</th><th className="p-2">Existencias</th><th className="p-2">Acciones</th>
            </tr></thead>
            <tbody>
              {shown.map((p) => {
                const low = p.stock <= p.min_stock
                return (
                  <tr key={p.id} className={`border-t ${p.active ? '' : 'opacity-50'}`}>
                    <td className="p-2 font-medium">{p.name}<br /><span className="text-xs text-gray-500">{p.sale_mode === 'weight' ? 'Por peso' : 'Por unidad'}{p.active ? '' : ' · inactivo'}</span></td>
                    <td className="p-2">{catName(p.category_id)}</td>
                    <td className="p-2">{formatCOP(p.price)}{p.sale_mode === 'weight' ? '/kg' : ''}</td>
                    <td className="p-2">{formatCOP(p.cost)}{p.sale_mode === 'weight' ? '/kg' : ''}</td>
                    <td className="p-2">{formatQuantity(p.sale_mode, p.stock)}{low && <span className="ml-1 text-xs bg-red-100 text-red-700 rounded px-1">bajo</span>}</td>
                    <td className="p-2 whitespace-nowrap space-x-1">
                      <Btn variant="ghost" onClick={() => setStockFor(p)}>Inventario</Btn>
                      <Btn variant="ghost" onClick={() => setMovesFor(p)}>Historial</Btn>
                      <Btn variant="ghost" onClick={() => setEditing(p)}>Editar</Btn>
                      <Btn variant="ghost" onClick={() => toggle(p)}>{p.active ? 'Desactivar' : 'Activar'}</Btn>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {editing && <ProductForm product={editing === 'new' ? null : editing} categories={categories} onDone={done} onClose={() => setEditing(null)} />}
      {stockFor && <StockForm product={stockFor} onDone={done} onClose={() => setStockFor(null)} />}
      {movesFor && <Movements product={movesFor} onClose={() => setMovesFor(null)} />}
    </>
  )
}
