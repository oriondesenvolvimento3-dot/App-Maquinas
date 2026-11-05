-- Criação da tabela dedicada de clientes (Meus Clientes) no Supabase
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  is_active boolean default true,
  created_at timestamp with time zone default now()
);

-- Índice para busca rápida por nome
create index if not exists idx_clients_name on public.clients (name);

-- Habilita RLS com políticas para usuários autenticados
alter table public.clients enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'clients' and policyname = 'Permitir leitura de clientes para autenticados'
  ) then
    create policy "Permitir leitura de clientes para autenticados"
      on public.clients for select
      to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies where tablename = 'clients' and policyname = 'Permitir insercao de clientes para autenticados'
  ) then
    create policy "Permitir insercao de clientes para autenticados"
      on public.clients for insert
      to authenticated
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies where tablename = 'clients' and policyname = 'Permitir atualizacao de clientes para autenticados'
  ) then
    create policy "Permitir atualizacao de clientes para autenticados"
      on public.clients for update
      to authenticated
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies where tablename = 'clients' and policyname = 'Permitir exclusao de clientes para autenticados'
  ) then
    create policy "Permitir exclusao de clientes para autenticados"
      on public.clients for delete
      to authenticated
      using (true);
  end if;
end $$;

