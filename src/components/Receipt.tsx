import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatCOP, formatQuantity } from '../lib/money'
import { errMsg, fmtDate } from '../lib/db'
import { methodLabel, type SaleFull } from '../lib/types'
import { Alert, Btn, Modal } from './ui'

export default function Receipt({ saleId, onClose }: { saleId: string; onClose: () => void }) {
  const [sale, setSale] = useState<SaleFull | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.from('sales').select('*, sale_items(*), sale_payments(*)').eq('id', saleId).single()
      .then(({ data, error }) => (error ? setError(errMsg(error)) : setSale(data as SaleFull)))
  }, [saleId])

  return (
    <Modal title={sale ? `Comprobante #${sale.number}` : 'Comprobante'} onClose={onClose}>
      {error && <Alert>{error}</Alert>}
      {!sale && !error && <p className="text-sm">Cargando…</p>}
      {sale && (
        <div className="text-sm space-y-2">
          <p className="text-gray-600">{fmtDate(sale.created_at)} · {sale.status === 'voided' ? 'ANULADA' : 'Completada'}</p>
          <ul className="divide-y border-y">
            {sale.sale_items.map((i) => (
              <li key={i.id} className="py-1 flex justify-between gap-2">
                <span>{i.product_name} · {formatQuantity(i.sale_mode, i.quantity)}</span>
                <span>{formatCOP(i.line_total)}</span>
              </li>
            ))}
          </ul>
          {sale.discount > 0 && <p className="flex justify-between"><span>Descuento</span><span>-{formatCOP(sale.discount)}</span></p>}
          <p className="flex justify-between font-bold text-base"><span>Total</span><span>{formatCOP(sale.total)}</span></p>
          {sale.sale_payments.map((p) => (
            <p key={p.id} className="flex justify-between"><span>{methodLabel[p.method]}</span><span>{formatCOP(p.amount)}</span></p>
          ))}
          {sale.pending > 0 && <p className="flex justify-between text-amber-700"><span>Saldo fiado</span><span>{formatCOP(sale.pending)}</span></p>}
          <Btn variant="ghost" onClick={() => window.print()} className="print:hidden">Imprimir</Btn>
        </div>
      )}
    </Modal>
  )
}
