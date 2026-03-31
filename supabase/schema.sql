-- ============================================================
-- Al-RMX Platform — Database Schema
-- Run this in Supabase SQL Editor
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ── PROFILES ─────────────────────────────────────────────────
-- Extends Supabase auth.users with role and display name
create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text not null,
  full_name text,
  role text not null default 'customer' check (role in ('admin', 'customer')),
  created_at timestamptz not null default now()
);

-- Auto-create profile when user signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    coalesce(new.raw_user_meta_data->>'role', 'customer')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── CUSTOMERS ────────────────────────────────────────────────
create table public.customers (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  country text not null,
  contact_email text,
  contact_name text,
  created_by uuid references public.profiles(id) not null,
  created_at timestamptz not null default now()
);

-- ── PLANTS ───────────────────────────────────────────────────
create table public.plants (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid references public.customers(id) on delete cascade not null,
  name text not null,
  country text not null,
  created_at timestamptz not null default now()
);

-- ── ASSESSMENTS ──────────────────────────────────────────────
create table public.assessments (
  id uuid primary key default uuid_generate_v4(),
  plant_id uuid references public.plants(id) on delete cascade not null,
  analyst_id uuid references public.profiles(id) not null,
  date date not null default current_date,
  season text not null default 'peak' check (season in ('peak', 'summer')),
  answers jsonb not null default '{}',
  scores jsonb not null default '{}',
  overall integer,
  bottleneck text,
  ebitda_monthly numeric,
  hidden_rev_monthly numeric,
  is_baseline boolean not null default false,
  baseline_id uuid references public.assessments(id),
  created_at timestamptz not null default now()
);

-- ── REPORTS ──────────────────────────────────────────────────
create table public.reports (
  id uuid primary key default uuid_generate_v4(),
  assessment_id uuid references public.assessments(id) on delete cascade not null unique,
  executive text,
  diagnosis text,
  actions text,
  edited boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── ACTION ITEMS ─────────────────────────────────────────────
create table public.action_items (
  id uuid primary key default uuid_generate_v4(),
  assessment_id uuid references public.assessments(id) on delete cascade not null,
  text text not null,
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done')),
  owner text,
  value text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── ROW LEVEL SECURITY ───────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.plants enable row level security;
alter table public.assessments enable row level security;
alter table public.reports enable row level security;
alter table public.action_items enable row level security;

-- Profiles: users see their own, admins see all
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Admins can view all profiles"
  on public.profiles for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Customers: admins manage all, customers see their own
create policy "Admins can manage all customers"
  on public.customers for all
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "Customers can view their own record"
  on public.customers for select
  using (
    public.customers.contact_email is not null
    and exists (
      select 1 from public.profiles
      where id = auth.uid()
      and email = public.customers.contact_email
    )
  );

-- Plants: admins manage all, customers see their own
create policy "Admins can manage all plants"
  on public.plants for all
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "Customers can view their plants"
  on public.plants for select
  using (
    exists (
      select 1 from public.customers c
      join public.profiles p on p.email = c.contact_email and c.contact_email is not null
      where c.id = public.plants.customer_id
      and p.id = auth.uid()
    )
  );

-- Assessments: admins manage all, customers view their own
create policy "Admins can manage all assessments"
  on public.assessments for all
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "Customers can view their assessments"
  on public.assessments for select
  using (
    exists (
      select 1 from public.plants pl
      join public.customers c on c.id = pl.customer_id
      join public.profiles p on p.email = c.contact_email and c.contact_email is not null
      where pl.id = public.assessments.plant_id
      and p.id = auth.uid()
    )
    and public.assessments.phase in ('workshop', 'workshop_complete')
  );

-- Reports: same as assessments
create policy "Admins can manage all reports"
  on public.reports for all
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "Customers can view their reports"
  on public.reports for select
  using (
    exists (
      select 1 from public.assessments a
      join public.plants pl on pl.id = a.plant_id
      join public.customers c on c.id = pl.customer_id
      join public.profiles p on p.email = c.contact_email and c.contact_email is not null
      where a.id = public.reports.assessment_id
      and p.id = auth.uid()
    )
  );

-- Action items: same as assessments
create policy "Admins can manage all action items"
  on public.action_items for all
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "Customers can view their action items"
  on public.action_items for select
  using (
    exists (
      select 1 from public.assessments a
      join public.plants pl on pl.id = a.plant_id
      join public.customers c on c.id = pl.customer_id
      join public.profiles p on p.email = c.contact_email and c.contact_email is not null
      where a.id = public.action_items.assessment_id
      and p.id = auth.uid()
    )
  );

-- ── INDEXES ──────────────────────────────────────────────────
create index on public.plants (customer_id);
create index on public.assessments (plant_id);
create index on public.assessments (analyst_id);
create index on public.reports (assessment_id);
create index on public.action_items (assessment_id);
