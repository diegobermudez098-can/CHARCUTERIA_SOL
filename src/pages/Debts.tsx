import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatCOP } from '../lib/money'
import { errMsg } from '../lib/db'
import { BUSINESS_NAME } from '../lib/brand'
import type { Customer } from '../lib/types'
import { Alert, Empty, PageTitle } from '../components/ui'
import { CustomerDetail } from './Customers'

interface Debtor { customer: Customer; total: number; since: string }

function daysText(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  return d <= 0 ? 'desde hoy' : d === 1 ? 'desde ayer' : `desde hace ${d} días`
}

/** Enlace de WhatsApp con un recordatorio amable. null si el cliente no tiene teléfono. */
function whatsappLink(d: Debtor): string | null {
  const digits = (d.customer.phone ?? '').replace(/\D/g, '')
  if (digits.length < 10) return null
  const number = digits.length === 10 ? `57${digits}` : digits
  const text = `Hola ${d.customer.name}, te escribimos de ${BUSINESS_NAME}. Tienes un saldo pendiente de ${formatCOP(d.total)}. ¡Gracias!`
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`
}

export default function Debts() {
  const [rows, setRows] = useState<Debtor[] | null>(null)
  const [selected, setSelected] = useState<Customer | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const [c, d] = await Promise.all([
      supabase.from('customers').select('*'),
      supabase.from('debts').select('customer_id, balance, created_at').eq('status', 'pending'),
    ])
    if (c.error) setError(errMsg(c.error))
    if (d.error) setError(errMsg(d.error))
    const byId = new Map(((c.data ?? []) as Customer[]).map((x) => [x.id, x]))
    const acc = new Map<string, Debtor>()
    for (const r of (d.data ?? []) as { customer_id: string; balance: number; created_at: string }[]) {
      const customer = byId.get(r.customer_id)
      if (!customer) continue
      const cur = acc.get(r.customer_id)
      if (cur) { cur.total += r.balance; if (r.created_at < cur.since) cur.since = r.created_at }
      else acc.set(r.customer_id, { customer, total: r.balance, since: r.created_at })
    }
    setRows([...acc.values()].sort((a, b) => b.total - a.total))
  }, [])
  useEffect(() => { load() }, [load])

  const total = (rows ?? []).reduce((s, r) => s + r.total, 0)

  return (
    <>
      <PageTitle>Quién me debe</PageTitle>
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}
      {rows === null ? <Empty>Cargando…</Empty> : rows.length === 0 ? (
        <div className="bg-white rounded-2xl border-2 border-green-600 text-center p-8">
          <p className="text-2xl font-extrabold text-green-700">Nadie te debe nada 🎉</p>
          <p className="text-lg text-gray-700 mt-2">Cuando vendas “Fiado”, el cliente aparecerá aquí.</p>
        </div>
      ) : (
        <>
          <div className="bg-amber-50 border-2 border-amber-500 rounded-2xl p-5 mb-5">
            <p className="text-lg font-semibold text-amber-900">En total te deben</p>
            <p className="text-4xl font-extrabold text-amber-900">{formatCOP(total)}</p>
            <p className="text-base text-amber-900">{rows.length === 1 ? '1 cliente' : `${rows.length} clientes`}</p>
          </div>
          <ul className="space-y-3">
            {rows.map((r) => {
              const wa = whatsappLink(r)
              return (
                <li key={r.customer.id} className="bg-white rounded-2xl border-2 border-gray-200 p-4 flex flex-wrap items-center gap-3">
                  <div className="flex-1 min-w-[12rem]">
                    <p className="text-xl font-extrabold">{r.customer.name}</p>
                    <p className="text-base text-gray-600">{r.customer.phone ?? 'Sin teléfono'} · {daysText(r.since)}</p>
                  </div>
                  <p className="text-2xl font-extrabold text-amber-800">{formatCOP(r.total)}</p>
                  <div className="flex gap-2 w-full sm:w-auto">
                    <button onClick={() => setSelected(r.customer)} className="flex-1 rounded-xl border-2 border-transparent bg-sol-700 hover:bg-sol-900 text-white px-4 py-3 text-lg font-bold">Ver y abonar</button>
                    {wa && <a href={wa} target="_blank" rel="noreferrer" className="flex-1 text-center rounded-xl border-2 border-green-700 text-green-800 hover:bg-green-50 px-4 py-3 text-lg font-bold">WhatsApp</a>}
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}
      {selected && <CustomerDetail customer={selected} onChanged={load} onClose={() => setSelected(null)} />}
    </>
  )
}
