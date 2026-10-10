import { supabase } from './supabase'

const BUCKET = 'product-images'

/** Reduce la foto (máx. 640 px) para que cargue rápido incluso con internet lento. */
async function shrink(file: File, max = 640): Promise<Blob> {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * scale)
  canvas.height = Math.round(bmp.height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas')
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  bmp.close()
  return new Promise((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error('blob'))), 'image/jpeg', 0.82))
}

/** Sube la foto a Supabase Storage y devuelve su dirección pública. */
export async function uploadProductPhoto(file: File): Promise<string> {
  let blob: Blob
  try { blob = await shrink(file) } catch { throw new Error('No se pudo leer esa foto. Prueba con otra.') }
  const path = `${crypto.randomUUID()}.jpg`
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000' })
  if (error) {
    throw new Error(/bucket not found|row-level security|policy/i.test(error.message)
      ? 'Las fotos todavía no están activadas en Supabase. Falta ejecutar el script de fotos.'
      : 'No se pudo subir la foto. Revisa el internet e intenta de nuevo.')
  }
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}
