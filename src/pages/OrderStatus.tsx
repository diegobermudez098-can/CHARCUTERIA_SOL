import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatCOP, formatQuantity } from '../lib/money'
import { fmtDate } from '../lib/db'
import { orderStatusLabel, type OrderStatus as Status, type PublicOrderStatus } from '../lib/types'
import { Alert, Btn } from '../components/ui'

const steps: Status[] = ['received', 'confirmed', 'preparing', 'ready', 'delivered']

export default function OrderStatus() {
  const { token } = useParams()
  const [order, setOrder] = useState<PublicOrderStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.rpc('get_order_status', { p_token: token })
    setNotFound(!!error || !data)
    setOrder((data ?? null) as PublicOrderStatus | null)
    setLoading(false)
  }, [token])
  useEffect(() => { load() }, [load])

  const current = order ? steps.indexOf(order.status) : -1
  return (
    <main className="min-h-screen bg-sol-50 p-4 flex items-start justify-center">
      <div className="bg-white rounded-2xl shadow p-6 max-w-md w-full space-y-3 mt-8">
        <h1 className="text-2xl font-bold text-sol-700">Estado de tu pedido</h1>
        {loading && <p>Cargando…</p>}
        {!loading && notFound && <Alert>No encontramos ese pedido. Revisa que el enlace esté completo.</Alert>}
        {order && (
          <>
            <p>Pedido <b>#{order.number}</b> · {fmtDate(order.created_at)}</p>
            {order.status === 'cancelled' ? <Alert>Este pedido fue cancelado.</Alert> : (
              <ol className="space-y-1">
                {steps.map((s, i) => (
                  <li key={s} className={`text-sm rounded px-2 py-1 ${i === current ? 'bg-sol-100 font-bold' : i < current ? 'text-green-700' : 'text-gray-400'}`}>
                    {i < current ? '✓ ' : i === current ? '● ' : '○ '}{orderStatusLabel[s]}
                  </li>
                ))}
              </ol>
            )}
            <ul className="divide-y border-y text-sm">
              {order.items.map((i, k) => (
                <li key={k} className="py-1 flex justify-between gap-2"><span>{i.product_name} · {formatQuantity(i.sale_mode, i.quantity)}</span><span>{formatCOP(i.line_total)}</span></li>
              ))}
            </ul>
            {order.delivery_fee > 0 && <p className="flex justify-between text-sm"><span>Domicilio</span><span>{formatCOP(order.delivery_fee)}</span></p>}
            <p className="flex justify-between font-bold"><span>Total estimado</span><span>{formatCOP(order.estimated_total + order.delivery_fee)}</span></p>
          </>
        )}
        <div className="flex gap-2">
          <Btn variant="ghost" onClick={load}>Actualizar</Btn>
          <Link to="/tienda" className="rounded-lg px-3 py-2 text-sm font-semibold border bg-white">Volver a la tienda</Link>
        </div>
      </div>
    </main>
  )
}
