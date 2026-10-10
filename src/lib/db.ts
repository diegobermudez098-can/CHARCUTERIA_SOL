export function errMsg(e: unknown): string {
  const m = (e as { message?: string } | null)?.message ?? ''
  if (!m) return 'Ocurrió un error inesperado'
  if (/violates|duplicate key|row-level security|permission denied|syntax|relation|function public/i.test(m)) {
    return 'No se pudo completar la operación: datos no válidos o sin permiso'
  }
  return m
}

const TZ = 'America/Bogota'
export const today = (): string => new Date().toLocaleDateString('en-CA', { timeZone: TZ })
export const fmtDate = (s: string): string =>
  new Date(s).toLocaleString('es-CO', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' })
/** Colombia no tiene horario de verano: UTC-5 fijo. */
export const bogotaRange = (from: string, to: string): [string, string] => [
  `${from}T00:00:00-05:00`,
  `${to}T23:59:59.999-05:00`,
]
export const toInt = (s: string): number => (s.trim() === '' ? NaN : Number(s))
