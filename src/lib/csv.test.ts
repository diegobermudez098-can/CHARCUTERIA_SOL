import { describe, it, expect } from 'vitest'
import { toCSV } from './csv'

describe('exportación CSV', () => {
  it('escapa comas, comillas y saltos de línea', () => {
    const out = toCSV([['a,b', 'dijo "hola"', 'x\ny']])
    expect(out).toBe('\uFEFF"a,b","dijo ""hola""","x\ny"')
  })
  it('neutraliza fórmulas en texto pero no toca números negativos', () => {
    const out = toCSV([['=SUM(A1)', -500, 'normal']])
    expect(out).toBe("\uFEFF'=SUM(A1),-500,normal")
  })
  it('separa filas con CRLF', () => {
    expect(toCSV([[1], [2]])).toBe('\uFEFF1\r\n2')
  })
})
