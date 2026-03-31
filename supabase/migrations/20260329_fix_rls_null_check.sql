-- Fix NULL contact_email vulnerability in RLS policies
-- Run this in Supabase SQL Editor

-- 1. Customers
drop policy if exists "Customers can view their own record" on public.customers;
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

-- 2. Plants
drop policy if exists "Customers can view their plants" on public.plants;
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

-- 3. Assessments (also restrict to workshop phases only)
drop policy if exists "Customers can view their assessments" on public.assessments;
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

-- 4. Reports
drop policy if exists "Customers can view their reports" on public.reports;
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

-- 5. Action items
drop policy if exists "Customers can view their action items" on public.action_items;
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
