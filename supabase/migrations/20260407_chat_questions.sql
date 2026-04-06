-- chat_questions: log every AI chat interaction for product analytics
-- Repeated questions reveal UI gaps and missing explanations

create table if not exists public.chat_questions (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users(id) on delete cascade,
  question     text        not null,
  answer       text        not null,
  page_context jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists chat_questions_user_idx    on public.chat_questions(user_id);
create index if not exists chat_questions_created_idx on public.chat_questions(created_at desc);

alter table public.chat_questions enable row level security;

create policy "users_read_own" on public.chat_questions
  for select using (auth.uid() = user_id);

create policy "admins_read_all" on public.chat_questions
  for select using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'system_admin')
  );

create policy "authenticated_insert" on public.chat_questions
  for insert with check (auth.uid() = user_id);
