-- ============================================================================
-- MIGRATION: Adiciona suporte à modalidade de cobrança por Hora ('hour') ou KM ('km')
-- Data: 2026-11-05
-- ============================================================================

alter table public.machines
  add column if not exists billing_unit text not null default 'hour'
  check (billing_unit in ('hour', 'km'));

alter table public.work_logs
  add column if not exists billing_unit text default 'hour';

