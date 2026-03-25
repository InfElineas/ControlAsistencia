alter table public.profiles
add column if not exists is_active boolean not null default true,
add column if not exists deactivation_reason text,
add column if not exists contract_cancelled_at date,
add column if not exists deactivated_at timestamptz,
add column if not exists deactivated_by uuid;

create index if not exists profiles_is_active_idx
  on public.profiles (is_active);
