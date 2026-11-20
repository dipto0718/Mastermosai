-- Mastermosai initial schema. Every table is protected by Row Level Security:
-- a student can only read or write their own rows (auth.uid() = user_id).

create extension if not exists pgcrypto;

-- 1. profiles: one row per account, created automatically at sign-up.
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  onboarded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2. learner_profiles
create table public.learner_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  level text not null,
  course text not null default '',
  institution text not null default '',
  language text not null default 'english'
    check (language in ('english', 'hindi', 'bengali', 'hinglish', 'banglish')),
  learning_style text not null default 'step_by_step'
    check (learning_style in ('visual', 'step_by_step', 'examples_first', 'practice_heavy', 'story')),
  daily_study_minutes int not null default 60 check (daily_study_minutes between 0 and 1440),
  updated_at timestamptz not null default now()
);

-- 3. learner_goals
create table public.learner_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  goal text not null check (char_length(goal) between 1 and 120),
  created_at timestamptz not null default now()
);
create index on public.learner_goals (user_id);

-- 4. learner_subjects (free text until the subject catalogue exists)
create table public.learner_subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subject text not null check (char_length(subject) between 1 and 60),
  kind text not null check (kind in ('strong', 'difficult')),
  unique (user_id, kind, subject)
);

-- 5. exam_goals
create table public.exam_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  exam_name text not null check (char_length(exam_name) between 1 and 80),
  exam_date date,
  created_at timestamptz not null default now()
);
create index on public.exam_goals (user_id);

-- 6. conversations: one per class
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'New class',
  last_mode text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.conversations (user_id, updated_at desc);

-- 7. messages
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  speaker text not null check (speaker in ('student', 'little_master', 'akash_master')),
  content text not null,
  created_at timestamptz not null default now()
);
create index on public.messages (conversation_id, created_at);
create index on public.messages (user_id, created_at);

-- 8. whiteboards: each board as a JSON scene, linked to Akash Master's message
create table public.whiteboards (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  scene jsonb not null,
  created_at timestamptz not null default now()
);
create index on public.whiteboards (conversation_id);

-- 9. class_notes
create table public.class_notes (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  summary text not null,
  created_at timestamptz not null default now()
);
create index on public.class_notes (conversation_id);

-- 10. learner_memories: the AI Brain, one row per kind + subject + topic
create table public.learner_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('strength', 'weakness', 'mistake', 'preference', 'goal', 'progress')),
  subject text not null default '',
  topic text not null default '',
  fact text not null check (char_length(fact) between 1 and 400),
  confidence real not null check (confidence between 0 and 1),
  updated_at timestamptz not null default now()
);
create unique index learner_memories_key on public.learner_memories (user_id, kind, lower(subject), lower(topic));

-- Guard: a message, board or note can only be attached to the same student's class.
create or replace function public.enforce_conversation_owner()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (
    select 1 from public.conversations c
    where c.id = new.conversation_id and c.user_id = new.user_id
  ) then
    raise exception 'conversation % does not belong to this student', new.conversation_id
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger messages_owner before insert or update on public.messages
  for each row execute function public.enforce_conversation_owner();
create trigger whiteboards_owner before insert or update on public.whiteboards
  for each row execute function public.enforce_conversation_owner();
create trigger class_notes_owner before insert or update on public.class_notes
  for each row execute function public.enforce_conversation_owner();

create or replace function public.enforce_board_message()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (
    select 1 from public.messages m
    where m.id = new.message_id and m.conversation_id = new.conversation_id
      and m.user_id = new.user_id and m.speaker = 'akash_master'
  ) then
    raise exception 'board must be linked to Akash Master''s message in the same class'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger whiteboards_message before insert or update on public.whiteboards
  for each row execute function public.enforce_board_message();

-- Row Level Security on all ten tables.
do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'learner_profiles', 'learner_goals', 'learner_subjects', 'exam_goals',
    'conversations', 'messages', 'whiteboards', 'class_notes', 'learner_memories'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using ((select auth.uid()) = user_id)
         with check ((select auth.uid()) = user_id)',
      t || '_own_rows', t
    );
  end loop;
end;
$$;
