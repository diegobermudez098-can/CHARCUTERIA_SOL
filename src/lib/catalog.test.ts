import { describe, it, expect } from 'vitest'
import { CATALOG, emojiFor } from './catalog'

describe('emojiFor', () => {
  it('adivina el dibujo por el nombre, sin importar tildes o mayúsculas', () => {
    expect(emojiFor('Pollo')).toBe('🍗')
    expect(emojiFor('PECHUGA apanada')).toBe('🍗')
    expect(emojiFor('Salchichón cervecero')).toBe('🌭')
    expect(emojiFor('Chicharrón')).toBe('🥓')
    expect(emojiFor('Queso campesino')).toBe('🧀')
    expect(emojiFor('Carne molida')).toBe('🥩')
  })
  it('devuelve null si no reconoce el nombre', () => {
    expect(emojiFor('Producto raro')).toBeNull()
  })
  it('todos los productos de la lista tienen dibujo y nombre único', () => {
    expect(new Set(CATALOG.map((c) => c.name)).size).toBe(CATALOG.length)
    expect(CATALOG.every((c) => c.emoji.length > 0)).toBe(true)
  })
})
