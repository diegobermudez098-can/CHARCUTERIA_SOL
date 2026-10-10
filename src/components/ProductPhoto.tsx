import { useState } from 'react'
import { emojiFor } from '../lib/catalog'

/**
 * Imagen del producto. Puede ser:
 *  - un dibujo genérico guardado como "emoji:🍗"
 *  - una foto subida (dirección http)
 *  - nada: se adivina el dibujo por el nombre ("Pollo" -> 🍗) o se muestra la inicial.
 */
export default function ProductPhoto({ name, url, className = '' }: { name: string; url?: string | null; className?: string }) {
  const [broken, setBroken] = useState(false)
  if (url && !url.startsWith('emoji:') && !broken) {
    return <img src={url} alt="" loading="lazy" onError={() => setBroken(true)} className={`object-cover ${className}`} />
  }
  const emoji = url?.startsWith('emoji:') ? url.slice(6) : emojiFor(name)
  return (
    <div aria-hidden="true" className={`flex items-center justify-center font-extrabold ${emoji ? 'bg-amber-50' : 'bg-sol-100 text-sol-700'} ${className}`}>
      {emoji ?? (name.trim().charAt(0).toUpperCase() || '?')}
    </div>
  )
}
