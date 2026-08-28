-- ============================================================
-- Checklist Hub — schema
-- Project: sczmmxorxivfbpwmkvqh
-- Chay lai duoc nhieu lan (idempotent). Khong xoa du lieu dang co.
-- ============================================================

-- ---------- 1. Danh sach checklist duoc phep ----------
-- Chan viec bom row rac voi checklist_id bat ky, va chan loi typo
-- CHECKLIST_ID trong HTML (tick se im lang ghi vao mot dataset song song).
create table if not exists public.checklists (
  id   text primary key check (id ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  name text not null
);

insert into public.checklists (id, name)
values ('webnovel-vn', 'webnovel.vn — SEO / GEO / AIO')
on conflict (id) do nothing;

-- ---------- 2. Tien do ----------
create table if not exists public.checklist_progress (
  checklist_id text        not null references public.checklists(id) on update cascade,
  item_id      text        not null check (item_id ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  done         boolean     not null default true,
  updated_by   text        not null check (char_length(trim(updated_by)) between 1 and 60),
  -- client_ts = thoi diem NGUOI DUNG bam, do client gui len.
  -- Dung de xu ly tranh chap: ban ghi cu hon KHONG duoc ghi de ban ghi moi hon.
  -- Trigger khong duoc dung vao cot nay.
  client_ts    timestamptz not null default now(),
  -- updated_at = thoi diem server ghi. Trigger tu dat, client khong ghi de duoc.
  updated_at   timestamptz not null default now(),
  primary key (checklist_id, item_id)
);

comment on table public.checklist_progress is
  'Tien do tick checklist, shared cho ca team. 1 row = 1 hang muc. done=false van giu row de biet ai bo tick.';

create index if not exists checklist_progress_cid_idx
  on public.checklist_progress (checklist_id);

-- Nang cap bang da ton tai. Ban dau bang khong co client_ts, khong co khoa ngoai,
-- va check tren item_id qua rong. Tren DB moi thi `create table` o tren da khai day du,
-- nen cac buoc duoi day tu bo qua — kiem tra theo SU TON TAI cua rang buoc tren cot,
-- khong theo ten, de khong tao ra rang buoc trung y nghia.
alter table public.checklist_progress
  add column if not exists client_ts timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.checklist_progress'::regclass
      and contype = 'f'
      and conkey = array[
        (select attnum from pg_attribute
         where attrelid = 'public.checklist_progress'::regclass and attname = 'checklist_id')
      ]
  ) then
    -- Don row rac (checklist_id khong co trong danh sach) truoc khi gan khoa ngoai.
    delete from public.checklist_progress
    where checklist_id not in (select id from public.checklists);

    alter table public.checklist_progress
      add constraint checklist_progress_cid_fk
      foreign key (checklist_id) references public.checklists(id) on update cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.checklist_progress'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%item_id ~%'
  ) then
    alter table public.checklist_progress
      add constraint checklist_progress_item_id_fmt
      check (item_id ~ '^[a-z0-9][a-z0-9-]{0,39}$');
  end if;
end $$;

-- ---------- 3. Lich su (append-only) ----------
-- Moi thay doi deu duoc luu lai. Neu ai do bo tick hang loat (vo tinh hoac co y)
-- thi con duong phuc hoi. anon khong doc/ghi duoc bang nay.
create table if not exists public.checklist_history (
  id           bigserial primary key,
  checklist_id text        not null,
  item_id      text        not null,
  done         boolean     not null,
  updated_by   text        not null,
  client_ts    timestamptz not null,
  recorded_at  timestamptz not null default now()
);

create index if not exists checklist_history_lookup_idx
  on public.checklist_history (checklist_id, item_id, recorded_at desc);

-- Hai trigger tach vai:
--  * BEFORE: dat updated_at. Phai la BEFORE de sua duoc gia tri sap ghi.
--  * AFTER:  ghi lich su. Phai la AFTER, vi BEFORE con chay ca voi nhung lan ghi
--            bi `on conflict ... where` tu choi -> lich su se co ban ghi ao.
create or replace function public.checklist_progress_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();                 -- client khong tu dat duoc thoi diem server
  return new;
end $$;

create or replace function public.checklist_progress_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.checklist_history (checklist_id, item_id, done, updated_by, client_ts)
  values (new.checklist_id, new.item_id, new.done, new.updated_by, new.client_ts);
  return null;
end $$;

drop trigger if exists checklist_progress_touch on public.checklist_progress;
drop trigger if exists checklist_progress_audit on public.checklist_progress;

create trigger checklist_progress_touch
  before insert or update on public.checklist_progress
  for each row execute function public.checklist_progress_touch();

create trigger checklist_progress_audit
  after insert or update on public.checklist_progress
  for each row execute function public.checklist_progress_audit();

-- ---------- 4. Cong ghi duy nhat cho trang web ----------
-- anon KHONG duoc ghi truc tiep vao bang. Ly do: PostgREST cho phep PATCH khong kem
-- filter, nghia la mot request duy nhat co the sua sach moi row trong bang.
-- Thay vao do, moi thay doi phai di qua ham nay: 1 request = 1 hang muc, va ban ghi
-- cu hon khong ghi de duoc ban ghi moi hon (so sanh client_ts).
-- Doi signature (ten cot tra ve) nen phai drop truoc khi create.
drop function if exists public.tick_item(text, text, boolean, text, timestamptz);

create or replace function public.tick_item(
  p_checklist_id text,
  p_item_id      text,
  p_done         boolean,
  p_updated_by   text,
  p_client_ts    timestamptz
)
returns table (out_item_id text, out_done boolean, out_updated_by text, out_updated_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_by text := trim(p_updated_by);
begin
  if char_length(v_by) < 1 or char_length(v_by) > 60 then
    raise exception 'ten nguoi tick phai dai 1-60 ky tu' using errcode = '22023';
  end if;
  if p_client_ts is null or p_client_ts > now() + interval '5 minutes' then
    raise exception 'client_ts khong hop le' using errcode = '22023';
  end if;

  insert into public.checklist_progress as cp
    (checklist_id, item_id, done, updated_by, client_ts)
  values (p_checklist_id, p_item_id, p_done, v_by, p_client_ts)
  on conflict (checklist_id, item_id) do update
    set done       = excluded.done,
        updated_by = excluded.updated_by,
        client_ts  = excluded.client_ts
    -- Bo qua ban ghi cu: tab de mo tu sang, flush luc chieu, khong duoc xoa viec
    -- nguoi khac lam luc trua.
    where excluded.client_ts > cp.client_ts;

  return query
    select cp.item_id, cp.done, cp.updated_by, cp.updated_at
    from public.checklist_progress cp
    where cp.checklist_id = p_checklist_id and cp.item_id = p_item_id;
end $$;

-- ---------- 5. Quyen ----------
alter table public.checklists          enable row level security;
alter table public.checklist_progress  enable row level security;
alter table public.checklist_history   enable row level security;

-- Xoa moi policy cu (ban dau tung mo INSERT/UPDATE truc tiep cho anon).
drop policy if exists "anon can read progress"   on public.checklist_progress;
drop policy if exists "anon can insert progress" on public.checklist_progress;
drop policy if exists "anon can update progress" on public.checklist_progress;
drop policy if exists "anon can read checklists" on public.checklists;

-- anon chi duoc DOC. Moi thao tac ghi di qua public.tick_item().
create policy "anon can read progress"
  on public.checklist_progress for select to anon using (true);
create policy "anon can read checklists"
  on public.checklists for select to anon using (true);
-- checklist_history: khong co policy nao => anon khong doc duoc gi.

revoke all on public.checklist_progress from anon;
revoke all on public.checklists         from anon;
revoke all on public.checklist_history  from anon, authenticated;
grant select on public.checklist_progress to anon;
grant select on public.checklists        to anon;

revoke all on function public.tick_item(text, text, boolean, text, timestamptz) from public;
grant execute on function public.tick_item(text, text, boolean, text, timestamptz) to anon;

-- Trigger function khong can quyen EXECUTE cho anon (trigger tu chay), va no la
-- security definer nen de mo la khong can thiet.
revoke all on function public.checklist_progress_audit() from public, anon, authenticated;
revoke all on function public.checklist_progress_touch() from public, anon, authenticated;
