# Copias de seguridad y recuperación

> SOL **no** configura copias automáticas por sí mismo. Lo que existe depende del plan de Supabase que uses
> (revisa en Supabase > Database > Backups qué incluye tu plan). Verifica que funcionen antes de confiar en ellas.

## 1. Exportar (copia manual recomendada: semanal y antes de cambios grandes)
Requiere la cadena de conexión de Supabase (Project Settings > Database > Connection string) y `pg_dump` instalado.
```
pg_dump "postgresql://postgres:TU_CLAVE@db.TU-PROYECTO.supabase.co:5432/postgres" \
  --no-owner --schema=public --file=sol_$(date +%Y%m%d).sql
```
Alternativa sin instalar nada: exportar tablas a CSV desde Supabase > Table Editor (menos completo), y los reportes CSV de SOL.

## 2. Dónde y cómo guardarla
- Guarda al menos 2 copias en lugares distintos (ej. disco externo + nube privada).
- Las copias contienen datos de clientes: no las subas a GitHub ni las envíes por chat; protégelas con contraseña o cifrado.
- Nunca guardes la cadena de conexión en el repositorio.

## 3. Antes de restaurar
- Restaurar **reemplaza datos**: haz primero una copia del estado actual.
- Prueba la restauración en un proyecto de Supabase vacío, no en producción.
- Avisa al equipo para que nadie registre ventas durante el proceso.

## 4. Restaurar
1. Crea un proyecto nuevo (o usa uno vacío) y ejecuta `supabase/migrations/0001` a `0006`.
2. Restaura los datos: `psql "<conexión>" --file=sol_AAAAMMDD.sql` (si el volcado incluye el esquema, restaura en una base vacía en lugar de ejecutar las migraciones).
3. Recrea los usuarios internos en Authentication (las cuentas no están en el esquema `public`).

## 5. Verificaciones después de recuperar
- Cuenta de productos, clientes y ventas contra lo anotado antes.
- Compara el **saldo por cobrar** (Reportes) y las **existencias** de 3 productos con los valores esperados.
- Revisa que el último cierre de caja y la última venta estén presentes.
- Entra a `/tienda` y comprueba que el catálogo carga; haz un pedido de prueba y cancélalo.
- Si algo no cuadra, no sigas operando: restaura otra copia.
