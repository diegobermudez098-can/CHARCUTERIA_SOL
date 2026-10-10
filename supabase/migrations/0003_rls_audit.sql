-- Seguridad: RLS en todas las tablas. Anónimos no ven nada.
-- Los usuarios autenticados leen todo (un solo perfil). Las tablas críticas solo se escriben vía funciones.

do $$
declare t text;
begin
  for t in select unnest(array['profiles','business_settings','categories','products','customers',
    'cash_sessions','sales','sale_items','sale_payments','debts','debt_payments','inventory_movements',
    'cash_movements','expense_categories','expenses','orders','order_items','audit_log']) loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('create policy "autenticados leen" on public.%I for select to authenticated using (true)', t);
  end loop;
end $$;

-- Escritura directa permitida solo en tablas de catálogo simple
grant insert, update on public.categories, public.customers, public.expense_categories to authenticated;
create policy "cat escribe" on public.categories for insert to authenticated with check (true);
create policy "cat edita"   on public.categories for update to authenticated using (true) with check (true);
create policy "cli escribe" on public.customers  for insert to authenticated with check (true);
create policy "cli edita"   on public.customers  for update to authenticated using (true) with check (true);
create policy "gcat escribe" on public.expense_categories for insert to authenticated with check (true);
create policy "gcat edita"   on public.expense_categories for update to authenticated using (true) with check (true);

-- Productos: sin tocar stock directamente (solo vía movimientos); sin borrado físico
grant insert (name, description, category_id, sale_mode, price, cost, min_stock, active) on public.products to authenticated;
grant update (name, description, category_id, price, cost, min_stock, active) on public.products to authenticated;
create policy "prod escribe" on public.products for insert to authenticated with check (true);
create policy "prod edita"   on public.products for update to authenticated using (true) with check (true);

-- Pedidos: el personal solo cambia el estado
grant update (status) on public.orders to authenticated;
create policy "ped edita" on public.orders for update to authenticated using (true) with check (true);

-- Configuración del negocio
grant update on public.business_settings to authenticated;
create policy "cfg edita" on public.business_settings for update to authenticated using (true) with check (true);

-- Auditoría automática de tablas editables directamente
create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into audit_log(user_id, action, table_name, record_id, old_values, new_values)
  values (auth.uid(), lower(tg_op), tg_table_name,
          coalesce((to_jsonb(new)->>'id')::uuid, (to_jsonb(old)->>'id')::uuid),
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end $$;
create trigger audit_products  after insert or update on public.products  for each row execute function public.audit_row();
create trigger audit_customers after insert or update on public.customers for each row execute function public.audit_row();
create trigger audit_orders    after update on public.orders              for each row execute function public.audit_row();
