import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { formatCOP } from '../lib/money'
import { bogotaRange, errMsg, fmtDate, today } from '../lib/db'
import { useProfiles } from '../lib/hooks'
import type { Sale } from '../lib/types'
import { Alert, Btn, Empty, Field, Modal, PageTitle, inputCls } from '../components/ui'
import Receipt from '../components/Receipt'

export default function SalesHistory() {
  const [from, setFrom] = useState(today())
  const [to, setTo] = useState(today())
  const [rows, setRows] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [view, setView] = useState<string | null>(null)
  const [voiding, setVoiding] = useState<Sale | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const profiles = useProfiles()

  const load = useCallback(async () => {
    setLoading(true)
    const [a, b] = bogotaRange(from, to)
    const { data, error } = await supabase.from('sales').select('*').gte('created_at', a).lte('created_at', b)
      .order('created_at', { ascending: false })
    if (error) setError(errMsg(error))
    setRows((data ?? []) as Sale[])
    setLoading(false)
  }, [from, to])
  useEffect(() => { load() }, [load])

  async function doVoid(e: FormEvent) {
    e.preventDefault()
    if (!voiding) return
    setBusy(true)
    const { error } = await supabase.rpc('void_sale', { p_sale_id: voiding.id, p_reason: reason })
    setBusy(false)
    if (error) return setError(errMsg(error))
    setVoiding(null); setReason(''); setError(''); load()
  }

  const totalOk = rows.filter((r) => r.status === 'completed').reduce((s, r) => s + r.total, 0)

  return (
    <>
      <PageTitle>Ventas</PageTitle>
      <div className="flex flex-wrap gap-3 items-end mb-3">
        <label className="text-sm">Desde<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="block border rounded-lg px-2 py-1.5 bg-white" /></label>
        <label className="text-sm">Hasta<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="block border rounded-lg px-2 py-1.5 bg-white" /></label>
        <p className="text-sm ml-auto">Vendido (sin anuladas): <b>{formatCOP(totalOk)}</b></p>
      </div>
      {error && <Alert>{error}</Alert>}
      {loading ? <p>Cargando…</p> : rows.length === 0 ? <Empty>No hay ventas en este período</Empty> : (
        <div className="overflow-x-auto bg-white rounded-xl border">
          <table className="w-full text-sm">
            <thead className="text-left bg-sol-100"><tr>
              <th className="p-2">N°</th><th className="p-2">Fecha</th><th className="p-2">Usuario</th>
              <th className="p-2">Total</th><th className="p-2">Pendiente</th><th className="p-2">Estado</th><th className="p-2" />
            </tr></thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className="border-t">
                  <td className="p-2">#{s.number}</td><td className="p-2">{fmtDate(s.created_at)}</td>
                  <td className="p-2">{profiles[s.user_id] ?? ''}</td><td className="p-2">{formatCOP(s.total)}</td>
                  <td className="p-2">{s.pending > 0 ? formatCOP(s.pending) : '—'}</td>
                  <td className="p-2">{s.status === 'voided' ? <span className="text-red-600">Anulada{s.void_reason ? ` (${s.void_reason})` : ''}</span> : 'Completada'}</td>
                  <td className="p-2 whitespace-nowrap space-x-1">
                    <Btn variant="ghost" onClick={() => setView(s.id)}>Ver</Btn>
                    {s.status === 'completed' && <Btn variant="danger" onClick={() => { setVoiding(s); setError('') }}>Anular</Btn>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {view && <Receipt saleId={view} onClose={() => setView(null)} />}
      {voiding && (
        <Modal title={`Anular venta #${voiding.number}`} onClose={() => setVoiding(null)}>
          <p className="text-sm">Se devolverán las existencias y se revertirán los pagos. La venta queda en el historial.</p>
          <form onSubmit={doVoid} className="space-y-3">
            <Field label="Motivo de la anulación"><input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} required minLength={3} /></Field>
            {error && <Alert>{error}</Alert>}
            <Btn variant="danger" disabled={busy} className="w-full">{busy ? 'Anulando…' : 'Confirmar anulación'}</Btn>
          </form>
        </Modal>
      )}
    </>
  )
}
