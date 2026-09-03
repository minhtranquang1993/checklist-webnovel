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
assets/parse-def.js   Bóc dữ liệu checklist từ file HTML (khai SECTIONS, hoặc đọc cấu trúc), kiểm cấu trúc
assets/checklist.css  Style dùng chung
schema.sql            Tạo lại toàn bộ DB (chạy lại nhiều lần được)
seed.sql              17 hạng mục đã xong trước 27/08/2026 (chạy một lần)
tools/verify.py       Kiểm các file checklist HTML trước khi push
tools/item-ids.json   Ảnh chụp item id — chặn việc đổi/xoá id làm mất tick
tools/test/           123 test (chạy bằng node, không cần cài gì)
tools/test/dom-shim.js  DOM tối giản (DOMParser + template) để test bằng node
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
| Xoá từ web | không | có (nút **Xoá** trên thẻ) |
| `verify.py` gác | có | không — `upload_checklist_def()` gác |

Tick của cả hai loại nằm chung ở `checklist_progress` và dùng cùng `assets/sync.js`.
`webnovel-vn.html` là loại `file` và không thay đổi gì.

## Upload file HTML (cách nhanh, không cần push repo)

1. Có file checklist `.html` ở máy — một trong hai dạng ở mục dưới.
2. Mở trang hub → **⬆ Upload file HTML** → chọn file. Trang hiện luôn mã, số nhóm, số hạng mục
   đọc được để anh đối chiếu trước khi gửi.
3. Bấm **Upload**. Xong — thẻ mới hiện ngay, không cần push repo, không cần chờ deploy.

### Hai dạng file được nhận

**Dạng 1 — file khai dữ liệu** (khuôn của `webnovel-vn.html`): một thẻ `<script>` inline khai
`const SECTIONS` (và `SCORES` nếu muốn có bảng điểm). Copy `webnovel-vn.html` rồi sửa dữ liệu hạng
mục và `<title>` là xong. Dạng này chính xác nhất vì id, nhóm, `e`/`w` đều do file nói rõ.

**Dạng 2 — file viết tay, hạng mục nằm trong HTML**: không có mảng dữ liệu nào, mỗi hạng mục là một
ô `<input type="checkbox">` kèm tiêu đề. Hub đọc cấu trúc trong một `<template>` inert và suy ra:

| Trong file | Thành |
|---|---|
| `<section>` / `.grp`, hoặc heading đứng trước hạng mục | nhóm |
| `<h1>`–`<h6>` đầu của nhóm | tiêu đề nhóm |
| `.pill`/`.tag`/`.chip` trong heading (chữ ngắn, vd `P0`) | mã nhóm + màu chip (`p0` → `t-p0`) |
| `.note` trong nhóm, hoặc thẻ ngay sau heading | phần dẫn của nhóm |
| `<details>`, `<li>`, `.item`… chứa ô checkbox | một hạng mục |
| `<summary>` / `<label>` / `.ttl` | tiêu đề hạng mục |
| `.body`, hoặc phần còn lại của `<details>` | hướng dẫn chi tiết |
| `data-id` của ô checkbox → `id` → chip `.id` trong tiêu đề → **hash tiêu đề** | id hạng mục |

Nên khai `data-id` cho từng ô checkbox. Không có thì id suy từ **hash của tiêu đề** — ổn định khi
chèn/đổi thứ tự hạng mục (khác với suy theo vị trí, kiểu đó chèn một dòng là tick trượt hết), nhưng
sửa chữ trong tiêu đề là mất tick của đúng hạng mục đó. Hub cảnh báo rõ khi phải suy id.

Ô checkbox không có tiêu đề (nút "chọn tất cả", ô trong form) bị bỏ kèm cảnh báo, không chặn cả file.
Trùng id thì được thêm hậu tố `-2`, `-3` để tick không ghi chồng.

Thứ tự thử là **dạng 1 trước**: file nào khai `SECTIONS` thì vẫn đọc y như trước, đường DOM không
chạm tới.

### Mã checklist

`CHECKLIST_ID` là tuỳ chọn ở cả hai dạng:

- File **có khai** → ô Mã checklist điền sẵn từ file và bị khoá. File là nguồn thật.
- File **không khai** → mã suy từ tên file (`webnovel-ngon-tinh-checklist.html` →
  `webnovel-ngon-tinh-checklist`), ô cho sửa. Đây là trường hợp của các file checklist bản cũ chạy
  độc lập (lưu tick trong `localStorage`) — chúng không có mã vì ra đời trước khi có Supabase, và
  của mọi file dạng 2.

Mã đó là **khoá gắn tick trong DB**, nên chỉ cần nó đúng và **ổn định**. Sau khi upload thì đừng
đổi: đổi mã là tick của checklist đó thành mồ côi. Đổi tên file `.html` ở máy thì không sao.

Engine tick riêng của file (nếu có) bị bỏ hoàn toàn — chỉ dữ liệu hạng mục được lấy, còn lại
`checklist.html` render bằng `assets/sync.js` dùng chung. Tick đang có trong `localStorage` của file
cũ **không tự chuyển sang DB**; muốn giữ thì phải seed bằng SQL.

Muốn sửa nội dung về sau: sửa file ở máy rồi upload lại chính nó. **Tick đã có vẫn giữ nguyên**
vì tick gắn với `item_id`, không gắn với nội dung.

Ba thứ được gác ở bước này:
- **Mã trùng với checklist dạng file** → server từ chối, vì tick của hai bên sẽ ghi chồng lên nhau.
- **Item id trùng nhau, hoặc sai định dạng** `^[a-z0-9][a-z0-9-]{0,39}$` → chặn ngay ở trình duyệt,
  kèm tên hạng mục sai, vì DB sẽ từ chối tick của những id đó.
- **Bản mới thiếu hạng mục đã có người tick** → server chặn và liệt kê id đó. Trang hỏi lại một
  lần; đồng ý thì mới ghi. Đây là bản chặt hơn của luật append-only bên dưới: nó chỉ báo động khi
  thật sự có tick sắp mất, không báo vì một id chưa ai dùng bị đổi tên.

## Xoá checklist

Đưa chuột lên thẻ ở hub → nút **Xoá** góc trên phải → gõ đúng mã để xác nhận. Thông báo nói rõ
sẽ mất bao nhiêu hạng mục và bao nhiêu tick trước khi anh gõ.

Chỉ xoá được checklist **dạng upload**. Dạng `file` như `webnovel-vn` không có nút xoá, và server
cũng từ chối: file HTML vẫn nằm trong repo, xoá row xong lần sau ai đăng ký lại là nó hiện lại —
nhưng tick thì đã mất. Muốn bỏ hẳn loại đó thì xoá file trong repo trước.

Bảng `checklist_history` **không bị xoá** — nó append-only và không có khoá ngoại trỏ vào
`checklists`, nên tick đã xoá vẫn khôi phục được bằng SQL. Đó là thứ làm nút xoá này chấp nhận được.

## Về việc lọc nội dung upload

Nội dung upload là **dữ liệu không tin được** — trang là public, ai có link cũng upload được. Vì vậy
`assets/sanitize.js` lọc lại mọi HTML trước khi chèn vào trang: bỏ `<script>`, `<style>`, `<iframe>`,
`<img>`, mọi `on*`, `style`, và `href="javascript:"`. Thẻ ngoài whitelist bị bỏ thẻ nhưng **giữ chữ**,
nên không mất nội dung. Lọc chạy **hai lần**: lúc upload và lúc render — không tin DB thay cho việc lọc.

Việc bóc `SCORES`/`SECTIONS` phải chạy chính JS của file (đó là JS literal, không phải JSON). Nó chạy
trong `<iframe sandbox="allow-scripts">` không có `allow-same-origin`: origin mờ, không đọc được DOM
của hub, không đọc được `localStorage`, không thấy anon key. Đường ra duy nhất là `postMessage`.

File **dạng 2** không có JS nào cần chạy, nên nó **không** đi qua sandbox: `parseDomChecklist()` nhét
HTML vào một `<template>` rồi đi cây `template.content`. Nội dung template là **inert** — thuộc một
document không có browsing context, nên script không chạy và `<img>`/`<iframe>`/`<link>` không tải.
Cố tình không dùng `srcdoc` để đọc DOM (kéo theo `<script src>` và mọi request của file), và cũng
không dùng `DOMParser` ở chỗ này: document của nó cũng rời, nhưng tính chất "không fetch" phải suy từ
điều kiện "fully active" thay vì được nói thẳng ở tầng API. Dù đi đường nào, mọi HTML lấy ra vẫn qua
đúng một `validateDef()` → `sanitizeHtml()`. Bước 11 mục kiểm tay là chỗ chứng minh phần "0 request"
trên browser thật.

Chính vì origin mờ mà engine của file checklist bản cũ **ném lỗi** khi nó đọc `localStorage` — và
điều đó không sao: hai thẻ `<script>` dùng chung phạm vi global, nên `SECTIONS` khai ở trên vẫn bóc
ra được sau khi script ném. Test 19 trong `tools/test/test.js` giữ đúng tình huống này.

`checklist.html` lấy mã từ `?id=` — nghe như trái với luật "đừng lấy từ URL" ở dưới, nhưng lý do của
luật đó không áp dụng ở đây: mã không suy ra từ tên file **của trang đang mở**, nó là **khoá chính
trong DB** và phải có trong `checklist_defs` mới render được.

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
node tools/test/test.js            # 123 test: hàng đợi, gộp dữ liệu, chống mất tick, sanitize, parse
```

`sanitize.js` cần `DOMParser`, `parse-def.js` cần `document.createElement('template')` — node không
có, và repo không có dependency, nên test dùng `tools/test/dom-shim.js` (bản tự viết vừa đủ). Nó kiểm
được **logic whitelist** và phần suy cấu trúc, nhưng không mô phỏng được các mánh ở tầng parser của
browser thật, cũng không nói được gì về chuyện browser có gửi request hay không. Vì vậy phần XSS và
phần "0 request" vẫn phải kiểm tay một lần trên browser theo mục dưới.

## Kiểm tay phần upload (một lần, trên browser)

Chạy `python3 -m http.server 8899` rồi:

1. Copy `webnovel-vn.html` → `test-up.html`, **xoá dòng `const CHECKLIST_ID`**, cắt còn ~3 hạng mục.
   Upload → ô Mã checklist phải điền `test-up` (suy từ tên file) và **cho sửa** → Upload → thẻ mới
   hiện → mở ra tick được → refresh vẫn còn → % ở hub đúng.
2. Upload `webnovel-vn.html` (file **có** `CHECKLIST_ID`) → ô mã phải hiện `webnovel-vn` và bị
   **khoá**, rồi bị chặn vì trùng với checklist dạng file.
3. Sửa chữ một hạng mục trong `test-up.html` rồi upload lại → nội dung đổi, **tick giữ nguyên**.
4. Xoá một hạng mục **đã tick** rồi upload lại → phải bị chặn kèm tên id đó.
5. Nhét `<script>alert(1)</script>` và `<a href="javascript:alert(1)">` vào phần `b` → upload →
   mở trang: **không** có alert, DevTools không thấy thẻ `script`.
6. Mở `checklist.html` không có `?id=`, và `?id=khong-ton-tai` → thông báo lỗi tử tế, không trang trắng.
7. Tick khi tắt mạng → hiện "chưa lưu" → bật mạng → tự đẩy lên.
8. Nút **Xoá**: thẻ `webnovel-vn` **không có** nút; thẻ `test-up` có. Gõ sai mã → không xoá gì. Gõ
   đúng → thẻ biến mất, thông báo nói đúng số tick đã xoá, và mở lại `checklist.html?id=test-up`
   phải báo "không có checklist nào mang mã này".
9. **File dạng 2** (hạng mục nằm trong HTML, không khai `SECTIONS`): upload một file kiểu đó → hộp
   tóm tắt phải nói "đọc theo cấu trúc HTML", số nhóm/hạng mục khớp với file, mở ra tick được. Bước
   này phải kiểm trên browser thật vì `tools/test/dom-shim.js` không phải parser của browser.
10. Upload một file HTML **không phải checklist** (một bài viết bất kỳ) → bị từ chối kèm câu nói rõ
    cần `const SECTIONS` hoặc ô checkbox, **không** tạo checklist rỗng.
11. **Không có request nào ra ngoài khi đọc file dạng 2**: nhét `<img src="https://example.com/a.png">`,
    `<link rel="stylesheet" href="https://example.com/a.css">` và `<iframe src="https://example.com/">`
    vào file đó, mở tab Network của DevTools (Disable cache, filter `example.com`) rồi chọn file →
    phải **0 request**. Nội dung `<template>` là inert nên theo spec nó không tải subresource, nhưng
    đây là thứ chỉ browser thật chứng minh được. Nhân đó kiểm luôn phần render: mở checklist vừa
    upload, cũng phải 0 request tới `example.com` (`sanitizeHtml` bỏ hẳn `<img>`/`<iframe>`/`<link>`).

Dọn sau khi xong: xoá `test-up.html` ở máy. Nếu đã dùng nút Xoá thì DB sạch rồi; nếu chưa, chạy
`delete from checklist_progress where checklist_id='test-up';` rồi
`delete from checklists where id='test-up';` (bảng `checklist_defs` tự xoá theo).

## Về bảo mật

`assets/config.js` chứa **anon key** — đúng thiết kế, key này sinh ra để nhúng vào trang public.
Quyền thật do Postgres quyết định:

- anon **chỉ đọc** ba bảng `checklist_progress`, `checklists` và `checklist_defs`. Không có quyền
  INSERT/UPDATE/DELETE trực tiếp trên bảng nào.
- Mọi thao tác ghi đi qua năm hàm, mỗi hàm làm đúng một việc:
  - `tick_item()` — **một request một hạng mục**. Không có đường nào để một request sửa sạch cả
    bảng. Từ chối bản ghi cũ hơn bản đang có (so `client_ts`), nên một tab để mở từ sáng, đẩy lên
    lúc chiều, không xoá được việc người khác làm lúc trưa.
  - `register_checklist()` — **chỉ thêm mới**. Mã đã tồn tại thì báo lỗi, không ghi đè metadata của
    checklist đang chạy. Tên file phải khớp `^[a-z0-9][a-z0-9-]{0,59}\.html$` nên không nhét được
    đường dẫn `../` hay URL ngoài vào chỗ trang hub dùng làm link.
  - `upload_checklist_def()` — thêm mới hoặc cập nhật nội dung checklist dạng `def`. **Từ chối** ghi
    lên một mã đang thuộc checklist dạng `file`, và **từ chối** bản upload làm mất tick của hạng mục
    đã được tick (trừ khi người dùng xác nhận). Không sửa được `kind` của row đang có.
  - `delete_checklist_def()` — xoá checklist dạng `def`. Bắt gõ đúng mã (`p_confirm` phải khớp
    `p_id`), và **từ chối** dạng `file`. Không xoá `checklist_history` nên vẫn khôi phục được.
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

Trang là public nên ai có link đều tick được, đăng ký được, **upload được** và **xoá được** checklist
dạng `def`, và tên là tự khai. Đây là lựa chọn có ý thức: đổi tính chặt chẽ lấy việc không phải quản
lý tài khoản cho nhân viên. Trước đây còn một ràng buộc phụ — checklist mới chỉ hiện được nếu file
HTML đã có trong repo — **ràng buộc đó không còn với dạng `def`**: upload không cần push repo.

Đổi lại, ba thứ giữ thiệt hại ở mức có thể sửa được:
- Nội dung upload bị sanitize, nên phá thì chỉ phá được phần hiển thị, không chạy được code.
- `webnovel-vn` là dạng `file` nên **không xoá được từ web**, và mọi checklist dạng `file` cũng vậy.
- `checklist_history` giữ mọi thay đổi và anon không đọc được, nên tick đã xoá vẫn khôi phục được
  bằng SQL.

Nếu cần siết, thêm kiểm tra mật khẩu chung vào `upload_checklist_def()` và `delete_checklist_def()`,
hoặc bật Supabase Auth.
