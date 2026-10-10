import { formatCOP } from './money'

export interface Payments { cash: number; transfer: number; credit: number }

/** Valida en el cliente (el servidor vuelve a validar). Devuelve el mensaje de error o null. */
export function validatePayments(total: number, p: Payments, hasCustomer: boolean): string | null {
  for (const v of [p.cash, p.transfer, p.credit]) {
    if (!Number.isInteger(v) || v < 0) return 'Los valores de pago no son válidos'
  }
  if (total <= 0) return 'El total debe ser mayor que cero'
  const sum = p.cash + p.transfer + p.credit
  if (sum !== total) return `Los pagos suman ${formatCOP(sum)} y el total es ${formatCOP(total)}`
  if (p.credit > 0 && !hasCustomer) return 'Selecciona un cliente para la venta fiada'
  return null
}

export function paymentsPayload(p: Payments): { method: string; amount: number }[] {
  const out: { method: string; amount: number }[] = []
  if (p.cash > 0) out.push({ method: 'cash', amount: p.cash })
  if (p.transfer > 0) out.push({ method: 'transfer', amount: p.transfer })
  if (p.credit > 0) out.push({ method: 'credit', amount: p.credit })
  return out
}
