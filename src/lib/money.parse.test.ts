import { describe, it, expect } from 'vitest'
import { parseCOP, parseQty, qtyToInput } from './money'

describe('parseCOP', () => {
  it('acepta pesos escritos con puntos, comas, espacios y $', () => {
    expect(parseCOP('25000')).toBe(25000)
    expect(parseCOP('25.000')).toBe(25000)
    expect(parseCOP('$ 25,000')).toBe(25000)
  })
  it('vacío o sin números es NaN', () => {
    expect(parseCOP('')).toBeNaN()
    expect(parseCOP('abc')).toBeNaN()
  })
})

describe('parseQty', () => {
  it('kilos con coma o punto pasan a gramos', () => {
    expect(parseQty('weight', '2,5')).toBe(2500)
    expect(parseQty('weight', '2.5')).toBe(2500)
    expect(parseQty('weight', '10')).toBe(10000)
    expect(parseQty('weight', '0,25')).toBe(250)
  })
  it('unidades deben ser enteras', () => {
    expect(parseQty('unit', '12')).toBe(12)
    expect(parseQty('unit', '1,5')).toBeNaN()
  })
  it('texto inválido o negativo es NaN', () => {
    expect(parseQty('weight', '')).toBeNaN()
    expect(parseQty('weight', 'abc')).toBeNaN()
    expect(parseQty('weight', '-3')).toBeNaN()
  })
})

describe('qtyToInput', () => {
  it('es el inverso de parseQty', () => {
    expect(qtyToInput('weight', 2500)).toBe('2,5')
    expect(qtyToInput('weight', 2000)).toBe('2')
    expect(qtyToInput('unit', 7)).toBe('7')
  })
})
