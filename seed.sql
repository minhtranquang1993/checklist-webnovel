-- ============================================================
-- seed.sql — 17 hang muc Minh da lam xong truoc 27/08/2026
-- ------------------------------------------------------------
-- CHAY MOT LAN cho moi checklist moi. Dung `do nothing`, KHONG `do update`:
-- chay lai nhieu lan cung khong ghi de tick/bo-tick that cua nhan vien.
--
-- Nguon cua 17 id nay: DONE_PRESET trong file goc
-- webnovel-vn-checklist-seo-geo-aio.html (3 dot do lai live: 24/08, 26/08, 27/08).
-- p1-4c KHONG tick: BookChapter.name trong JSON-LD van con lap "Chương 1: Chương 1:".
--
-- Chay bang service_role (SQL Editor tren Supabase), khong phai tu trang web.
-- ============================================================

insert into public.checklist_progress (checklist_id, item_id, done, updated_by, client_ts)
values
  -- dot 24/08/2026
  ('webnovel-vn', 'p0-1a', true, 'Minh', '2026-08-24T00:00:00Z'),
  ('webnovel-vn', 'p0-1b', true, 'Minh', '2026-08-24T00:00:00Z'),
  ('webnovel-vn', 'p0-1c', true, 'Minh', '2026-08-24T00:00:00Z'),
  ('webnovel-vn', 'p1-1a', true, 'Minh', '2026-08-24T00:00:00Z'),
  ('webnovel-vn', 'p1-3a', true, 'Minh', '2026-08-24T00:00:00Z'),
  -- dot 26/08/2026 — da verify live
  ('webnovel-vn', 'p0-2d', true, 'Minh', '2026-08-26T00:00:00Z'),
  ('webnovel-vn', 'p0-3c', true, 'Minh', '2026-08-26T00:00:00Z'),
  ('webnovel-vn', 'p0-3d', true, 'Minh', '2026-08-26T00:00:00Z'),
  ('webnovel-vn', 'p1-2b', true, 'Minh', '2026-08-26T00:00:00Z'),
  ('webnovel-vn', 'p1-4a', true, 'Minh', '2026-08-26T00:00:00Z'),
  ('webnovel-vn', 'p2-6b', true, 'Minh', '2026-08-26T00:00:00Z'),
  -- dot 27/08/2026 — Minh bao xong, da do lai live
  ('webnovel-vn', 'p0-2a', true, 'Minh', '2026-08-27T00:00:00Z'),
  ('webnovel-vn', 'p0-2b', true, 'Minh', '2026-08-27T00:00:00Z'),
  ('webnovel-vn', 'p0-2c', true, 'Minh', '2026-08-27T00:00:00Z'),
  ('webnovel-vn', 'p0-2e', true, 'Minh', '2026-08-27T00:00:00Z'),
  ('webnovel-vn', 'p1-2c', true, 'Minh', '2026-08-27T00:00:00Z'),
  ('webnovel-vn', 'p1-4b', true, 'Minh', '2026-08-27T00:00:00Z')
on conflict (checklist_id, item_id) do nothing;
