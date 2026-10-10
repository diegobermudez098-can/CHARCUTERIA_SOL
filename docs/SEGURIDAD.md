# Seguridad

## Qué implementa SOL
- **Autenticación:** Supabase Auth (las contraseñas nunca se guardan en texto plano ni pasan por el código de SOL). Registro público desactivado por configuración (paso 3 del README).
- **RLS en todas las tablas.** Visitantes anónimos no pueden leer ni escribir ninguna tabla.
- **Un solo perfil:** todo usuario autenticado puede leer todo. Las tablas críticas (ventas, pagos, deudas, abonos, inventario, caja, auditoría) **no se pueden escribir directamente** desde el navegador; solo mediante funciones SQL transaccionales (`create_sale`, `void_sale`, `register_debt_payment`, `register_inventory_movement`, `open/close_cash_session`, `create_expense`, `register_cash_movement`, `reverse_debt_payment`, `convert_order_to_sale`).
- **Stock:** la columna `stock` no es editable directamente; solo cambia por movimientos de inventario.
- **Tienda pública:** el visitante solo puede ejecutar 4 funciones: `get_public_catalog` (sin costos ni cantidades de stock), `get_public_info`, `create_public_order` y `get_order_status`. Precios, disponibilidad y totales se toman de la base de datos, nunca del navegador. Límite de 5 pedidos por teléfono por hora.
- **Estado del pedido:** se consulta con un token aleatorio (UUID) y no revela nombre, teléfono ni dirección.
- **Auditoría:** `audit_log` es de solo consulta; la función que escribe en ella no es ejecutable desde el navegador.
- **Secretos:** solo la clave pública `anon` en el frontend (variables `VITE_*`). `.env` está en `.gitignore`.
- **Idempotencia:** ventas, abonos y pedidos aceptan una clave única; un doble clic o reintento no duplica registros.
- **Mensajes de error:** los errores técnicos de la base de datos se reemplazan por un mensaje genérico.

## Límites y recomendaciones
- Las transferencias se registran por confirmación del usuario; no hay verificación bancaria.
- El token de un pedido es un secreto: quien tenga el enlace puede ver ese pedido.
- Como todas las cuentas internas tienen el mismo poder, entrega cuentas solo a personas de confianza y elimina las de quien deje el negocio (Authentication > Users).
- Activa verificación en dos pasos en tu cuenta de Supabase y GitHub.
- Revisa periódicamente el módulo **Historial**.
- La protección contra abuso del formulario público es básica (límite por teléfono); si recibes spam, considera añadir CAPTCHA.
