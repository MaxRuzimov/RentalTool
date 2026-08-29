-- M1: foundational schema — a profile row per auth.users, kept in sync via trigger.
-- Later milestones (M2 auth, M3 listings, etc.) extend this file's tables, not replace them.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  avatar_url text,
  phone text,
  city text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Base table (with phone) is only readable by its owner. Other users see the
-- public_profiles view below, which excludes phone. Phone gets surfaced to a
-- counterparty later (M5 booking flow), not exposed to every anon/auth client.
create policy "Users can view their own full profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- security_invoker defaults to false: the view runs as its (superuser) owner,
-- so it bypasses the owner-only RLS policy above and exposes these columns to everyone.
create view public.public_profiles as
  select id, full_name, avatar_url, city, created_at
  from public.profiles;

grant select on public.public_profiles to anon, authenticated;

-- Auto-create a profile row whenever a new auth user signs up.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();
