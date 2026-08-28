# Checklist Hub

Bảng theo dõi checklist dùng chung cho cả team. Nhân viên tick xong, mọi người mở lên đều thấy —
tick lưu trên server (Supabase), không phải trong trình duyệt từng máy.

Trang chạy: **https://minhtranquang1993.github.io/checklist-webnovel/**

## Dùng thế nào

1. Mở trang, nhập tên một lần (lưu trong máy, không cần mật khẩu).
2. Click ô vuông để đánh dấu xong. Click vào dòng để mở hướng dẫn chi tiết.
3. Cạnh mỗi hạng mục hiện **ai tick · lúc nào**.
4. Mất mạng vẫn tick được — trang giữ lại và tự đẩy lên khi có mạng. Lúc đó dòng tên hiện
   "chưa lưu", và ô trạng thái ở trên đếm số thay đổi đang chờ.

Nút **Xoá tick** bỏ tick của **cả team**, không chỉ máy đang dùng. Phải gõ đúng tên checklist
(`webnovel-vn`) để xác nhận. Mọi thay đổi đều được ghi vào bảng lịch sử nên vẫn khôi phục được
bằng SQL nếu cần.

## Cấu trúc

```
index.html            Trang hub — liệt kê checklist + % tiến độ đọc từ server
webnovel-vn.html      Checklist SEO/GEO/AIO cho webnovel.vn (77 hạng mục)
assets/config.js      URL + anon key + danh sách checklist
assets/sync.js        Engine dùng chung: render, ghi tick, hàng đợi offline
assets/checklist.css  Style dùng chung
schema.sql            Tạo lại toàn bộ DB (chạy lại nhiều lần được)
seed.sql              17 hạng mục đã xong trước 27/08/2026 (chạy một lần)
tools/verify.py       Chặn lệch giữa config.js và file HTML
tools/item-ids.json   Ảnh chụp item id — chặn việc đổi/xoá id làm mất tick
tools/test/           23+ test logic sync (chạy bằng node, không cần cài gì)
```

## Thêm checklist mới

1. Copy `webnovel-vn.html` thành file mới, ví dụ `dnd-seo.html`.
2. Sửa 3 chỗ trong file mới:
   - `const CHECKLIST_ID = 'dnd-seo';` — id này là khoá trong DB, **hardcode, đừng lấy từ URL**
     (đổi tên file hay đổi đường dẫn sẽ làm mất hết tick).
   - `SCORES` và `SECTIONS` — dữ liệu của checklist mới.
   - Nội dung `<header>` và `<footer>`.
3. Thêm id vào danh sách được phép trong DB:
   ```sql
   insert into public.checklists (id, name) values ('dnd-seo', 'Tên hiển thị')
   on conflict (id) do nothing;
   ```
   Bỏ bước này thì tick sẽ báo lỗi khoá ngoại — cố ý như vậy, để một cái typo `CHECKLIST_ID`
   không âm thầm ghi vào một dataset song song mà không ai biết.
4. Thêm một dòng vào `CHECKLISTS` trong `assets/config.js` (`id`, `file`, `name`, `desc`, `total`).
5. Chạy `python3 tools/verify.py --update-snapshot` — ghi nhận các item id mới, phải in `OK`.
   Sau đó chạy `python3 tools/verify.py` (không cờ) trước mỗi commit.

**Item id chỉ được thêm, không được đổi tên hay xoá.** Tick trong DB gắn với `item_id`; đổi id
trong HTML là mất tick của hạng mục đó (row cũ thành mồ côi, trang bỏ qua nó). `tools/verify.py`
so với ảnh chụp ở `tools/item-ids.json` và **báo lỗi** nếu có id biến mất. Nếu thật sự cố ý đổi,
chạy `--update-snapshot` — nó sẽ in cảnh báo id nào thành mồ côi để anh dọn bằng SQL.

## Chạy thử ở máy

Mở trực tiếp bằng double-click (`file://`) **chạy được** — đã kiểm tra: script cùng thư mục vẫn
load, và Supabase trả `Access-Control-Allow-Origin: *` nên gọi API không bị CORS chặn.

Vẫn nên dùng local server cho giống môi trường thật:

```bash
cd checklist-webnovel
python3 -m http.server 8899
# mở http://127.0.0.1:8899/
```

## Kiểm tra trước khi commit

```bash
python3 tools/verify.py            # config.js phải khớp với file HTML
node --check assets/sync.js        # cú pháp JS
node tools/test/test.js            # 27 test logic sync: hàng đợi, gộp dữ liệu, chống mất tick
```

## Về bảo mật

`assets/config.js` chứa **anon key** — đúng thiết kế, key này sinh ra để nhúng vào trang public.
Quyền thật do Postgres quyết định:

- anon **chỉ đọc** hai bảng `checklist_progress` và `checklists`.
- Mọi thao tác ghi đi qua hàm `public.tick_item()` — **một request một hạng mục**. Không có đường
  nào để một request sửa sạch cả bảng.
- Hàm từ chối bản ghi cũ hơn bản đang có (so `client_ts`), nên một tab để mở từ sáng, đẩy lên lúc
  chiều, không xoá được việc người khác làm lúc trưa.
- `item_id` phải khớp `^[a-z0-9][a-z0-9-]{0,39}$`, `checklist_id` phải có trong bảng `checklists` →
  không bơm được row rác làm sai % tiến độ.
- Bảng `checklist_history` ghi lại mọi thay đổi; anon không đọc được, chỉ dùng để khôi phục.

**service_role key và access token không bao giờ vào repo này.** Chúng nằm ở
`~/.config/supabase/webnovel-checklist.env` (chmod 600). Chỉ cần chúng khi chạy `schema.sql` /
`seed.sql` hoặc khôi phục dữ liệu.

Trang là public nên ai có link đều tick được, và tên là tự khai. Đây là lựa chọn có ý thức: đổi
tính chặt chẽ lấy việc không phải quản lý tài khoản cho nhân viên. Nếu về sau cần siết, thay
`tick_item` bằng bản kiểm tra mật khẩu chung, hoặc bật Supabase Auth.
