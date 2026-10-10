// Dinero: pesos COP enteros. Peso: gramos enteros. Nunca decimales.
export type SaleMode = 'weight' | 'unit'

/** Total de una línea. weight: price = COP por kg, qty = gramos. unit: price = COP por unidad. */
export function lineTotal(mode: SaleMode, price: number, qty: number): number {
  if (!Number.isInteger(price) || !Number.isInteger(qty) || price < 0 || qty <= 0) {
    throw new Error('Precio o cantidad inválidos')
  }
  return mode === 'weight' ? Math.floor((price * qty + 500) / 1000) : price * qty
}

export const formatCOP = (n: number): string =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n)

export function formatQuantity(mode: SaleMode, qty: number): string {
  if (mode === 'unit') return `${qty} und`
  return qty >= 1000 ? `${(qty / 1000).toLocaleString('es-CO')} kg` : `${qty} g`
}

/** Lee pesos escritos de forma natural: "25.000" o "$ 25,000" dan 25000. Vacío o sin números: NaN. */
export function parseCOP(s: string): number {
  const digits = s.replace(/\D/g, '')
  return digits === '' ? NaN : Number(digits)
}

/**
 * Lee la cantidad como la escribe la persona y la devuelve en la unidad guardada.
 * weight: kilos (acepta coma o punto, "2,5") -> gramos. unit: unidades enteras. Inválido: NaN.
 */
export function parseQty(mode: SaleMode, s: string): number {
  const t = s.trim().replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(t)) return NaN
  const n = Number(t)
  if (mode === 'weight') return Math.round(n * 1000)
  return Number.isInteger(n) ? n : NaN
}

/** Inverso de parseQty: cantidad guardada -> texto para mostrar en un campo ("2,5"). */
export function qtyToInput(mode: SaleMode, qty: number): string {
  return mode === 'weight' ? String(qty / 1000).replace('.', ',') : String(qty)
}
