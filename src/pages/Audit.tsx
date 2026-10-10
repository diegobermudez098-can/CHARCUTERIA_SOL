import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { errMsg, fmtDate } from '../lib/db'
import { useProfiles } from '../lib/hooks'
import type { AuditRow } from '../lib/types'
import { Alert, Empty, PageTitle } from '../components/ui'

const tables: [string, string][] = [
  ['', 'Todas'], ['sales', 'Ventas'], ['products', 'Productos'], ['debt_payments', 'Abonos'],
  ['cash_sessions', 'Caja'], ['expenses', 'Gastos'], ['orders', 'Pedidos'], ['customers', 'Clientes'],
]

export default function Audit() {
  const [table, setTable] = useState('')
  const [rows, setRows] = useState<AuditRow[] | null>(null)
  const [error, setError] = useState('')
  const profiles = useProfiles()

  useEffect(() => {
    setRows(null)
    let q = supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(200)
    if (table) q = q.eq('table_name', table)
    q.then(({ data, error }: { data: unknown; error: { message: string } | null }) => {
      if (error) setError(errMsg(error))
      setRows((data ?? []) as AuditRow[])
    })
  }, [table])

  return (
    <>
      <PageTitle>Historial de acciones</PageTitle>
      <p className="text-sm text-gray-600 mb-3">Registro de solo consulta. Muestra las últimas 200 acciones.</p>
      <select value={table} onChange={(e) => setTable(e.target.value)} className="border rounded-lg px-3 py-2 text-sm bg-white mb-3">
        {tables.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      {error && <Alert>{error}</Alert>}
      {!rows ? <p>Cargando…</p> : rows.length === 0 ? <Empty>Sin registros</Empty> : (
        <ul className="bg-white rounded-xl border divide-y text-sm">
          {rows.map((r) => (
            <li key={r.id} className="p-2">
              <div className="flex justify-between gap-2">
                <span><b>{r.action}</b> · {r.table_name}{r.reason ? ` · ${r.reason}` : ''}</span>
                <span className="text-xs text-gray-500 text-right">{fmtDate(r.created_at)}<br />{r.user_id ? profiles[r.user_id] ?? '' : 'Sistema / público'}</span>
              </div>
              {(r.old_values != null || r.new_values != null) && (
                <details className="text-xs text-gray-600">
                  <summary className="cursor-pointer">Ver valores</summary>
                  {r.old_values != null && <pre className="whitespace-pre-wrap">Antes: {JSON.stringify(r.old_values)}</pre>}
                  {r.new_values != null && <pre className="whitespace-pre-wrap">Después: {JSON.stringify(r.new_values)}</pre>}
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
