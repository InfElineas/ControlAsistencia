alter table public.profiles
add column if not exists last_connection_at timestamptz;

create index if not exists profiles_last_connection_at_idx
  on public.profiles (last_connection_at desc);
