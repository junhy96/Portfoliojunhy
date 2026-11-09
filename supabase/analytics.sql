-- =====================================================================
-- 포트폴리오 접속 통계 — Supabase 설정
-- Supabase 대시보드 → SQL Editor → New query 에 전체를 붙여넣고 Run
-- 맨 아래 이메일을 관리자로 쓸 이메일로 바꾼 뒤 실행하세요.
-- =====================================================================

-- 방문 기록 (이름·IP 같은 개인정보는 저장하지 않음)
create table if not exists public.events (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  visitor    text not null check (char_length(visitor) <= 64),   -- 브라우저마다 무작위 ID
  session    text not null check (char_length(session) <= 64),   -- 탭을 열 때마다 무작위 ID
  type       text not null check (type in ('view', 'section', 'click', 'pdf')),
  section    text check (char_length(section) <= 20),
  theme      text check (char_length(theme) <= 20),
  x          real check (x between 0 and 1),                      -- 클릭 위치 (화면 비율)
  y          real check (y between 0 and 1),
  target     text check (char_length(target) <= 120),             -- 누른 버튼·카드 이름, 연 PDF 제목
  device     text check (device in ('desktop', 'tablet', 'mobile')),
  vw         int check (vw between 0 and 10000),
  vh         int check (vh between 0 and 10000),
  referrer   text check (char_length(referrer) <= 200),
  lang       text check (char_length(lang) <= 20),
  tz         text check (char_length(tz) <= 60)
);
create index if not exists events_created_at_idx on public.events (created_at);

-- 통계를 볼 수 있는 관리자 이메일 목록
create table if not exists public.admins (
  email text primary key
);

alter table public.events enable row level security;
alter table public.admins enable row level security;

-- 방문자: 기록 추가만 가능 (읽기·수정·삭제 불가)
drop policy if exists "visitors insert events" on public.events;
create policy "visitors insert events" on public.events
  for insert to anon, authenticated with check (true);

-- 관리자: 로그인한 이메일이 admins 목록에 있을 때만 읽기·삭제
drop policy if exists "admins read events" on public.events;
create policy "admins read events" on public.events
  for select to authenticated
  using (exists (select 1 from public.admins a where a.email = auth.jwt() ->> 'email'));

drop policy if exists "admins delete events" on public.events;
create policy "admins delete events" on public.events
  for delete to authenticated
  using (exists (select 1 from public.admins a where a.email = auth.jwt() ->> 'email'));

drop policy if exists "admins read self" on public.admins;
create policy "admins read self" on public.admins
  for select to authenticated
  using (email = auth.jwt() ->> 'email');

grant insert on public.events to anon, authenticated;
grant select, delete on public.events to authenticated;
grant select on public.admins to authenticated;

-- ▼ 관리자로 쓸 이메일 (Authentication → Users 에서 만든 계정과 같아야 함)
insert into public.admins (email) values ('your-email@example.com')
on conflict do nothing;
