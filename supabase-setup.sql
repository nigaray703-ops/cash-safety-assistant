create table if not exists public.cash_safety_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.cash_safety_profiles enable row level security;

drop policy if exists "Users can read own cash safety data" on public.cash_safety_profiles;
create policy "Users can read own cash safety data" on public.cash_safety_profiles for select using (auth.uid() = user_id);

drop policy if exists "Users can insert own cash safety data" on public.cash_safety_profiles;
create policy "Users can insert own cash safety data" on public.cash_safety_profiles for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update own cash safety data" on public.cash_safety_profiles;
create policy "Users can update own cash safety data" on public.cash_safety_profiles for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
