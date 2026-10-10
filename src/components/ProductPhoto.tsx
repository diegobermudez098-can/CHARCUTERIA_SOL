import { useState } from 'react'

/** Foto del producto. Si no tiene foto (o no carga), muestra la inicial del nombre. */
export default function ProductPhoto({ name, url, className = '' }: { name: string; url?: string | null; className?: string }) {
  const [broken, setBroken] = useState(false)
  if (url && !broken) {
    return <img src={url} alt="" loading="lazy" onError={() => setBroken(true)} className={`object-cover ${className}`} />
  }
  return (
    <div aria-hidden="true" className={`flex items-center justify-center bg-sol-100 text-sol-700 font-extrabold ${className}`}>
      {name.trim().charAt(0).toUpperCase() || '?'}
    </div>
  )
}
