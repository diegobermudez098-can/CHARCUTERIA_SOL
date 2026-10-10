import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatCOP, formatQuantity } from '../lib/money'
import { bogotaRange, errMsg, fmtDate, today } from '../lib/db'
import { downloadCSV } from '../lib/csv'
import { useProfiles } from '../lib/hooks'
import type { Product, Sale, SaleMode } from '../lib/types'
import { Alert, Btn, Empty, PageTitle } from '../components/ui'

interface Summary {
  sales_count: number; sales_total: number; discounts: number; cogs: number; gross_profit: number
  expenses_total: number; net_result: number; credit_sales: number; debt_payments_received: number
  received_cash: number; received_transfer: number; pending_total: number
}
interface Top { product_name: string; sale_mode: SaleMode; quantity: number; revenue: number; cost: number }

function Card({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-white rounded-xl border p-3">
      <p className="text-xs text-gray-600">{label}</p>
      <p className="text-xl font-bold">{value}</p>
      {hint && <p className="text-xs text-gray-500">{hint}</p>}
    </div>
  )
}

export default function Reports() {
  const [from, setFrom] = useState(`${today().slice(0, 7)}-01`)
  const [to, setTo] = useState(today())
  const [sum, setSum] = useState<Summary | null>(null)
  const [top, setTop] = useState<Top[]>([])
  const [stock, setStock] = useState<Product[]>([])
  const [error, setError] = useState('')
  const profiles = useProfiles()

  const load = useCallback(async () => {
    setError('')
    const [s, t, p] = await Promise.all([
      supabase.rpc('report_summary', { p_from: from, p_to: to }),
      supabase.rpc('report_top_products', { p_from: from, p_to: to }),
      supabase.from('products').select('*').eq('active', true).order('name'),
    ])
    if (s.error) setError(errMsg(s.error))
    setSum((s.data ?? null) as Summary | null)
    setTop(((t.data ?? []) as Top[]).map((r) => ({ ...r, quantity: Number(r.quantity), revenue: Number(r.revenue), cost: Number(r.cost) })))
    setStock((p.data ?? []) as Product[])
  }, [from, to])
  useEffect(() => { if (from <= to) load() }, [load, from, to])

  async function exportSales() {
    const [a, b] = bogotaRange(from, to)
    const { data, error } = await supabase.from('sales').select('*').gte('created_at', a).lte('created_at', b).order('created_at')
    if (error) return setError(errMsg(error))
    const rows = (data as Sale[]).map((s) => [s.number, fmtDate(s.created_at), profiles[s.user_id] ?? '', s.status === 'voided' ? 'Anulada' : 'Completada', s.subtotal, s.discount, s.total, s.pending])
    downloadCSV(`ventas_${from}_${to}.csv`, [['Número', 'Fecha', 'Usuario', 'Estado', 'Subtotal COP', 'Descuento COP', 'Total COP', 'Pendiente COP'], ...rows])
  }
  const exportTop = () => downloadCSV(`mas_vendidos_${from}_${to}.csv`, [
    ['Producto', 'Modalidad', 'Cantidad (g o und)', 'Ingresos COP', 'Costo COP'],
    ...top.map((t) => [t.product_name, t.sale_mode === 'weight' ? 'Peso' : 'Unidad', t.quantity, t.revenue, t.cost]),
  ])
  const exportStock = () => downloadCSV(`existencias_${today()}.csv`, [
    ['Producto', 'Modalidad', 'Existencias (g o und)', 'Stock mínimo', 'Stock bajo'],
    ...stock.map((p) => [p.name, p.sale_mode === 'weight' ? 'Peso' : 'Unidad', p.stock, p.min_stock, p.stock <= p.min_stock ? 'Sí' : 'No']),
  ])

  const low = stock.filter((p) => p.stock <= p.min_stock)

  return (
    <>
      <PageTitle>Reportes</PageTitle>
      <div className="flex flex-wrap gap-3 items-end mb-3">
        <label className="text-sm">Desde<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="block border rounded-lg px-2 py-1.5 bg-white" /></label>
        <label className="text-sm">Hasta<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="block border rounded-lg px-2 py-1.5 bg-white" /></label>
        <Btn variant="ghost" onClick={() => { setFrom(today()); setTo(today()) }}>Hoy</Btn>
        <Btn variant="ghost" onClick={exportSales}>Exportar ventas (CSV)</Btn>
      </div>
      {from > to && <Alert>La fecha inicial no puede ser posterior a la final.</Alert>}
      {error && <Alert>{error}</Alert>}

      {sum && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card label="Vendido" value={formatCOP(sum.sales_total)} hint={`${sum.sales_count} ventas completadas`} />
            <Card label="Recibido en efectivo" value={formatCOP(sum.received_cash)} />
            <Card label="Recibido por transferencia" value={formatCOP(sum.received_transfer)} hint="según confirmación del usuario" />
            <Card label="Ventas fiadas" value={formatCOP(sum.credit_sales)} />
            <Card label="Abonos recibidos" value={formatCOP(sum.debt_payments_received)} hint="no suman como ventas" />
            <Card label="Por cobrar (hoy)" value={formatCOP(sum.pending_total)} hint="saldo total de fiados" />
            <Card label="Costo estimado vendido" value={formatCOP(sum.cogs)} />
            <Card label="Ganancia bruta estimada" value={formatCOP(sum.gross_profit)} />
            <Card label="Gastos del período" value={formatCOP(sum.expenses_total)} />
            <Card label="Resultado estimado" value={formatCOP(sum.net_result)} hint="después de gastos" />
            <Card label="Descuentos otorgados" value={formatCOP(sum.discounts)} />
          </div>
          <div className="text-xs text-gray-600 bg-white border rounded-xl p-3 mt-3 space-y-1">
            <p><b>Definiciones.</b> Vendido = total de ventas completadas (no anuladas) en el período, incluyendo lo fiado. Recibido = dinero que efectivamente entró (cobros de ventas + abonos − anulaciones/reversiones).</p>
            <p>Costo = costo del producto registrado al momento de cada venta. Ganancia bruta estimada = vendido − costo. Resultado estimado = ganancia bruta − gastos registrados en el período.</p>
            <p>Son estimaciones de gestión, no estados financieros certificados.</p>
          </div>
        </>
      )}

      <div className="flex items-center justify-between mt-6 mb-2"><h3 className="font-bold">Productos más vendidos</h3><Btn variant="ghost" onClick={exportTop} disabled={top.length === 0}>Exportar (CSV)</Btn></div>
      {top.length === 0 ? <Empty>Sin ventas en este período</Empty> : (
        <div className="overflow-x-auto bg-white rounded-xl border">
          <table className="w-full text-sm">
            <thead className="text-left bg-sol-100"><tr><th className="p-2">Producto</th><th className="p-2">Cantidad</th><th className="p-2">Ingresos</th><th className="p-2">Costo</th></tr></thead>
            <tbody>{top.map((t) => (
              <tr key={`${t.product_name}-${t.sale_mode}`} className="border-t"><td className="p-2">{t.product_name}</td>
                <td className="p-2">{formatQuantity(t.sale_mode, t.quantity)}</td><td className="p-2">{formatCOP(t.revenue)}</td><td className="p-2">{formatCOP(t.cost)}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between mt-6 mb-2"><h3 className="font-bold">Existencias actuales ({low.length} con stock bajo)</h3><Btn variant="ghost" onClick={exportStock} disabled={stock.length === 0}>Exportar (CSV)</Btn></div>
      {stock.length === 0 ? <Empty>No hay productos activos</Empty> : (
        <div className="overflow-x-auto bg-white rounded-xl border">
          <table className="w-full text-sm">
            <thead className="text-left bg-sol-100"><tr><th className="p-2">Producto</th><th className="p-2">Existencias</th><th className="p-2">Mínimo</th></tr></thead>
            <tbody>{stock.map((p) => (
              <tr key={p.id} className="border-t"><td className="p-2">{p.name}</td>
                <td className="p-2">{formatQuantity(p.sale_mode, p.stock)}{p.stock <= p.min_stock && <span className="ml-1 text-xs bg-red-100 text-red-700 rounded px-1">bajo</span>}</td>
                <td className="p-2">{formatQuantity(p.sale_mode, p.min_stock)}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </>
  )
}
