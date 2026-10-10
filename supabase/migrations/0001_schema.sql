-- SOL · Esquema base. Dinero = pesos COP enteros. Peso = gramos enteros.
create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create table public.business_settings (
  id boolean primary key default true check (id),
  business_name text not null default 'SOL',
  whatsapp_number text,
  address text,
  delivery_enabled boolean not null default false,
  delivery_fee int not null default 0 check (delivery_fee >= 0)
);
insert into public.business_settings default values;

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  category_id uuid references public.categories(id),
  sale_mode text not null check (sale_mode in ('weight','unit')),
  price int not null check (price >= 0),      -- COP por kg (weight) o por unidad (unit)
  cost int not null check (cost >= 0),        -- costo de adquisición, misma base que price
  stock int not null default 0 check (stock >= 0), -- gramos (weight) o unidades (unit)
  min_stock int not null default 0 check (min_stock >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.products (active, name);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  notes text,
  created_at timestamptz not null default now()
);

create table public.cash_sessions (
  id uuid primary key default gen_random_uuid(),
  opened_by uuid not null references auth.users(id),
  opened_at timestamptz not null default now(),
  opening_float int not null check (opening_float >= 0),
  closed_by uuid references auth.users(id),
  closed_at timestamptz,
  expected_cash int,
  counted_cash int check (counted_cash >= 0),
  difference int,
  notes text
);
-- Solo una caja abierta a la vez
create unique index one_open_cash_session on public.cash_sessions ((closed_at is null)) where closed_at is null;

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity unique,
  user_id uuid not null references auth.users(id),
  customer_id uuid references public.customers(id),
  status text not null default 'completed' check (status in ('completed','voided')),
  subtotal int not null default 0 check (subtotal >= 0),
  discount int not null default 0 check (discount >= 0),
  total int not null default 0 check (total >= 0),
  paid_total int not null default 0 check (paid_total >= 0),
  pending int not null default 0 check (pending >= 0),
  idempotency_key uuid unique,
  void_reason text,
  voided_by uuid references auth.users(id),
  voided_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.sales (created_at desc);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id),
  product_id uuid not null references public.products(id),
  product_name text not null,
  sale_mode text not null,
  quantity int not null check (quantity > 0),
  unit_price int not null check (unit_price >= 0),
  unit_cost int not null check (unit_cost >= 0),
  line_total int not null check (line_total >= 0),
  line_cost int not null check (line_cost >= 0)   -- costo registrado al momento de la venta
);
create index on public.sale_items (sale_id);

create table public.sale_payments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id),
  method text not null check (method in ('cash','transfer')),
  amount int not null check (amount > 0)
);

create table public.debts (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null unique references public.sales(id),
  customer_id uuid not null references public.customers(id),
  original_amount int not null check (original_amount > 0),
  balance int not null check (balance >= 0),
  status text not null default 'pending' check (status in ('pending','paid','voided')),
  created_at timestamptz not null default now()
);

create table public.debt_payments (
  id uuid primary key default gen_random_uuid(),
  debt_id uuid not null references public.debts(id),
  amount int not null check (amount > 0),
  method text not null check (method in ('cash','transfer')),
  user_id uuid not null references auth.users(id),
  idempotency_key uuid unique,
  created_at timestamptz not null default now()
);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id),
  kind text not null check (kind in ('entry','adjustment','sale','sale_void')),
  quantity int not null check (quantity <> 0),   -- con signo
  reason text,
  sale_id uuid references public.sales(id),
  user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index on public.inventory_movements (product_id, created_at desc);

create table public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.cash_sessions(id),
  kind text not null check (kind in ('opening','sale','sale_void','debt_payment','expense','withdrawal','deposit')),
  method text not null check (method in ('cash','transfer')),
  amount int not null,                           -- con signo: + entra, - sale
  ref_table text,
  ref_id uuid,
  user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index on public.cash_movements (session_id);
create index on public.cash_movements (created_at desc);

create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);
insert into public.expense_categories(name) values
  ('Transporte'),('Servicios'),('Compras operativas'),('Empaques'),('Otros gastos');

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  description text not null,
  category_id uuid references public.expense_categories(id),
  amount int not null check (amount > 0),
  method text not null check (method in ('cash','transfer')),
  expense_date date not null default (now() at time zone 'America/Bogota')::date,
  notes text,
  user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity unique,
  public_token uuid not null unique default gen_random_uuid(),
  customer_name text not null,
  phone text not null,
  delivery_method text not null check (delivery_method in ('pickup','delivery')),
  address text,
  notes text,
  status text not null default 'received'
    check (status in ('received','confirmed','preparing','ready','delivered','cancelled')),
  estimated_total int not null check (estimated_total >= 0),
  delivery_fee int not null default 0 check (delivery_fee >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id),
  product_name text not null,
  sale_mode text not null,
  quantity int not null check (quantity > 0),
  unit_price int not null check (unit_price >= 0),
  line_total int not null check (line_total >= 0)
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  user_id uuid,
  action text not null,
  table_name text not null,
  record_id uuid,
  reason text,
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz not null default now()
);
create index on public.audit_log (table_name, created_at desc);

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create trigger products_touch before update on public.products for each row execute function public.touch_updated_at();
create trigger orders_touch before update on public.orders for each row execute function public.touch_updated_at();
