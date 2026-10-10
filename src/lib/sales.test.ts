import { describe, it, expect } from 'vitest'
import { validatePayments, paymentsPayload } from './sales'

describe('validación de pagos', () => {
  it('Caso D: fiado total $20.000 con cliente es válido', () => {
    expect(validatePayments(20000, { cash: 0, transfer: 0, credit: 20000 }, true)).toBeNull()
  })
  it('fiado sin cliente se rechaza', () => {
    expect(validatePayments(20000, { cash: 0, transfer: 0, credit: 20000 }, false)).not.toBeNull()
  })
  it('Caso F: 10.000 + 15.000 + 5.000 fiado = 30.000', () => {
    const p = { cash: 10000, transfer: 15000, credit: 5000 }
    expect(validatePayments(30000, p, true)).toBeNull()
    expect(paymentsPayload(p)).toHaveLength(3)
  })
  it('pagos que no cuadran se rechazan', () => {
    expect(validatePayments(30000, { cash: 10000, transfer: 15000, credit: 0 }, true)).not.toBeNull()
  })
  it('rechaza decimales y negativos', () => {
    expect(validatePayments(1000, { cash: 500.5, transfer: 499.5, credit: 0 }, false)).not.toBeNull()
    expect(validatePayments(1000, { cash: 1500, transfer: -500, credit: 0 }, false)).not.toBeNull()
  })
})
