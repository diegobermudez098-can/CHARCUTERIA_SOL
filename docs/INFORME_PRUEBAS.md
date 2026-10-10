# Informe de pruebas

Fecha de la revisión: 10 de octubre de 2026. Entorno del autor: sin acceso a internet, sin Postgres ni Supabase y sin poder instalar paquetes de npm.
Por eso el resultado se divide en lo que **sí se ejecutó**, lo que **no se pudo ejecutar** y lo que **debes ejecutar tú**.

## Ejecutado y aprobado
| Comprobación | Resultado |
|---|---|
| Cálculos: peso (350 g × $24.000/kg = $8.400), unidad (3 × $2.000 = $6.000), inventario (2.000 − 350 = 1.650), redondeo | Aprobado (ejecutado con Node) |
| Validación de pagos: fiado con/sin cliente, pago combinado $10.000 + $15.000 + $5.000 = $30.000, pagos que no cuadran, decimales y negativos | Aprobado |
| Exportación CSV: escape de comas/comillas/saltos, protección contra fórmulas | Aprobado |
| TypeScript estricto (`strict`, sin variables sin usar) sobre todo `src/`, con declaraciones simplificadas de React, React Router y Supabase | Aprobado. No equivale a compilar con las librerías reales |
| SQL: paréntesis y bloques `$$` balanceados en las 6 migraciones; no hay funciones llamadas sin definir | Aprobado (revisión estática) |
| Revisión manual de permisos y RLS | Se corrigió un hallazgo: la función de auditoría era ejecutable desde el navegador (ya restringida) |

## No ejecutado (bloqueado por el entorno)
- `npm install`, `npm test` (Vitest + React Testing Library), `npm run build`.
- Las migraciones SQL contra PostgreSQL/Supabase real (pueden contener errores de sintaxis que la revisión estática no detecta).
- Pruebas de integración: login real, ventas, inventario, caja, fiados, anulaciones, pedidos públicos, RLS contra visitantes anónimos, auditoría, doble envío concurrente.
- Diseño adaptable en pantallas reales y exportación de CSV en navegador.

## Qué ejecutar tú (en este orden)
1. `npm install && npm run typecheck && npm test && npm run build` → deben pasar sin errores.
2. Ejecutar las migraciones `0001`–`0006` en el SQL Editor de Supabase.
3. Ejecutar `supabase/tests/escenarios.sql`. Cubre: casos A, B, C, D, E, F; stock insuficiente; pagos que no cuadran; doble envío; abono mayor al saldo; anulación y reversión de abonos; auditoría; reporte. Resultado esperado: aviso `TODAS LAS VERIFICACIONES PASARON`.
4. Prueba manual: abrir `/tienda` sin sesión (debe verse el catálogo), intentar entrar a `/` sin sesión (debe redirigir a `/ingresar`), crear un pedido de prueba y verlo en **Pedidos**, convertirlo en venta, revisar **Caja** y **Reportes**.
5. En Supabase, con la clave `anon`, intentar leer `sales` (debe devolver vacío o error).

Si algún paso falla, envía el mensaje de error exacto para corregirlo.
