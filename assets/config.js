/* ============================================================
   Cấu hình chung — Checklist Hub
   ============================================================
   Khoá dưới đây là ANON key: nó được thiết kế để nhúng vào trang public.
   Quyền thật do RLS trên Postgres quyết định (xem schema.sql):
     - anon: SELECT / INSERT / UPDATE trên checklist_progress
     - anon: KHÔNG có quyền DELETE, không đọc được bảng nào khác
   KHÔNG bao giờ đặt service_role key hoặc access token vào file này.
   ============================================================ */

const SUPABASE_URL = 'https://sczmmxorxivfbpwmkvqh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNjem1teG9yeGl2ZmJwd21rdnFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc4OTk5MTcsImV4cCI6MjEwMzQ3NTkxN30.baCRAb3Ut9gHPH2QH1LKVXVNTtgrT9RP_sGF6j32uPQ';

/* Danh sách checklist. Thêm checklist mới = thêm 1 dòng ở đây + 1 file HTML.
   `id`    — khớp với CHECKLIST_ID khai trong file HTML, và là khoá trong DB
   `total` — số hạng mục trong file, dùng để tính % ở trang index
             (chạy `python3 tools/verify.py` để kiểm tra con số này không bị lệch) */
const CHECKLISTS = [
  {
    id: 'webnovel-vn',
    file: 'webnovel-vn.html',
    name: 'webnovel.vn',
    desc: 'SEO / GEO / AIO — 7 nhóm ưu tiên, từ lỗi chí tử tới backlink.',
    total: 77,
  },
];
