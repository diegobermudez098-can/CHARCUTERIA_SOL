-- Retiros y depósitos manuales de caja
alter table public.cash_movements add column if not exists note text;

create or replace function public.register_cash_movement(p_kind text, p_method text, p_amount int, p_note text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_session uuid; v_balance int; v_id uuid;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if p_kind not in ('withdrawal','deposit') then raise exception 'Tipo de movimiento inválido'; end if;
  if p_method not in ('cash','transfer') then raise exception 'Método inválido'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Valor inválido'; end if;
  if p_note is null or length(trim(p_note)) < 3 then raise exception 'Indica el motivo del movimiento'; end if;
  select id into v_session from cash_sessions where closed_at is null limit 1;
  if v_session is null then raise exception 'Primero abre la caja'; end if;
  if p_kind = 'withdrawal' then
    select coalesce(sum(amount),0) into v_balance from cash_movements where session_id = v_session and method = p_method;
    if p_amount > v_balance then raise exception 'El retiro supera el dinero disponible (%)', v_balance; end if;
  end if;
  insert into cash_movements(session_id, kind, method, amount, note, user_id)
  values (v_session, p_kind, p_method, case when p_kind = 'withdrawal' then -p_amount else p_amount end, p_note, v_uid)
  returning id into v_id;
  perform write_audit(p_kind, 'cash_movements', v_id, p_note, null, jsonb_build_object('amount', p_amount, 'method', p_method));
  return v_id;
end $$;
revoke all on function public.register_cash_movement(text,text,int,text) from public, anon;
grant execute on function public.register_cash_movement(text,text,int,text) to authenticated;
