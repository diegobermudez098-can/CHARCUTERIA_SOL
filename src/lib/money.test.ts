import { describe, it, expect } from 'vitest'
import { lineTotal, formatQuantity } from './money'

describe('cálculos comerciales', () => {
  it('Caso A: 350 g a $24.000/kg = $8.400', () => expect(lineTotal('weight', 24000, 350)).toBe(8400))
  it('Caso B: 3 und a $2.000 = $6.000', () => expect(lineTotal('unit', 2000, 3)).toBe(6000))
  it('Caso C: 2.000 g - 350 g = 1.650 g', () => expect(2000 - 350).toBe(1650))
  it('Caso F: pago combinado cuadra', () => expect(10000 + 15000 + 5000).toBe(30000))
  it('rechaza cantidades inválidas', () => {
    expect(() => lineTotal('unit', 2000, 0)).toThrow()
    expect(() => lineTotal('weight', 24000, -5)).toThrow()
    expect(() => lineTotal('unit', 2000, 1.5)).toThrow()
  })
  it('formatea cantidades', () => {
    expect(formatQuantity('weight', 250)).toBe('250 g')
    expect(formatQuantity('weight', 1000)).toBe('1 kg')
  })
})
