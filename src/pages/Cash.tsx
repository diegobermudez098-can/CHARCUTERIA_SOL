import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { formatCOP } from '../lib/money'
import { errMsg, fmtDate, toInt } from '../lib/db'
import { useProfiles } from '../lib/hooks'
import { methodLabel, type CashMovement, type CashSession, type Method } from '../lib/types'
import { Alert, Btn, Empty, Field, PageTitle, inputCls } from '../components/ui'

const kindLabel: Record<string, string> = {
  opening: 'Fondo inicial', sale: 'Cobro de ventas', sale_void: 'Anulación de venta', debt_payment: 'Abonos de clientes', debt_payment_reversal: 'Reversión de abonos',
  expense: 'Gastos', withdrawal: 'Retiros', deposit: 'Ingresos',
}

export default function Cash() {
  const [session, setSession] = useState<CashSession | null>(null)
  const [moves, setMoves] = useState<CashMovement[]>([])
  const [past, setPast] = useState<CashSession[]>([])
  const [pendingDebt, setPendingDebt] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [float, setFloat] = useState('')
  const [counted, setCounted] = useState('')
  const [mKind, setMKind] = useState<'withdrawal' | 'deposit'>('withdrawal')
  const [mMethod, setMMethod] = useState<Method>('cash')
  const [mAmount, setMAmount] = useState('')
  const [mNote, setMNote] = useState('')
  const profiles = useProfiles()

  const load = useCallback(async () => {
    const [s, p, d] = await Promise.all([
      supabase.from('cash_sessions').select('*').is('closed_at', null).limit(1),
      supabase.from('cash_sessions').select('*').not('closed_at', 'is', null).order('closed_at', { ascending: false }).limit(10),
      supabase.from('debts').select('balance').eq('status', 'pending'),
    ])
    const open = ((s.data ?? [])[0] ?? null) as CashSession | null
    setSession(open)
    setPast((p.data ?? []) as CashSession[])
    setPendingDebt(((d.data ?? []) as { balance: number }[]).reduce((a, r) => a + r.balance, 0))
    if (open) {
      const m = await supabase.from('cash_movements').select('*').eq('session_id', open.id).order('created_at', { ascending: false })
      setMoves((m.data ?? []) as CashMovement[])
    } else setMoves([])
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  async function run(fn: () => PromiseLike<{ error: { message: string } | null }>, after?: () => void) {
    setError('')
    const { error } = await fn()
    if (error) return setError(errMsg(error))
    after?.(); load()
  }

  function open(e: FormEvent) {
    e.preventDefault()
    const f = toInt(float)
    if (!Number.isInteger(f) || f < 0) return setError('El fondo inicial debe ser un entero igual o mayor que cero')
    run(() => supabase.rpc('open_cash_session', { p_opening_float: f }), () => setFloat(''))
  }
  function close(e: FormEvent) {
    e.preventDefault()
    if (!session) return
    const c = toInt(counted)
    if (!Number.isInteger(c) || c < 0) return setError('El valor contado debe ser un entero igual o mayor que cero')
    if (!window.confirm('¿Cerrar la caja? Esta acción no se puede deshacer.')) return
    run(() => supabase.rpc('close_cash_session', { p_session_id: session.id, p_counted_cash: c, p_notes: null }), () => setCounted(''))
  }
  function movement(e: FormEvent) {
    e.preventDefault()
    const a = toInt(mAmount)
    if (!Number.isInteger(a) || a <= 0) return setError('El valor debe ser un entero mayor que cero')
    run(() => supabase.rpc('register_cash_movement', { p_kind: mKind, p_method: mMethod, p_amount: a, p_note: mNote }), () => { setMAmount(''); setMNote('') })
  }

  const sum = (kind: string, method: Method) => moves.filter((m) => m.kind === kind && m.method === method).reduce((s, m) => s + m.amount, 0)
  const expectedCash = moves.filter((m) => m.method === 'cash').reduce((s, m) => s + m.amount, 0)
  const expectedTransfer = moves.filter((m) => m.method === 'transfer').reduce((s, m) => s + m.amount, 0)
  const kinds = Object.keys(kindLabel).filter((k) => moves.some((m) => m.kind === k))

  if (loading) return <p>Cargando…</p>
  return (
    <>
      <PageTitle>Caja</PageTitle>
      {error && <div className="mb-3"><Alert>{error}</Alert></div>}

      {!session ? (
        <form onSubmit={open} className="bg-white rounded-xl border p-4 max-w-sm space-y-3">
          <p className="font-semibold">No hay caja abierta</p>
          <Field label="Fondo inicial en efectivo (COP)"><input inputMode="numeric" className={inputCls} value={float} onChange={(e) => setFloat(e.target.value)} required /></Field>
          <Btn className="w-full">Abrir caja</Btn>
        </form>
      ) : (
        <div className="grid lg:grid-cols-2 gap-4">
          <section className="bg-white rounded-xl border p-4 space-y-3">
            <p className="text-sm text-gray-600">Abierta {fmtDate(session.opened_at)} por {profiles[session.opened_by] ?? ''}</p>
            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="bg-sol-50 rounded-lg p-3"><p className="text-xs">Efectivo esperado</p><b className="text-lg">{formatCOP(expectedCash)}</b></div>
              <div className="bg-sol-50 rounded-lg p-3"><p className="text-xs">Transferencias</p><b className="text-lg">{formatCOP(expectedTransfer)}</b></div>
            </div>
            <p className="text-sm">Pendiente por cobrar (fiados): <b>{formatCOP(pendingDebt)}</b> — no es dinero en caja.</p>
            <table className="w-full text-sm">
              <thead className="text-left"><tr><th>Concepto</th><th>Efectivo</th><th>Transf.</th></tr></thead>
              <tbody>
                {kinds.map((k) => (
                  <tr key={k} className="border-t"><td className="py-1">{kindLabel[k]}</td><td>{formatCOP(sum(k, 'cash'))}</td><td>{formatCOP(sum(k, 'transfer'))}</td></tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-gray-500">Las transferencias reflejan lo que confirmó el usuario; no hay verificación bancaria automática.</p>
            <form onSubmit={close} className="border-t pt-3 space-y-2">
              <Field label="Efectivo contado al cierre (COP)"><input inputMode="numeric" className={inputCls} value={counted} onChange={(e) => setCounted(e.target.value)} required /></Field>
              {counted !== '' && Number.isInteger(toInt(counted)) && <p className="text-sm">Diferencia: <b>{formatCOP(toInt(counted) - expectedCash)}</b></p>}
              <Btn variant="danger" className="w-full">Cerrar caja</Btn>
            </form>
          </section>

          <section className="space-y-4">
            <form onSubmit={movement} className="bg-white rounded-xl border p-4 space-y-2">
              <p className="font-semibold">Retiro o ingreso manual</p>
              <div className="grid grid-cols-2 gap-2">
                <select className={inputCls} value={mKind} onChange={(e) => setMKind(e.target.value as 'withdrawal' | 'deposit')}>
                  <option value="withdrawal">Retiro</option><option value="deposit">Ingreso</option>
                </select>
                <select className={inputCls} value={mMethod} onChange={(e) => setMMethod(e.target.value as Method)}>
                  <option value="cash">Efectivo</option><option value="transfer">Transferencia</option>
                </select>
              </div>
              <input placeholder="Valor" inputMode="numeric" className={inputCls} value={mAmount} onChange={(e) => setMAmount(e.target.value)} required />
              <input placeholder="Motivo" className={inputCls} value={mNote} onChange={(e) => setMNote(e.target.value)} required minLength={3} />
              <Btn className="w-full">Registrar</Btn>
            </form>
            <div className="bg-white rounded-xl border p-4">
              <p className="font-semibold mb-2">Movimientos del turno</p>
              {moves.length === 0 ? <Empty>Sin movimientos</Empty> : (
                <ul className="divide-y text-sm max-h-72 overflow-y-auto">
                  {moves.map((m) => (
                    <li key={m.id} className="py-1 flex justify-between gap-2">
                      <span>{kindLabel[m.kind] ?? m.kind} · {methodLabel[m.method]}{m.note ? ` · ${m.note}` : ''}<br /><span className="text-xs text-gray-500">{fmtDate(m.created_at)} · {profiles[m.user_id] ?? ''}</span></span>
                      <b className={m.amount < 0 ? 'text-red-600' : 'text-green-700'}>{formatCOP(m.amount)}</b>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      )}

      <h3 className="font-bold mt-6 mb-2">Cierres anteriores</h3>
      {past.length === 0 ? <Empty>Aún no hay cierres</Empty> : (
        <div className="overflow-x-auto bg-white rounded-xl border">
          <table className="w-full text-sm">
            <thead className="text-left bg-sol-100"><tr><th className="p-2">Cierre</th><th className="p-2">Esperado</th><th className="p-2">Contado</th><th className="p-2">Diferencia</th></tr></thead>
            <tbody>
              {past.map((s) => (
                <tr key={s.id} className="border-t">
                  <td className="p-2">{s.closed_at ? fmtDate(s.closed_at) : ''}</td><td className="p-2">{formatCOP(s.expected_cash ?? 0)}</td>
                  <td className="p-2">{formatCOP(s.counted_cash ?? 0)}</td>
                  <td className={`p-2 font-semibold ${(s.difference ?? 0) === 0 ? '' : 'text-red-600'}`}>{formatCOP(s.difference ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
