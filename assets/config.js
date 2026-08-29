/* ============================================================
   Cấu hình chung — Checklist Hub
   ============================================================
   Khoá dưới đây là ANON key: nó được thiết kế để nhúng vào trang public.
   Quyền thật do RLS trên Postgres quyết định (xem schema.sql):
     - anon: chỉ SELECT trên checklist_progress và checklists
     - anon: mọi thao tác ghi đi qua RPC, không ghi trực tiếp vào bảng
   KHÔNG bao giờ đặt service_role key hoặc access token vào file này.

   Danh sách checklist KHÔNG nằm ở đây — nó nằm trong bảng `checklists` trên
   Supabase, và thêm được ngay trên trang hub. Xem README.md.
   ============================================================ */

const SUPABASE_URL = 'https://sczmmxorxivfbpwmkvqh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNjem1teG9yeGl2ZmJwd21rdnFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc4OTk5MTcsImV4cCI6MjEwMzQ3NTkxN30.baCRAb3Ut9gHPH2QH1LKVXVNTtgrT9RP_sGF6j32uPQ';

const SB_HEADERS = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
  'Content-Type': 'application/json',
};
