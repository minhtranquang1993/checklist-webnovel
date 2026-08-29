# Checklist Hub

Bảng theo dõi checklist dùng chung cho cả team. Nhân viên tick xong, mọi người mở lên đều thấy —
tick lưu trên server (Supabase), không phải trong trình duyệt từng máy.

## Deploy

Repo là static thuần — không có bước build, không `package.json`, không dependency.

**Vercel**: Add New → Project → import repo này. Framework Preset để **Other**, Build Command
để trống, Output Directory để trống (hoặc `.`). Mỗi lần push lên `main` là Vercel tự deploy lại.

Không cần sửa gì trong `assets/config.js` khi đổi domain: Supabase trả
`Access-Control-Allow-Origin: *` nên trang gọi API được từ bất kỳ origin nào — đã kiểm tra chạy
thật từ `localhost`, từ `file://`, và không có chỗ nào trong code phụ thuộc vào tên miền.

**Sửa nhanh qua giao diện GitHub**: mở file → nút bút chì → Commit changes. Vercel sẽ deploy lại
sau đó. Nếu sửa `webnovel-vn.html` hay `assets/config.js` theo cách này thì **chạy
`python3 tools/verify.py` ở máy trước** — nó là thứ chặn `total` bị lệch và item id bị đổi tên
làm mất tick, và giao diện web không chạy được nó.

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
index.html            Trang hub — danh sách checklist + % tiến độ + form thêm checklist
webnovel-vn.html      Checklist SEO/GEO/AIO cho webnovel.vn (77 hạng mục)
assets/config.js      URL + anon key (không chứa danh sách checklist)
assets/hub.js         Logic trang hub: đọc danh sách, tính %, đăng ký checklist mới
assets/sync.js        Engine checklist: render, ghi tick, hàng đợi offline
assets/checklist.css  Style dùng chung
schema.sql            Tạo lại toàn bộ DB (chạy lại nhiều lần được)
seed.sql              17 hạng mục đã xong trước 27/08/2026 (chạy một lần)
tools/verify.py       Kiểm các file checklist HTML trước khi push
tools/item-ids.json   Ảnh chụp item id — chặn việc đổi/xoá id làm mất tick
tools/test/           27 test logic sync (chạy bằng node, không cần cài gì)
```

Danh sách checklist **không nằm trong repo** — nó ở bảng `checklists` trên Supabase. Vì vậy thêm
checklist mới không phải sửa file nào, và không phải deploy lại.

## Thêm checklist mới

1. Copy `webnovel-vn.html` thành file mới, ví dụ `dnd-seo.html`. Sửa 3 chỗ:
   - `const CHECKLIST_ID = 'dnd-seo';` — mã này là khoá trong DB, **hardcode, đừng lấy từ URL**
     (lấy từ URL thì đổi tên file là mất hết tick).
   - `SCORES` và `SECTIONS` — dữ liệu hạng mục.
   - Nội dung `<header>` và `<footer>`.
2. Chạy `python3 tools/verify.py --update-snapshot` — phải in `OK`.
3. Push lên GitHub, chờ Vercel deploy xong.
4. Mở trang hub → **+ Thêm checklist** → nhập tên file, mã, tên hiển thị → Đăng ký.

Bước 4 thay cho việc sửa config và chạy SQL bằng tay. Form đọc trực tiếp file HTML trên server để
đối chiếu: nếu `CHECKLIST_ID` trong file khác mã anh nhập, hoặc file chưa push lên, nó báo lỗi ngay
chứ không để nhân viên tick vào một chỗ sai rồi mới phát hiện.

Số hạng mục không cần khai ở đâu cả — trang checklist tự báo lại cho DB mỗi lần mở, nên thêm hay
bớt hạng mục trong file là % ở trang hub tự đúng theo.

**Item id chỉ được thêm, không được đổi tên hay xoá.** Tick trong DB gắn với `item_id`; đổi id
trong HTML là mất tick của hạng mục đó (row cũ thành mồ côi, trang bỏ qua nó). `tools/verify.py`
so với ảnh chụp ở `tools/item-ids.json` và **báo lỗi** nếu có id biến mất. Nếu thật sự cố ý đổi,
chạy `--update-snapshot` — nó in cảnh báo id nào thành mồ côi để anh dọn bằng SQL.

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
python3 tools/verify.py            # kiểm các file checklist HTML
node --check assets/sync.js        # cú pháp JS
node --check assets/hub.js
node tools/test/test.js            # 27 test logic sync: hàng đợi, gộp dữ liệu, chống mất tick
```

## Về bảo mật

`assets/config.js` chứa **anon key** — đúng thiết kế, key này sinh ra để nhúng vào trang public.
Quyền thật do Postgres quyết định:

- anon **chỉ đọc** hai bảng `checklist_progress` và `checklists`. Không có quyền
  INSERT/UPDATE/DELETE trực tiếp trên bảng nào.
- Mọi thao tác ghi đi qua ba hàm, mỗi hàm làm đúng một việc:
  - `tick_item()` — **một request một hạng mục**. Không có đường nào để một request sửa sạch cả
    bảng. Từ chối bản ghi cũ hơn bản đang có (so `client_ts`), nên một tab để mở từ sáng, đẩy lên
    lúc chiều, không xoá được việc người khác làm lúc trưa.
  - `register_checklist()` — **chỉ thêm mới**. Mã đã tồn tại thì báo lỗi, không ghi đè metadata của
    checklist đang chạy. Tên file phải khớp `^[a-z0-9][a-z0-9-]{0,59}\.html$` nên không nhét được
    đường dẫn `../` hay URL ngoài vào chỗ trang hub dùng làm link.
  - `sync_checklist_total()` — chỉ sửa được đúng cột `total`, giới hạn 0–5000.
- `item_id` phải khớp `^[a-z0-9][a-z0-9-]{0,39}$`, `checklist_id` phải có trong bảng `checklists` →
  không bơm được row rác làm sai % tiến độ.
- Bảng `checklist_history` ghi lại mọi thay đổi; anon không đọc được, chỉ dùng để khôi phục.

**service_role key và access token không bao giờ vào repo này.** Chúng nằm ở
`~/.config/supabase/webnovel-checklist.env` (chmod 600). Chỉ cần chúng khi chạy `schema.sql` /
`seed.sql` hoặc khôi phục dữ liệu.

Trang là public nên ai có link đều tick được và đăng ký được checklist, và tên là tự khai. Đây là
lựa chọn có ý thức: đổi tính chặt chẽ lấy việc không phải quản lý tài khoản cho nhân viên. Ràng
buộc thật nằm ở chỗ khác: một checklist mới chỉ hiện được nếu **file HTML đã có trong repo** — mà
repo thì chỉ anh push được. Nếu về sau cần siết, thêm kiểm tra mật khẩu chung vào các hàm RPC, hoặc
bật Supabase Auth.
