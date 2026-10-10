-- Verificación de reglas de negocio contra TU base de datos de Supabase.
-- Cómo usarlo: ejecútalo en el SQL Editor DESPUÉS de las migraciones 0001–0006 y de crear un usuario.
-- Todo ocurre dentro de una transacción que termina en ROLLBACK: no deja datos.
-- Requisito: no debe haber una caja abierta. Si todo pasa verás: NOTICE "TODAS LAS VERIFICACIONES PASARON".
-- (Este script NO ha sido ejecutado por el autor del proyecto: ejecútalo y revisa el resultado.)
begin;
do $$
declare
  u uuid; w uuid; un uuid; cust uuid; s uuid; s2 uuid; s3 uuid; d uuid; pay uuid; k uuid := gen_random_uuid();
  failed boolean; v int;
begin
  select id into u from auth.users limit 1;
  if u is null then raise exception 'Crea primero un usuario en Authentication'; end if;
  if exists (select 1 from cash_sessions where closed_at is null) then raise exception 'Cierra la caja abierta antes de probar'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);

  insert into products(name, sale_mode, price, cost, min_stock) values ('TEST peso', 'weight', 24000, 15000, 100) returning id into w;
  insert into products(name, sale_mode, price, cost, min_stock) values ('TEST unidad', 'unit', 2000, 1200, 1) returning id into un;
  insert into customers(name) values ('TEST cliente') returning id into cust;
  perform open_cash_session(0);
  perform register_inventory_movement(w, 'entry', 2000, null);
  perform register_inventory_movement(un, 'entry', 100, null);

  -- Caso A y C: 350 g a $24.000/kg = $8.400; stock 2000 -> 1650
  s := create_sale(jsonb_build_array(jsonb_build_object('product_id', w, 'quantity', 350)),
                   jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 8400)), null, 0, k);
  if (select total from sales where id = s) <> 8400 then raise exception 'FALLÓ caso A'; end if;
  if (select stock from products where id = w) <> 1650 then raise exception 'FALLÓ caso C'; end if;

  -- Doble envío con la misma clave: no duplica venta ni descuenta dos veces
  if create_sale(jsonb_build_array(jsonb_build_object('product_id', w, 'quantity', 350)),
                 jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 8400)), null, 0, k) <> s then
    raise exception 'FALLÓ idempotencia (id distinto)';
  end if;
  if (select stock from products where id = w) <> 1650 then raise exception 'FALLÓ idempotencia (stock)'; end if;

  -- Caso B: 3 und a $2.000 = $6.000
  s2 := create_sale(jsonb_build_array(jsonb_build_object('product_id', un, 'quantity', 3)),
                    jsonb_build_array(jsonb_build_object('method', 'transfer', 'amount', 6000)), null, 0, null);
  if (select total from sales where id = s2) <> 6000 then raise exception 'FALLÓ caso B'; end if;

  -- Stock insuficiente se rechaza
  failed := false;
  begin
    perform create_sale(jsonb_build_array(jsonb_build_object('product_id', w, 'quantity', 5000)),
                        jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 120000)), null, 0, null);
  exception when others then failed := true; end;
  if not failed then raise exception 'FALLÓ: permitió vender sin stock'; end if;

  -- Pagos que no cuadran se rechazan
  failed := false;
  begin
    perform create_sale(jsonb_build_array(jsonb_build_object('product_id', un, 'quantity', 1)),
                        jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 1000)), null, 0, null);
  exception when others then failed := true; end;
  if not failed then raise exception 'FALLÓ: permitió pagos que no cuadran'; end if;

  -- Caso D: fiado de $20.000 (10 und), sin dinero recibido
  v := (select coalesce(sum(amount), 0) from cash_movements where kind = 'sale');
  s3 := create_sale(jsonb_build_array(jsonb_build_object('product_id', un, 'quantity', 10)),
                    jsonb_build_array(jsonb_build_object('method', 'credit', 'amount', 20000)), cust, 0, null);
  select id into d from debts where sale_id = s3;
  if (select balance from debts where id = d) <> 20000 then raise exception 'FALLÓ caso D (deuda)'; end if;
  if (select coalesce(sum(amount), 0) from cash_movements where kind = 'sale') <> v then raise exception 'FALLÓ caso D (el fiado movió caja)'; end if;
  if (select stock from products where id = un) <> 87 then raise exception 'FALLÓ caso D (stock)'; end if;

  -- Caso E: abono de $5.000 -> saldo $15.000; abono mayor al saldo se rechaza
  pay := register_debt_payment(d, 5000, 'cash', null);
  if (select balance from debts where id = d) <> 15000 then raise exception 'FALLÓ caso E'; end if;
  failed := false;
  begin perform register_debt_payment(d, 16000, 'cash', null); exception when others then failed := true; end;
  if not failed then raise exception 'FALLÓ: permitió abono mayor al saldo'; end if;
  if (select total from sales where id = s3) <> 20000 then raise exception 'FALLÓ: el abono alteró el total de la venta'; end if;

  -- No se anula una venta fiada con abonos vigentes; tras revertir el abono sí
  failed := false;
  begin perform void_sale(s3, 'prueba'); exception when others then failed := true; end;
  if not failed then raise exception 'FALLÓ: anuló venta con abonos vigentes'; end if;
  perform reverse_debt_payment(pay, 'prueba');
  if (select balance from debts where id = d) <> 20000 then raise exception 'FALLÓ reversión de abono'; end if;
  perform void_sale(s3, 'prueba');
  if (select stock from products where id = un) <> 97 then raise exception 'FALLÓ reversión de stock al anular'; end if;
  if (select status from debts where id = d) <> 'voided' then raise exception 'FALLÓ estado de deuda anulada'; end if;

  -- Caso F: $30.000 = 10.000 efectivo + 15.000 transferencia + 5.000 fiado
  perform register_inventory_movement(un, 'entry', 100, null);
  perform create_sale(jsonb_build_array(jsonb_build_object('product_id', un, 'quantity', 15)),
                      jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 10000),
                                        jsonb_build_object('method', 'transfer', 'amount', 15000),
                                        jsonb_build_object('method', 'credit', 'amount', 5000)), cust, 0, null);

  -- Auditoría registrada y reporte coherente
  if (select count(*) from audit_log where table_name = 'sales') < 3 then raise exception 'FALLÓ auditoría'; end if;
  if (select (report_summary((now() at time zone 'America/Bogota')::date, (now() at time zone 'America/Bogota')::date)->>'sales_count')::int) <> 3 then raise exception 'FALLÓ reporte (ventas completadas esperadas: 3)'; end if;

  raise notice 'TODAS LAS VERIFICACIONES PASARON';
end $$;
rollback;
