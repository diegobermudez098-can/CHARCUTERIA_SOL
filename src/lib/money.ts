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
