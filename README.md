# SOL · Charcutería y carnicería

Aplicación web para administrar el negocio (productos, inventario, ventas, caja, gastos, fiados y abonos, reportes)
y una **tienda pública** donde los clientes consultan el catálogo y envían pedidos.

Stack: React + TypeScript + Vite · Tailwind CSS · React Router · Supabase (PostgreSQL, Auth, RLS) · Vitest.

## Funcionalidades implementadas
- **Acceso:** inicio/cierre de sesión con Supabase Auth. Un único perfil: todas las cuentas internas pueden hacer lo mismo y cada operación guarda quién la hizo. Las cuentas se crean por invitación (sin registro público).
- **Productos e inventario:** por peso (gramos) o unidad, categorías, activar/desactivar (sin borrado físico), stock mínimo, entradas, ajustes con motivo, historial de movimientos.
- **Venta rápida:** varios productos, descuento validado (no supera el subtotal), efectivo / transferencia / fiado / combinado, comprobante, protección contra doble envío, anulación con motivo que revierte stock y pagos.
- **Clientes:** historial de compras, deudas, abonos (nunca superiores al saldo), reversión trazable de abonos.
- **Caja:** apertura con fondo, retiros e ingresos manuales, cierre con efectivo esperado vs. contado. Separa lo vendido, lo recibido y lo pendiente.
- **Gastos:** por categoría y medio de pago, descuentan de caja.
- **Pedidos:** la tienda pública (`/tienda`) guarda pedidos; el personal los gestiona en **Pedidos** y los convierte en venta solo al cobrarlos. Consulta de estado por enlace secreto (`/pedido/<token>`). Enlace a WhatsApp (solo abre el chat; no envía ni confirma nada).
- **Reportes:** ventas, recibido por medio de pago, fiados, abonos, por cobrar, productos más vendidos, existencias y stock bajo, costo estimado, ganancia bruta y resultado estimado. Exportación a CSV (ventas, más vendidos, existencias).
- **Auditoría:** historial de solo consulta de acciones importantes.
- **PWA instalable** (sin caché de datos: ventas e inventario requieren conexión).

## Pendiente / límites conocidos
- No hay sincronización offline (por diseño).
- La entrega a domicilio: el costo se muestra al cliente, pero la venta registra solo los productos; el domicilio se cobra aparte.
- El pedido no reserva stock: la disponibilidad se revalida al convertirlo en venta.
- Un pago de pedido en línea no existe: el pago se acuerda con el negocio.
- Cambiar el estado de un pedido a mano no avisa al cliente automáticamente.
- Pruebas contra un Supabase real: ver `docs/INFORME_PRUEBAS.md` (no ejecutadas por el autor).

## Instalación local
1. `npm install`
2. Copia `.env.example` a `.env` y completa `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (Supabase > Project Settings > API).
3. `npm run dev`
4. Verificaciones: `npm run typecheck` · `npm test` · `npm run build`

## Configurar Supabase
1. Crea un proyecto en supabase.com.
2. En *SQL Editor* ejecuta **en orden** los archivos de `supabase/migrations/`: `0001` a `0006`.
3. *Authentication > Providers > Email*: desactiva **Allow new users to sign up** (solo cuentas por invitación).
4. *Authentication > Users > Add user*: crea el primer usuario interno (correo y contraseña). Repite por cada persona.
5. *Authentication > URL Configuration*: pon la URL de tu sitio desplegado como *Site URL*.
6. Entra a la app, ve a **Ajustes** y completa nombre, WhatsApp (con indicativo, ej. `573001234567`), dirección y domicilio.
7. Verificación opcional de reglas de negocio: ejecuta `supabase/tests/escenarios.sql` en el SQL Editor (termina en ROLLBACK, no deja datos).
8. **Nunca** uses la clave `service_role` en el frontend ni la subas a GitHub.

## Subir a GitHub y desplegar
```
git init && git add . && git commit -m "SOL versión 1"
git branch -M main
git remote add origin https://github.com/diegobermudez098-can/CHARCUTERIA_SOL.git
git push -u origin main
```
Vercel o Netlify: importa el repo, comando `npm run build`, carpeta de salida `dist`, y define las variables
`VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`. Ya incluye `vercel.json` y `public/_redirects` para las rutas de React Router.
Rutas: `/tienda` (pública) · `/ingresar` (personal) · `/` (venta rápida, requiere sesión).

## Decisiones de diseño (documentadas)
- Dinero en pesos COP enteros; peso en gramos enteros. Precio por kg: `total = round(precio × gramos / 1000)`.
- Costo de ventas = costo registrado al momento de la venta (un solo criterio, sin mezclar).
- Ganancia bruta estimada = ventas completadas − costo; resultado estimado = ganancia bruta − gastos del período. Los abonos no se cuentan como ventas.
- Una venta fiada con abonos vigentes no se anula hasta revertir los abonos (con motivo).
- Los movimientos de caja se ligan a la caja abierta; si no hay caja abierta quedan sin turno.
- Los precios, stock y totales siempre se calculan en el servidor (funciones SQL transaccionales).

Más detalle: `docs/SEGURIDAD.md`, `docs/COPIAS_DE_SEGURIDAD.md`, `docs/INFORME_PRUEBAS.md`.
