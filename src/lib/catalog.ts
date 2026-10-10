import type { SaleMode } from './money'

/** Dibujos genéricos para los productos (no hace falta subir fotos). */
export interface CatalogItem { name: string; emoji: string; mode: SaleMode }

/** Productos típicos de una charcutería. Al elegirlos solo falta poner el precio y cuánto hay. */
export const CATALOG: CatalogItem[] = [
  { name: 'Pollo entero', emoji: '🍗', mode: 'weight' },
  { name: 'Pechuga de pollo', emoji: '🍗', mode: 'weight' },
  { name: 'Muslos de pollo', emoji: '🍗', mode: 'weight' },
  { name: 'Alas de pollo', emoji: '🍗', mode: 'weight' },
  { name: 'Pernil de pollo', emoji: '🍗', mode: 'weight' },
  { name: 'Carne de res', emoji: '🥩', mode: 'weight' },
  { name: 'Carne molida de res', emoji: '🥩', mode: 'weight' },
  { name: 'Bistec de res', emoji: '🥩', mode: 'weight' },
  { name: 'Lomo de res', emoji: '🥩', mode: 'weight' },
  { name: 'Costilla de res', emoji: '🍖', mode: 'weight' },
  { name: 'Carne de cerdo', emoji: '🥩', mode: 'weight' },
  { name: 'Carne molida de cerdo', emoji: '🥩', mode: 'weight' },
  { name: 'Costilla de cerdo', emoji: '🍖', mode: 'weight' },
  { name: 'Chuleta de cerdo', emoji: '🥩', mode: 'weight' },
  { name: 'Lomo de cerdo', emoji: '🥩', mode: 'weight' },
  { name: 'Pernil de cerdo', emoji: '🍖', mode: 'weight' },
  { name: 'Tocineta', emoji: '🥓', mode: 'weight' },
  { name: 'Chicharrón', emoji: '🥓', mode: 'weight' },
  { name: 'Chorizo', emoji: '🌭', mode: 'unit' },
  { name: 'Salchicha', emoji: '🌭', mode: 'unit' },
  { name: 'Salchichón', emoji: '🌭', mode: 'weight' },
  { name: 'Butifarra', emoji: '🌭', mode: 'unit' },
  { name: 'Morcilla', emoji: '🌭', mode: 'unit' },
  { name: 'Longaniza', emoji: '🌭', mode: 'weight' },
  { name: 'Jamón', emoji: '🍖', mode: 'weight' },
  { name: 'Mortadela', emoji: '🍖', mode: 'weight' },
  { name: 'Queso campesino', emoji: '🧀', mode: 'weight' },
  { name: 'Queso mozzarella', emoji: '🧀', mode: 'weight' },
  { name: 'Cuajada', emoji: '🧀', mode: 'weight' },
  { name: 'Huevos', emoji: '🥚', mode: 'unit' },
  { name: 'Hamburguesa', emoji: '🍔', mode: 'unit' },
  { name: 'Arepas', emoji: '🫓', mode: 'unit' },
]

/** Para elegir otro dibujo a mano. */
export const EMOJI_CHOICES = ['🍗', '🥩', '🍖', '🥓', '🌭', '🍔', '🧀', '🥚', '🫓', '🥖', '🥔', '🧈', '🥛', '🥫', '🥤', '🛒']

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

// Palabras del nombre -> dibujo. Se revisa en orden: lo primero que coincida gana.
const KEYWORDS: [string[], string][] = [
  [['tocineta', 'tocino', 'chicharron', 'bacon'], '🥓'],
  [['pollo', 'pechuga', 'muslo', 'alita', 'alas', 'pavo', 'gallina'], '🍗'],
  [['salchicha', 'chorizo', 'butifarra', 'morcilla', 'longaniza', 'salchichon', 'perro'], '🌭'],
  [['jamon', 'mortadela', 'costilla', 'pernil', 'ahumado'], '🍖'],
  [['res', 'carne', 'bistec', 'lomo', 'molida', 'chuleta', 'churrasco', 'sobrebarriga', 'cerdo'], '🥩'],
  [['queso', 'cuajada', 'mozzarella'], '🧀'],
  [['huevo'], '🥚'],
  [['hamburguesa'], '🍔'],
  [['arepa'], '🫓'],
  [['pan'], '🥖'],
  [['papa'], '🥔'],
  [['mantequilla'], '🧈'],
  [['leche'], '🥛'],
]

/** Adivina el dibujo a partir del nombre ("Pechuga apanada" -> 🍗). null si no reconoce nada. */
export function emojiFor(name: string): string | null {
  const words = norm(name).split(/[^a-z0-9]+/).filter(Boolean)
  for (const [keys, emoji] of KEYWORDS) if (words.some((w) => keys.includes(w))) return emoji
  return null
}
