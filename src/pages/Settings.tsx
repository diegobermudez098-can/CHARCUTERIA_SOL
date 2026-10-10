import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { errMsg, toInt } from '../lib/db'
import { Alert, Btn, Field, PageTitle, inputCls } from '../components/ui'

export default function Settings() {
  const [name, setName] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [address, setAddress] = useState('')
  const [delivery, setDelivery] = useState(false)
  const [fee, setFee] = useState('0')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    supabase.from('business_settings').select('*').single().then(({ data }) => {
      if (!data) return
      setName(data.business_name); setWhatsapp(data.whatsapp_number ?? ''); setAddress(data.address ?? '')
      setDelivery(data.delivery_enabled); setFee(String(data.delivery_fee))
    })
  }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    const f = toInt(fee)
    if (!Number.isInteger(f) || f < 0) return setMsg({ ok: false, text: 'El costo de domicilio debe ser un entero igual o mayor que cero' })
    const { error } = await supabase.from('business_settings').update({
      business_name: name.trim() || 'SOL', whatsapp_number: whatsapp.replace(/\D/g, '') || null,
      address: address.trim() || null, delivery_enabled: delivery, delivery_fee: f,
    }).eq('id', true)
    setMsg(error ? { ok: false, text: errMsg(error) } : { ok: true, text: 'Ajustes guardados' })
  }

  return (
    <>
      <PageTitle>Ajustes del negocio</PageTitle>
      <form onSubmit={submit} className="bg-white rounded-xl border p-4 max-w-md space-y-3">
        <Field label="Nombre del negocio"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="WhatsApp (con indicativo, ej. 573001234567)"><input inputMode="numeric" className={inputCls} value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} /></Field>
        <Field label="Dirección del establecimiento"><input className={inputCls} value={address} onChange={(e) => setAddress(e.target.value)} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={delivery} onChange={(e) => setDelivery(e.target.checked)} /> Ofrecer entrega a domicilio</label>
        <Field label="Costo del domicilio (COP, 0 si no cobras)"><input inputMode="numeric" className={inputCls} value={fee} onChange={(e) => setFee(e.target.value)} /></Field>
        {msg && <Alert kind={msg.ok ? 'ok' : 'error'}>{msg.text}</Alert>}
        <Btn className="w-full">Guardar</Btn>
      </form>
      <p className="text-xs text-gray-500 mt-3 max-w-md">Enlace público de la tienda: <b>{window.location.origin}/tienda</b></p>
    </>
  )
}
