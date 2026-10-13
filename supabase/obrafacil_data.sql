-- ObraFácil — cópia na nuvem dos dados de cada usuário (orçamentos, clientes, serviços, dados do PDF).
-- Rodar UMA vez: Supabase → SQL Editor → New query → colar tudo → Run.
-- Cada usuário só lê e grava a própria linha (RLS). Sem esta tabela o app continua funcionando só no celular.

create table if not exists public.obrafacil_data (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.obrafacil_data enable row level security;

drop policy if exists "obrafacil: dono lê"       on public.obrafacil_data;
drop policy if exists "obrafacil: dono insere"   on public.obrafacil_data;
drop policy if exists "obrafacil: dono atualiza" on public.obrafacil_data;
drop policy if exists "obrafacil: dono apaga"    on public.obrafacil_data;

create policy "obrafacil: dono lê"       on public.obrafacil_data for select to authenticated using (auth.uid() = user_id);
create policy "obrafacil: dono insere"   on public.obrafacil_data for insert to authenticated with check (auth.uid() = user_id);
create policy "obrafacil: dono atualiza" on public.obrafacil_data for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "obrafacil: dono apaga"    on public.obrafacil_data for delete to authenticated using (auth.uid() = user_id);

grant select, insert, update, delete on public.obrafacil_data to authenticated;
revoke all on public.obrafacil_data from anon;
