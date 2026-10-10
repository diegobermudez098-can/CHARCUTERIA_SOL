-- Etapa 3: tienda pública y pedidos. El visitante anónimo solo puede ejecutar 4 funciones limitadas;
-- nunca lee tablas directamente.

alter table public.orders add column if not exists client_key uuid unique;
alter table public.orders add column if not exists sale_id uuid references public.sales(id);

create or replace function public.get_public_info() returns jsonb
language sql security definer stable set search_path = public as $$
  select jsonb_build_object('business_name', business_name, 'whatsapp_number', whatsapp_number,
         'address', address, 'delivery_enabled', delivery_enabled, 'delivery_fee', delivery_fee)
  from business_settings limit 1
$$;

-- Catálogo público: sin costos ni cantidades de stock (solo "disponible" sí/no)
create or replace function public.get_public_catalog()
returns table (id uuid, name text, description text, category text, sale_mode text, price int, available boolean)
language sql security definer stable set search_path = public as $$
  select p.id, p.name, p.description, c.name, p.sale_mode, p.price, (p.stock > 0)
  from products p left join categories c on c.id = p.category_id
  where p.active
  order by c.name nulls last, p.name
$$;

-- p_items: [{"product_id": uuid, "quantity": int}]  (gramos o unidades)
create or replace function public.create_public_order(
  p_name text, p_phone text, p_method text, p_address text, p_notes text, p_items jsonb, p_key uuid default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_set business_settings%rowtype; v_order orders%rowtype; v_item jsonb; v_prod products%rowtype;
  v_qty int; v_line int; v_total int := 0; v_fee int := 0; v_phone text; v_name text;
begin
  if p_key is not null then
    select * into v_order from orders where client_key = p_key;
    if found then
      return jsonb_build_object('number', v_order.number, 'token', v_order.public_token,
                                'subtotal', v_order.estimated_total, 'delivery_fee', v_order.delivery_fee,
                                'total', v_order.estimated_total + v_order.delivery_fee);
    end if;
  end if;

  v_name := trim(coalesce(p_name, ''));
  if char_length(v_name) < 2 or char_length(v_name) > 100 then raise exception 'Escribe tu nombre'; end if;
  v_phone := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  if char_length(v_phone) < 7 or char_length(v_phone) > 15 then raise exception 'Escribe un teléfono válido'; end if;
  if p_method is null or p_method not in ('pickup', 'delivery') then raise exception 'Elige cómo recibirás el pedido'; end if;
  if char_length(coalesce(p_notes, '')) > 500 or char_length(coalesce(p_address, '')) > 300 then
    raise exception 'El texto es demasiado largo';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0
     or jsonb_array_length(p_items) > 50 then
    raise exception 'El pedido debe tener entre 1 y 50 productos';
  end if;

  select * into v_set from business_settings limit 1;
  if p_method = 'delivery' then
    if not v_set.delivery_enabled then raise exception 'La entrega a domicilio no está disponible'; end if;
    if char_length(trim(coalesce(p_address, ''))) < 5 then raise exception 'Escribe la dirección de entrega'; end if;
    v_fee := v_set.delivery_fee;
  end if;

  -- Límite básico contra abuso: máximo 5 pedidos por teléfono por hora
  if (select count(*) from orders where phone = v_phone and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Hay demasiados pedidos recientes con este teléfono. Escríbenos por WhatsApp';
  end if;

  begin
    insert into orders(customer_name, phone, delivery_method, address, notes, estimated_total, delivery_fee, client_key)
    values (v_name, v_phone, p_method, nullif(trim(coalesce(p_address, '')), ''), nullif(trim(coalesce(p_notes, '')), ''), 0, v_fee, p_key)
    returning * into v_order;
  exception when unique_violation then
    select * into v_order from orders where client_key = p_key;
    return jsonb_build_object('number', v_order.number, 'token', v_order.public_token,
                              'subtotal', v_order.estimated_total, 'delivery_fee', v_order.delivery_fee,
                              'total', v_order.estimated_total + v_order.delivery_fee);
  end;

  for v_item in select value from jsonb_array_elements(p_items) loop
    -- El precio SIEMPRE se toma de la base de datos, nunca del navegador
    select * into v_prod from products where id = (v_item->>'product_id')::uuid and active;
    if not found then raise exception 'Un producto ya no está disponible'; end if;
    v_qty := (v_item->>'quantity')::int;
    if v_qty is null or v_qty <= 0 or v_qty > 100000 then raise exception 'Cantidad inválida para %', v_prod.name; end if;
    if v_prod.stock < v_qty then raise exception 'No hay existencias suficientes de %', v_prod.name; end if;
    if v_prod.sale_mode = 'weight' then
      v_line := ((v_prod.price::bigint * v_qty + 500) / 1000)::int;
    else
      v_line := v_prod.price * v_qty;
    end if;
    insert into order_items(order_id, product_id, product_name, sale_mode, quantity, unit_price, line_total)
    values (v_order.id, v_prod.id, v_prod.name, v_prod.sale_mode, v_qty, v_prod.price, v_line);
    v_total := v_total + v_line;
  end loop;

  update orders set estimated_total = v_total where id = v_order.id;
  return jsonb_build_object('number', v_order.number, 'token', v_order.public_token,
                            'subtotal', v_total, 'delivery_fee', v_fee, 'total', v_total + v_fee);
end $$;

-- Consulta del estado con el token secreto del pedido. No devuelve nombre, teléfono ni dirección.
create or replace function public.get_order_status(p_token uuid) returns jsonb
language sql security definer stable set search_path = public as $$
  select jsonb_build_object(
    'number', o.number, 'status', o.status, 'delivery_method', o.delivery_method,
    'estimated_total', o.estimated_total, 'delivery_fee', o.delivery_fee, 'created_at', o.created_at,
    'items', coalesce((select jsonb_agg(jsonb_build_object('product_name', i.product_name, 'sale_mode', i.sale_mode,
                'quantity', i.quantity, 'line_total', i.line_total)) from order_items i where i.order_id = o.id), '[]'::jsonb))
  from orders o where o.public_token = p_token
$$;

-- Total actual del pedido con los precios vigentes (para cobrar)
create or replace function public.order_current_total(p_order_id uuid) returns int
language sql security definer stable set search_path = public as $$
  select coalesce(sum(case when p.sale_mode = 'weight'
                           then ((p.price::bigint * oi.quantity + 500) / 1000)::int
                           else p.price * oi.quantity end), 0)::int
  from order_items oi join products p on p.id = oi.product_id where oi.order_id = p_order_id
$$;

-- Un pedido solo se vuelve venta cuando el personal lo cobra. Precios y stock se revalidan en create_sale.
create or replace function public.convert_order_to_sale(
  p_order_id uuid, p_payments jsonb, p_customer_id uuid default null, p_key uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_o orders%rowtype; v_items jsonb; v_sale uuid;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  select * into v_o from orders where id = p_order_id for update;
  if not found then raise exception 'Pedido no encontrado'; end if;
  if v_o.sale_id is not null then return v_o.sale_id; end if;
  if v_o.status = 'cancelled' then raise exception 'El pedido está cancelado'; end if;
  select jsonb_agg(jsonb_build_object('product_id', product_id, 'quantity', quantity)) into v_items
  from order_items where order_id = p_order_id;
  v_sale := create_sale(v_items, p_payments, p_customer_id, 0, p_key);
  update orders set sale_id = v_sale, status = 'delivered' where id = p_order_id;
  perform write_audit('convert_to_sale', 'orders', p_order_id, null, null, jsonb_build_object('sale_id', v_sale));
  return v_sale;
end $$;

-- Permisos: todo cerrado salvo las 4 funciones públicas
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
