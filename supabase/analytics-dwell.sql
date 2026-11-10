-- =====================================================================
-- 기획서별 체류 시간 — 한 번만 실행
-- Supabase 대시보드 → SQL Editor → New query 에 붙여넣고 Run
-- (기존 방문 기록은 그대로 남고, 칸만 추가돼요. 여러 번 실행해도 괜찮아요)
-- =====================================================================
alter table public.events add column if not exists dur   int check (dur between 0 and 7200);   -- 실제로 본 초
alter table public.events add column if not exists page  int check (page between 0 and 5000);  -- 가장 뒤로 넘긴 쪽
alter table public.events add column if not exists pages int check (pages between 0 and 5000); -- 전체 쪽
alter table public.events drop constraint if exists events_type_check;
alter table public.events add constraint events_type_check check (type in ('view', 'section', 'click', 'pdf', 'read'));
