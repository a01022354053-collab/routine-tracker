-- 일상 매니저 웹 버전 저장소 (Supabase SQL Editor에서 한 번 실행)
-- 앱의 모든 기록을 "경로(path) → JSON" 문서로 저장한다. 로그인한 본인 것만 읽고 쓸 수 있다.

create table if not exists public.app_docs (
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  path text not null,          -- 예: days/2026-11-21, money/main
  col text not null,           -- 경로에서 마지막 칸을 뺀 것. 예: days, money
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (owner, path)
);

create index if not exists app_docs_owner_col on public.app_docs (owner, col);

alter table public.app_docs enable row level security;

drop policy if exists "본인 기록만" on public.app_docs;
create policy "본인 기록만" on public.app_docs
  for all
  using (owner = auth.uid())
  with check (owner = auth.uid());

-- 다른 기기에서 바꾼 것이 바로 보이도록 실시간 알림을 켠다
do $$
begin
  alter publication supabase_realtime add table public.app_docs;
exception when duplicate_object then null;
end $$;
