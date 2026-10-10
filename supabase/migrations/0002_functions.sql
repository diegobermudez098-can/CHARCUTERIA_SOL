-- Operaciones críticas: transaccionales, con precios y stock validados en el servidor.

create or replace function public.write_audit(p_action text, p_table text, p_id uuid, p_reason text, p_old jsonb, p_new jsonb)
returns void language sql security definer set search_path = public as $$
  insert into audit_log(user_id, action, table_name, record_id, reason, old_values, new_values)
  values (auth.uid(), p_action, p_table, p_id, p_reason, p_old, p_new);
$$;

-- p_items:    [{"product_id": uuid, "quantity": int}]   (gramos o unidades)
-- p_payments: [{"method": "cash"|"transfer"|"credit", "amount": int}]
create or replace function public.create_sale(
  p_items jsonb, p_payments jsonb,
  p_customer_id uuid default null, p_discount int default 0, p_key uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_sale uuid; v_item jsonb; v_pay jsonb; v_prod products%rowtype;
  v_qty int; v_line int; v_cost int; v_subtotal int := 0; v_total int;
  v_paid int := 0; v_credit int := 0; v_amt int; v_method text; v_session uuid;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if p_key is not null then
    select id into v_sale from sales where idempotency_key = p_key;
    if found then return v_sale; end if;
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La venta no tiene productos';
  end if;
  if p_discount < 0 then raise exception 'Descuento inválido'; end if;

  begin
    insert into sales(user_id, customer_id, idempotency_key) values (v_uid, p_customer_id, p_key)
    returning id into v_sale;
  exception when unique_violation then
    select id into v_sale from sales where idempotency_key = p_key;
    return v_sale;   -- doble envío concurrente: devuelve la venta ya creada
  end;

  select id into v_session from cash_sessions where closed_at is null limit 1;

  for v_item in select value from jsonb_array_elements(p_items) order by value->>'product_id' loop
    select * into v_prod from products where id = (v_item->>'product_id')::uuid for update;
    if not found or not v_prod.active then raise exception 'Producto no disponible'; end if;
    v_qty := (v_item->>'quantity')::int;
    if v_qty is null or v_qty <= 0 then raise exception 'Cantidad inválida para %', v_prod.name; end if;
    if v_prod.stock < v_qty then raise exception 'Stock insuficiente para %', v_prod.name; end if;

    if v_prod.sale_mode = 'weight' then
      v_line := ((v_prod.price::bigint * v_qty + 500) / 1000)::int;
      v_cost := ((v_prod.cost::bigint  * v_qty + 500) / 1000)::int;
    else
      v_line := v_prod.price * v_qty;
      v_cost := v_prod.cost * v_qty;
    end if;

    insert into sale_items(sale_id, product_id, product_name, sale_mode, quantity, unit_price, unit_cost, line_total, line_cost)
    values (v_sale, v_prod.id, v_prod.name, v_prod.sale_mode, v_qty, v_prod.price, v_prod.cost, v_line, v_cost);
    update products set stock = stock - v_qty where id = v_prod.id;
    insert into inventory_movements(product_id, kind, quantity, sale_id, user_id)
    values (v_prod.id, 'sale', -v_qty, v_sale, v_uid);
    v_subtotal := v_subtotal + v_line;
  end loop;

  -- Regla de descuento: no puede superar el subtotal
  if p_discount > v_subtotal then raise exception 'El descuento supera el subtotal'; end if;
  v_total := v_subtotal - p_discount;

  for v_pay in select value from jsonb_array_elements(coalesce(p_payments, '[]'::jsonb)) loop
    v_method := v_pay->>'method'; v_amt := (v_pay->>'amount')::int;
    if v_amt is null or v_amt <= 0 then raise exception 'Monto de pago inválido'; end if;
    if v_method = 'credit' then
      v_credit := v_credit + v_amt;
    elsif v_method in ('cash','transfer') then
      v_paid := v_paid + v_amt;
      insert into sale_payments(sale_id, method, amount) values (v_sale, v_method, v_amt);
      insert into cash_movements(session_id, kind, method, amount, ref_table, ref_id, user_id)
      values (v_session, 'sale', v_method, v_amt, 'sales', v_sale, v_uid);
    else raise exception 'Método de pago inválido';
    end if;
  end loop;

  if v_paid + v_credit <> v_total then
    raise exception 'Los pagos (%) no coinciden con el total (%)', v_paid + v_credit, v_total;
  end if;
  if v_credit > 0 then
    if p_customer_id is null then raise exception 'Una venta fiada requiere cliente'; end if;
    insert into debts(sale_id, customer_id, original_amount, balance) values (v_sale, p_customer_id, v_credit, v_credit);
  end if;

  update sales set subtotal = v_subtotal, discount = p_discount, total = v_total,
         paid_total = v_paid, pending = v_credit where id = v_sale;
  perform write_audit('sale', 'sales', v_sale, null, null, jsonb_build_object('total', v_total, 'pending', v_credit));
  return v_sale;
end $$;

create or replace function public.void_sale(p_sale_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_sale sales%rowtype; v_it record; v_pay record; v_session uuid;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if p_reason is null or length(trim(p_reason)) < 3 then raise exception 'Indica el motivo de la anulación'; end if;
  select * into v_sale from sales where id = p_sale_id for update;
  if not found then raise exception 'Venta no encontrada'; end if;
  if v_sale.status = 'voided' then raise exception 'La venta ya está anulada'; end if;
  if exists (select 1 from debts d join debt_payments p on p.debt_id = d.id where d.sale_id = p_sale_id) then
    raise exception 'La venta fiada ya tiene abonos; no se puede anular directamente';
  end if;

  select id into v_session from cash_sessions where closed_at is null limit 1;
  for v_it in select * from sale_items where sale_id = p_sale_id order by product_id loop
    perform 1 from products where id = v_it.product_id for update;
    update products set stock = stock + v_it.quantity where id = v_it.product_id;
    insert into inventory_movements(product_id, kind, quantity, reason, sale_id, user_id)
    values (v_it.product_id, 'sale_void', v_it.quantity, p_reason, p_sale_id, v_uid);
  end loop;
  for v_pay in select * from sale_payments where sale_id = p_sale_id loop
    insert into cash_movements(session_id, kind, method, amount, ref_table, ref_id, user_id)
    values (v_session, 'sale_void', v_pay.method, -v_pay.amount, 'sales', p_sale_id, v_uid);
  end loop;
  update debts set status = 'voided', balance = 0 where sale_id = p_sale_id;
  update sales set status = 'voided', void_reason = p_reason, voided_by = v_uid, voided_at = now() where id = p_sale_id;
  perform write_audit('void', 'sales', p_sale_id, p_reason, jsonb_build_object('total', v_sale.total), null);
end $$;

create or replace function public.register_debt_payment(p_debt_id uuid, p_amount int, p_method text, p_key uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_debt debts%rowtype; v_id uuid; v_session uuid;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if p_method not in ('cash','transfer') then raise exception 'Método de pago inválido'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Monto inválido'; end if;
  if p_key is not null then
    select id into v_id from debt_payments where idempotency_key = p_key;
    if found then return v_id; end if;
  end if;
  select * into v_debt from debts where id = p_debt_id for update;
  if not found or v_debt.status <> 'pending' then raise exception 'La deuda no está pendiente'; end if;
  if p_amount > v_debt.balance then raise exception 'El abono supera el saldo pendiente (%)', v_debt.balance; end if;

  insert into debt_payments(debt_id, amount, method, user_id, idempotency_key)
  values (p_debt_id, p_amount, p_method, v_uid, p_key) returning id into v_id;
  update debts set balance = balance - p_amount,
         status = case when balance - p_amount = 0 then 'paid' else 'pending' end where id = p_debt_id;
  update sales set pending = pending - p_amount, paid_total = paid_total + p_amount where id = v_debt.sale_id;
  select id into v_session from cash_sessions where closed_at is null limit 1;
  insert into cash_movements(session_id, kind, method, amount, ref_table, ref_id, user_id)
  values (v_session, 'debt_payment', p_method, p_amount, 'debt_payments', v_id, v_uid);
  perform write_audit('debt_payment', 'debt_payments', v_id, null, jsonb_build_object('balance', v_debt.balance), jsonb_build_object('balance', v_debt.balance - p_amount));
  return v_id;
end $$;

create or replace function public.register_inventory_movement(p_product_id uuid, p_kind text, p_quantity int, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_prod products%rowtype;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if p_kind not in ('entry','adjustment') then raise exception 'Tipo de movimiento inválido'; end if;
  if p_quantity is null or p_quantity = 0 then raise exception 'Cantidad inválida'; end if;
  if p_kind = 'entry' and p_quantity < 0 then raise exception 'Una entrada debe ser positiva'; end if;
  if p_kind = 'adjustment' and (p_reason is null or length(trim(p_reason)) < 3) then
    raise exception 'Indica el motivo del ajuste';
  end if;
  select * into v_prod from products where id = p_product_id for update;
  if not found then raise exception 'Producto no encontrado'; end if;
  if v_prod.stock + p_quantity < 0 then raise exception 'El ajuste dejaría el stock negativo'; end if;
  update products set stock = stock + p_quantity where id = p_product_id;
  insert into inventory_movements(product_id, kind, quantity, reason, user_id)
  values (p_product_id, p_kind, p_quantity, p_reason, v_uid);
  perform write_audit(p_kind, 'products', p_product_id, p_reason, jsonb_build_object('stock', v_prod.stock), jsonb_build_object('stock', v_prod.stock + p_quantity));
end $$;

create or replace function public.open_cash_session(p_opening_float int)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_id uuid;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if p_opening_float is null or p_opening_float < 0 then raise exception 'Fondo inicial inválido'; end if;
  if exists (select 1 from cash_sessions where closed_at is null) then raise exception 'Ya hay una caja abierta'; end if;
  insert into cash_sessions(opened_by, opening_float) values (v_uid, p_opening_float) returning id into v_id;
  insert into cash_movements(session_id, kind, method, amount, ref_table, ref_id, user_id)
  values (v_id, 'opening', 'cash', p_opening_float, 'cash_sessions', v_id, v_uid);
  perform write_audit('open', 'cash_sessions', v_id, null, null, jsonb_build_object('opening_float', p_opening_float));
  return v_id;
end $$;

create or replace function public.close_cash_session(p_session_id uuid, p_counted_cash int, p_notes text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_exp int;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if p_counted_cash is null or p_counted_cash < 0 then raise exception 'Valor contado inválido'; end if;
  perform 1 from cash_sessions where id = p_session_id and closed_at is null for update;
  if not found then raise exception 'La caja no existe o ya está cerrada'; end if;
  select coalesce(sum(amount),0) into v_exp from cash_movements where session_id = p_session_id and method = 'cash';
  update cash_sessions set closed_at = now(), closed_by = v_uid, expected_cash = v_exp,
         counted_cash = p_counted_cash, difference = p_counted_cash - v_exp, notes = p_notes
   where id = p_session_id;
  perform write_audit('close', 'cash_sessions', p_session_id, p_notes, jsonb_build_object('expected', v_exp), jsonb_build_object('counted', p_counted_cash));
end $$;

create or replace function public.create_expense(
  p_description text, p_category_id uuid, p_amount int, p_method text,
  p_date date default null, p_notes text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_id uuid; v_session uuid;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if p_description is null or length(trim(p_description)) = 0 then raise exception 'Falta la descripción'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Valor inválido'; end if;
  if p_method not in ('cash','transfer') then raise exception 'Método de pago inválido'; end if;
  insert into expenses(description, category_id, amount, method, expense_date, notes, user_id)
  values (p_description, p_category_id, p_amount, p_method,
          coalesce(p_date, (now() at time zone 'America/Bogota')::date), p_notes, v_uid)
  returning id into v_id;
  select id into v_session from cash_sessions where closed_at is null limit 1;
  insert into cash_movements(session_id, kind, method, amount, ref_table, ref_id, user_id)
  values (v_session, 'expense', p_method, -p_amount, 'expenses', v_id, v_uid);
  perform write_audit('expense', 'expenses', v_id, null, null, jsonb_build_object('amount', p_amount));
  return v_id;
end $$;

-- Solo usuarios autenticados pueden ejecutar estas funciones
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prosecdef loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
