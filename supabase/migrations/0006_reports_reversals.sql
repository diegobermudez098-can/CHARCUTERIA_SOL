-- Etapa 4: reversión de abonos, anulación mejorada y reportes.

alter table public.debt_payments add column if not exists reversed_at timestamptz;
alter table public.debt_payments add column if not exists reversed_by uuid references auth.users(id);
alter table public.debt_payments add column if not exists reverse_reason text;

alter table public.cash_movements drop constraint if exists cash_movements_kind_check;
alter table public.cash_movements add constraint cash_movements_kind_check check (kind in
  ('opening','sale','sale_void','debt_payment','debt_payment_reversal','expense','withdrawal','deposit'));

create or replace function public.reverse_debt_payment(p_payment_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_pay debt_payments%rowtype; v_debt debts%rowtype; v_session uuid;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if p_reason is null or length(trim(p_reason)) < 3 then raise exception 'Indica el motivo de la reversión'; end if;
  select * into v_pay from debt_payments where id = p_payment_id for update;
  if not found then raise exception 'Abono no encontrado'; end if;
  if v_pay.reversed_at is not null then raise exception 'El abono ya fue revertido'; end if;
  select * into v_debt from debts where id = v_pay.debt_id for update;
  if v_debt.status = 'voided' then raise exception 'La deuda está anulada'; end if;

  update debt_payments set reversed_at = now(), reversed_by = v_uid, reverse_reason = p_reason where id = p_payment_id;
  update debts set balance = balance + v_pay.amount, status = 'pending' where id = v_debt.id;
  update sales set pending = pending + v_pay.amount, paid_total = paid_total - v_pay.amount where id = v_debt.sale_id;
  select id into v_session from cash_sessions where closed_at is null limit 1;
  insert into cash_movements(session_id, kind, method, amount, ref_table, ref_id, user_id)
  values (v_session, 'debt_payment_reversal', v_pay.method, -v_pay.amount, 'debt_payments', p_payment_id, v_uid);
  perform write_audit('reverse_debt_payment', 'debt_payments', p_payment_id, p_reason,
                      jsonb_build_object('balance', v_debt.balance), jsonb_build_object('balance', v_debt.balance + v_pay.amount));
end $$;

-- Anulación: ahora solo bloquea si hay abonos vigentes (no revertidos)
create or replace function public.void_sale(p_sale_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_sale sales%rowtype; v_it record; v_pay record; v_session uuid;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if p_reason is null or length(trim(p_reason)) < 3 then raise exception 'Indica el motivo de la anulación'; end if;
  select * into v_sale from sales where id = p_sale_id for update;
  if not found then raise exception 'Venta no encontrada'; end if;
  if v_sale.status = 'voided' then raise exception 'La venta ya está anulada'; end if;
  if exists (select 1 from debts d join debt_payments p on p.debt_id = d.id
             where d.sale_id = p_sale_id and p.reversed_at is null) then
    raise exception 'La venta fiada tiene abonos vigentes; reviértelos primero desde Clientes';
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
  update sales set status = 'voided', pending = 0, void_reason = p_reason, voided_by = v_uid, voided_at = now()
   where id = p_sale_id;
  perform write_audit('void', 'sales', p_sale_id, p_reason, jsonb_build_object('total', v_sale.total), null);
end $$;

-- Reportes. Criterio de costo: costo registrado al momento de la venta (sale_items.line_cost).
-- Fechas en hora de Colombia, ambos extremos incluidos.
create or replace function public.report_summary(p_from date, p_to date) returns jsonb
language plpgsql security definer stable set search_path = public as $$
declare
  v_a timestamptz := p_from::timestamp at time zone 'America/Bogota';
  v_b timestamptz := (p_to + 1)::timestamp at time zone 'America/Bogota';
  v_count int; v_total bigint; v_disc bigint; v_cogs bigint; v_credit bigint; v_exp bigint;
  v_debt_rec bigint; v_cash bigint; v_transfer bigint; v_pending bigint;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  select count(*), coalesce(sum(total), 0), coalesce(sum(discount), 0) into v_count, v_total, v_disc
    from sales where status = 'completed' and created_at >= v_a and created_at < v_b;
  select coalesce(sum(si.line_cost), 0) into v_cogs from sale_items si join sales s on s.id = si.sale_id
    where s.status = 'completed' and s.created_at >= v_a and s.created_at < v_b;
  select coalesce(sum(d.original_amount), 0) into v_credit from debts d join sales s on s.id = d.sale_id
    where s.status = 'completed' and s.created_at >= v_a and s.created_at < v_b;
  select coalesce(sum(amount), 0) into v_debt_rec from cash_movements
    where kind in ('debt_payment', 'debt_payment_reversal') and created_at >= v_a and created_at < v_b;
  select coalesce(sum(amount) filter (where method = 'cash'), 0), coalesce(sum(amount) filter (where method = 'transfer'), 0)
    into v_cash, v_transfer from cash_movements
    where kind in ('sale', 'sale_void', 'debt_payment', 'debt_payment_reversal') and created_at >= v_a and created_at < v_b;
  select coalesce(sum(amount), 0) into v_exp from expenses where expense_date between p_from and p_to;
  select coalesce(sum(balance), 0) into v_pending from debts where status = 'pending';
  return jsonb_build_object(
    'sales_count', v_count, 'sales_total', v_total, 'discounts', v_disc, 'cogs', v_cogs,
    'gross_profit', v_total - v_cogs, 'expenses_total', v_exp, 'net_result', v_total - v_cogs - v_exp,
    'credit_sales', v_credit, 'debt_payments_received', v_debt_rec,
    'received_cash', v_cash, 'received_transfer', v_transfer, 'pending_total', v_pending);
end $$;

create or replace function public.report_top_products(p_from date, p_to date)
returns table (product_name text, sale_mode text, quantity bigint, revenue bigint, cost bigint)
language sql security definer stable set search_path = public as $$
  select si.product_name, si.sale_mode, sum(si.quantity)::bigint, sum(si.line_total)::bigint, sum(si.line_cost)::bigint
  from sale_items si join sales s on s.id = si.sale_id
  where auth.uid() is not null and s.status = 'completed'
    and s.created_at >= (p_from::timestamp at time zone 'America/Bogota')
    and s.created_at < ((p_to + 1)::timestamp at time zone 'America/Bogota')
  group by si.product_name, si.sale_mode
  order by sum(si.line_total) desc
  limit 20
$$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prosecdef loop
    execute format('revoke all on function %s from public, anon', f.sig);
    -- La auditoría solo la escriben las funciones del sistema, nunca el navegador
    if f.proname not in ('write_audit', 'audit_row', 'handle_new_user') then
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
    if f.proname in ('get_public_info', 'get_public_catalog', 'create_public_order', 'get_order_status') then
      execute format('grant execute on function %s to anon', f.sig);
    end if;
  end loop;
end $$;
