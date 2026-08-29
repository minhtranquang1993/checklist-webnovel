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

**Thêm checklist mới:** copy `webnovel-vn.html`, sửa `CHECKLIST_ID` và dữ liệu hạng mục, rồi bấm
**⬆ Upload file HTML** ở trang hub — không cần push repo. Chi tiết ở mục
[Upload file HTML](#upload-file-html-cách-nhanh-không-cần-push-repo).

## Cấu trúc

```
index.html            Trang hub — danh sách checklist + upload file + đăng ký file trong repo
checklist.html        Renderer chung cho checklist dạng def (?id=<mã>)
webnovel-vn.html      Checklist SEO/GEO/AIO cho webnovel.vn (77 hạng mục, dạng file)
assets/config.js      URL + anon key (không chứa danh sách checklist)
assets/hub.js         Logic trang hub: đọc danh sách, tính %, upload, đăng ký
assets/sync.js        Engine checklist: render, ghi tick, hàng đợi offline
assets/sanitize.js    Lọc HTML người dùng upload (whitelist tag/attribute)
assets/parse-def.js   Bóc CHECKLIST_ID/SCORES/SECTIONS từ file HTML + kiểm cấu trúc
assets/checklist.css  Style dùng chung
schema.sql            Tạo lại toàn bộ DB (chạy lại nhiều lần được)
seed.sql              17 hạng mục đã xong trước 27/08/2026 (chạy một lần)
tools/verify.py       Kiểm các file checklist HTML trước khi push
tools/item-ids.json   Ảnh chụp item id — chặn việc đổi/xoá id làm mất tick
tools/test/           70 test (chạy bằng node, không cần cài gì)
tools/test/dom-shim.js  DOMParser tối giản để test sanitize.js trong node
```

Danh sách checklist **không nằm trong repo** — nó ở bảng `checklists` trên Supabase. Vì vậy thêm
checklist mới không phải sửa file nào, và không phải deploy lại.

## Hai loại checklist

|  | `kind='file'` | `kind='def'` |
|---|---|---|
| Nội dung ở | file `.html` trong repo | bảng `checklist_defs` |
| Link ở hub | `webnovel-vn.html` | `checklist.html?id=<mã>` |
| Thêm bằng | push repo + **Đăng ký** | **Upload file HTML** |
| Sửa nội dung | sửa file + push | upload lại cùng file |
| `verify.py` gác | có | không — `upload_checklist_def()` gác |

Tick của cả hai loại nằm chung ở `checklist_progress` và dùng cùng `assets/sync.js`.
`webnovel-vn.html` là loại `file` và không thay đổi gì.

## Upload file HTML (cách nhanh, không cần push repo)

1. Copy `webnovel-vn.html` thành file mới ở máy. Sửa:
   - `const CHECKLIST_ID = 'dnd-seo';` — mã này là khoá trong DB.
   - `SCORES` và `SECTIONS` — dữ liệu hạng mục.
   - `<title>` — dùng làm gợi ý cho tên hiển thị.
2. Mở trang hub → **⬆ Upload file HTML** → chọn file. Trang hiện luôn mã, số nhóm, số hạng mục
   đọc được để anh đối chiếu trước khi gửi.
3. Bấm **Upload**. Xong — thẻ mới hiện ngay, không cần push repo, không cần chờ deploy.

Muốn sửa nội dung về sau: sửa file ở máy rồi upload lại chính nó. **Tick đã có vẫn giữ nguyên**
vì tick gắn với `item_id`, không gắn với nội dung.

Ba thứ được gác ở bước này:
- **Mã trùng với checklist dạng file** → server từ chối, vì tick của hai bên sẽ ghi chồng lên nhau.
- **Item id trùng nhau, hoặc sai định dạng** `^[a-z0-9][a-z0-9-]{0,39}$` → chặn ngay ở trình duyệt,
  kèm tên hạng mục sai, vì DB sẽ từ chối tick của những id đó.
- **Bản mới thiếu hạng mục đã có người tick** → server chặn và liệt kê id đó. Trang hỏi lại một
  lần; đồng ý thì mới ghi. Đây là bản chặt hơn của luật append-only bên dưới: nó chỉ báo động khi
  thật sự có tick sắp mất, không báo vì một id chưa ai dùng bị đổi tên.

Nội dung upload là **dữ liệu không tin được** — trang là public, ai có link cũng upload được. Vì vậy
`assets/sanitize.js` lọc lại mọi HTML trước khi chèn vào trang: bỏ `<script>`, `<style>`, `<iframe>`,
`<img>`, mọi `on*`, `style`, và `href="javascript:"`. Thẻ ngoài whitelist bị bỏ thẻ nhưng **giữ chữ**,
nên không mất nội dung. Lọc chạy **hai lần**: lúc upload và lúc render — không tin DB thay cho việc lọc.

Việc bóc `SCORES`/`SECTIONS` phải chạy chính JS của file (đó là JS literal, không phải JSON). Nó chạy
trong `<iframe sandbox="allow-scripts">` không có `allow-same-origin`: origin mờ, không đọc được DOM
của hub, không đọc được `localStorage`, không thấy anon key. Đường ra duy nhất là `postMessage`.

`checklist.html` lấy mã từ `?id=` — nghe như trái với luật "đừng lấy từ URL" ở dưới, nhưng lý do của
luật đó không áp dụng ở đây: mã không suy ra từ tên file, nó là **khoá chính trong DB** và phải có
trong `checklist_defs` mới render được. Đổi tên file `.html` ở máy không ảnh hưởng gì.

## Thêm checklist dạng file (cách cũ, file tự render lấy)

Dùng khi muốn file tự chủ hoàn toàn: header riêng, filter riêng, HTML tuỳ ý không qua whitelist.

1. Copy `webnovel-vn.html` thành file mới, ví dụ `dnd-seo.html`. Sửa 3 chỗ:
   - `const CHECKLIST_ID = 'dnd-seo';` — mã này là khoá trong DB, **hardcode, đừng lấy từ URL**
     (lấy từ URL thì đổi tên file là mất hết tick).
   - `SCORES` và `SECTIONS` — dữ liệu hạng mục.
   - Nội dung `<header>` và `<footer>`.
2. Chạy `python3 tools/verify.py --update-snapshot` — phải in `OK`.
3. Push lên GitHub, chờ Vercel deploy xong.
4. Mở trang hub → **+ Đăng ký file trong repo** → nhập tên file, mã, tên hiển thị → Đăng ký.

Form đọc trực tiếp file HTML trên server để đối chiếu: nếu `CHECKLIST_ID` trong file khác mã anh
nhập, hoặc file chưa push lên, nó báo lỗi ngay chứ không để nhân viên tick vào một chỗ sai rồi mới
phát hiện.

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
node --check assets/sanitize.js
node --check assets/parse-def.js
node tools/test/test.js            # 70 test: hàng đợi, gộp dữ liệu, chống mất tick, sanitize, parse
```

`sanitize.js` cần `DOMParser` — node không có, và repo không có dependency, nên test dùng
`tools/test/dom-shim.js` (bản tự viết vừa đủ). Nó kiểm được **logic whitelist**, nhưng không mô
phỏng được các mánh ở tầng parser của browser thật. Vì vậy phần XSS vẫn phải kiểm tay một lần trên
browser theo mục dưới.

## Kiểm tay phần upload (một lần, trên browser)

Chạy `python3 -m http.server 8899` rồi:

1. Copy `webnovel-vn.html` → `test-up.html`, sửa `CHECKLIST_ID='test-up'`, cắt còn ~3 hạng mục.
   Upload → thẻ mới hiện → mở ra tick được → refresh vẫn còn → % ở hub đúng.
2. Sửa chữ một hạng mục rồi upload lại → nội dung đổi, **tick giữ nguyên**.
3. Xoá một hạng mục **đã tick** rồi upload lại → phải bị chặn kèm tên id đó.
4. Upload file có `CHECKLIST_ID='webnovel-vn'` → phải bị chặn.
5. Nhét `<script>alert(1)</script>` và `<a href="javascript:alert(1)">` vào phần `b` → upload →
   mở trang: **không** có alert, DevTools không thấy thẻ `script`.
6. Mở `checklist.html` không có `?id=`, và `?id=khong-ton-tai` → thông báo lỗi tử tế, không trang trắng.
7. Tick khi tắt mạng → hiện "chưa lưu" → bật mạng → tự đẩy lên.

Dọn sau khi xong: xoá `test-up.html` ở máy, và trên Supabase
`delete from checklist_progress where checklist_id='test-up';`
`delete from checklists where id='test-up';` (bảng `checklist_defs` tự xoá theo).

## Về bảo mật

`assets/config.js` chứa **anon key** — đúng thiết kế, key này sinh ra để nhúng vào trang public.
Quyền thật do Postgres quyết định:

- anon **chỉ đọc** ba bảng `checklist_progress`, `checklists` và `checklist_defs`. Không có quyền
  INSERT/UPDATE/DELETE trực tiếp trên bảng nào.
- Mọi thao tác ghi đi qua bốn hàm, mỗi hàm làm đúng một việc:
  - `tick_item()` — **một request một hạng mục**. Không có đường nào để một request sửa sạch cả
    bảng. Từ chối bản ghi cũ hơn bản đang có (so `client_ts`), nên một tab để mở từ sáng, đẩy lên
    lúc chiều, không xoá được việc người khác làm lúc trưa.
  - `register_checklist()` — **chỉ thêm mới**. Mã đã tồn tại thì báo lỗi, không ghi đè metadata của
    checklist đang chạy. Tên file phải khớp `^[a-z0-9][a-z0-9-]{0,59}\.html$` nên không nhét được
    đường dẫn `../` hay URL ngoài vào chỗ trang hub dùng làm link.
  - `upload_checklist_def()` — thêm mới hoặc cập nhật nội dung checklist dạng `def`. **Từ chối** ghi
    lên một mã đang thuộc checklist dạng `file`, và **từ chối** bản upload làm mất tick của hạng mục
    đã được tick (trừ khi người dùng xác nhận). Không sửa được `kind` của row đang có.
  - `sync_checklist_total()` — chỉ sửa được đúng cột `total`, giới hạn 0–5000.
- `item_id` phải khớp `^[a-z0-9][a-z0-9-]{0,39}$`, `checklist_id` phải có trong bảng `checklists` →
  không bơm được row rác làm sai % tiến độ.
- Bảng `checklist_history` ghi lại mọi thay đổi; anon không đọc được, chỉ dùng để khôi phục.

**HTML trong `checklist_defs` là dữ liệu không tin được.** Ai có link cũng upload được, và nội dung
đó được chèn vào trang của cả team. Vì vậy `assets/sanitize.js` áp whitelist tag/attribute và chạy
**hai lần** — lúc upload và lúc render. Không tin DB thay cho việc lọc. Việc chạy JS của file để bóc
`SECTIONS` diễn ra trong `<iframe sandbox="allow-scripts">` không có `allow-same-origin`, nên script
đó không đọc được `localStorage` và không thấy anon key.

Các file `.html` trong repo (như `webnovel-vn.html`) **không** đi qua sanitize — nội dung của chúng do
repo quyết định, mà repo thì chỉ người có quyền push mới sửa được.

**service_role key và access token không bao giờ vào repo này.** Chúng nằm ở
`~/.config/supabase/webnovel-checklist.env` (chmod 600). Chỉ cần chúng khi chạy `schema.sql` /
`seed.sql` hoặc khôi phục dữ liệu.

Trang là public nên ai có link đều tick được, đăng ký được và **upload được** checklist, và tên là tự
khai. Đây là lựa chọn có ý thức: đổi tính chặt chẽ lấy việc không phải quản lý tài khoản cho nhân
viên. Trước đây còn một ràng buộc phụ — checklist mới chỉ hiện được nếu file HTML đã có trong repo —
**ràng buộc đó không còn với dạng `def`**: upload không cần push repo. Đổi lại, nội dung upload bị
sanitize, và ai đó phá thì chỉ phá được nội dung hiển thị, không chạy được code và không đọc được
tick của checklist khác. Nếu cần siết, thêm kiểm tra mật khẩu chung vào `upload_checklist_def()`,
hoặc bật Supabase Auth.
