import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { formatCOP } from '../lib/money'
import { errMsg, toInt, today } from '../lib/db'
import { useProfiles } from '../lib/hooks'
import { methodLabel, type Category, type Expense, type Method } from '../lib/types'
import { Alert, Btn, Empty, Field, Modal, PageTitle, inputCls } from '../components/ui'

export default function Expenses() {
  const [month, setMonth] = useState(today().slice(0, 7))
  const [rows, setRows] = useState<Expense[]>([])
  const [cats, setCats] = useState<Category[]>([])
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<Method>('cash')
  const [date, setDate] = useState(today())
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const profiles = useProfiles()

  const load = useCallback(async () => {
    const [y, m] = month.split('-').map(Number)
    const start = `${month}-01`
    const end = new Date(y, m, 0).getDate()
    const [e, c] = await Promise.all([
      supabase.from('expenses').select('*').gte('expense_date', start).lte('expense_date', `${month}-${String(end).padStart(2, '0')}`).order('expense_date', { ascending: false }),
      supabase.from('expense_categories').select('*').order('name'),
    ])
    if (e.error) setError(errMsg(e.error))
    setRows((e.data ?? []) as Expense[])
    setCats((c.data ?? []) as Category[])
  }, [month])
  useEffect(() => { load() }, [load])

  async function submit(e: FormEvent) {
    e.preventDefault()
    const a = toInt(amount)
    if (!Number.isInteger(a) || a <= 0) return setError('El valor debe ser un entero mayor que cero')
    setBusy(true); setError('')
    const { error } = await supabase.rpc('create_expense', {
      p_description: description.trim(), p_category_id: categoryId || null, p_amount: a,
      p_method: method, p_date: date, p_notes: notes.trim() || null,
    })
    setBusy(false)
    if (error) return setError(errMsg(error))
    setCreating(false); setDescription(''); setAmount(''); setNotes('')
    load()
  }

  const catName = (id: string | null) => cats.find((c) => c.id === id)?.name ?? 'Sin categoría'
  const total = rows.reduce((s, r) => s + r.amount, 0)

  return (
    <>
      <PageTitle right={<Btn onClick={() => { setCreating(true); setError('') }}>+ Registrar gasto</Btn>}>Gastos</PageTitle>
      <div className="flex flex-wrap gap-3 items-end mb-3">
        <label className="text-sm">Mes<input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="block border rounded-lg px-2 py-1.5 bg-white" /></label>
        <p className="text-sm ml-auto">Total del mes: <b>{formatCOP(total)}</b></p>
      </div>
      {!creating && error && <Alert>{error}</Alert>}
      {rows.length === 0 ? <Empty>No hay gastos en este mes</Empty> : (
        <div className="overflow-x-auto bg-white rounded-xl border">
          <table className="w-full text-sm">
            <thead className="text-left bg-sol-100"><tr><th className="p-2">Fecha</th><th className="p-2">Descripción</th><th className="p-2">Categoría</th><th className="p-2">Medio</th><th className="p-2">Valor</th><th className="p-2">Registró</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="p-2">{r.expense_date}</td>
                  <td className="p-2">{r.description}{r.notes ? <span className="text-xs text-gray-500"> · {r.notes}</span> : null}</td>
                  <td className="p-2">{catName(r.category_id)}</td><td className="p-2">{methodLabel[r.method]}</td>
                  <td className="p-2 font-semibold">{formatCOP(r.amount)}</td><td className="p-2">{profiles[r.user_id] ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {creating && (
        <Modal title="Registrar gasto" onClose={() => setCreating(false)}>
          <form onSubmit={submit} className="space-y-3">
            <Field label="Descripción"><input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} required /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Categoría">
                <select className={inputCls} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                  <option value="">Sin categoría</option>
                  {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <Field label="Valor (COP)"><input inputMode="numeric" className={inputCls} value={amount} onChange={(e) => setAmount(e.target.value)} required /></Field>
              <Field label="Medio de pago">
                <select className={inputCls} value={method} onChange={(e) => setMethod(e.target.value as Method)}>
                  <option value="cash">Efectivo</option><option value="transfer">Transferencia</option>
                </select>
              </Field>
              <Field label="Fecha"><input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} required /></Field>
            </div>
            <Field label="Observaciones (opcional)"><input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
            {error && <Alert>{error}</Alert>}
            <Btn disabled={busy} className="w-full">{busy ? 'Guardando…' : 'Guardar gasto'}</Btn>
          </form>
        </Modal>
      )}
    </>
  )
}
