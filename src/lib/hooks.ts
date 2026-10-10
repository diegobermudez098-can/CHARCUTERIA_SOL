import { useEffect, useState } from 'react'
import { supabase } from './supabase'

/** Mapa id de usuario -> nombre, para mostrar quién hizo cada operación. */
export function useProfiles(): Record<string, string> {
  const [map, setMap] = useState<Record<string, string>>({})
  useEffect(() => {
    supabase.from('profiles').select('id, full_name').then(({ data }) => {
      const m: Record<string, string> = {}
      for (const p of (data ?? []) as { id: string; full_name: string }[]) m[p.id] = p.full_name
      setMap(m)
    })
  }, [])
  return map
}
