# Khuôn output — `audit.json` → file HTML

Agent viết **nội dung** vào một file JSON; `scripts/build-file.js` dựng file HTML.
Không viết HTML tay: các ràng buộc làm file upload được là ràng buộc cơ học (key object
literal không ngoặc kép, `tag:` ngay sau `id:`, mọi giá trị qua `JSON.stringify`, nội dung
phải sanitize-stable) — viết tay 60–90 hạng mục mà không lệch một lần là chuyện không xảy ra.

## Vì sao một file chạy được ở cả hai chỗ

File có **ba** khối inline:

```
[1] <style>            CSS (templates/preview.css) — để mở ở máy là thấy đẹp
[2] <script> DATA      CHỈ khai const CHECKLIST_ID / SCORES / SECTIONS
[3] <script> RENDER    render + tick + filter (templates/render.js)
```

Lúc upload, `assets/parse-def.js:74-81` quét mọi `<script>` **không có `src`** và lấy **thẻ
đầu tiên** khớp `/(?:const|let|var)\s+SECTIONS\s*=/`, nhét vào
`<iframe sandbox="allow-scripts">` (không `allow-same-origin`), cho browser chạy, rồi lấy giá
trị ra bằng `postMessage`.

Hệ quả — bốn ràng buộc, mỗi cái vi phạm là một kiểu vỡ khác nhau:

| Ràng buộc | Vi phạm thì sao |
|---|---|
| `SECTIONS` phải có `const`/`let`/`var` **của riêng nó** | `const A=…, SECTIONS=…` và `window.SECTIONS=` đều KHÔNG khớp regex → hub rơi xuống đường đọc checkbox → ném `NOT_CHECKLIST` (file render bằng JS không có checkbox tĩnh nào) |
| Khối [2] phải đứng **trước** mọi chỗ khác khớp regex đó | Hub lấy khối đầu tiên; khối sau bị bỏ **im lặng** |
| Khối [2] chỉ được chứa **khai báo dữ liệu** | Sandbox origin mờ: `localStorage` ném `SecurityError`. Khối [3] không bao giờ chạy trong sandbox nên nó gọi `localStorage` thoải mái |
| `CHECKLIST_ID` phải luôn có | Thiếu → `slugFromFilename` suy mã từ **tên file** (`parse-def.js:88-99`) → mỗi lần đổi tên file là một checklist mới, 0 tick |

`<style>` ở tầng file **không** đi qua `sanitizeHtml` — hàm đó chỉ lọc `note` của nhóm và `b`
của hạng mục. Nhưng chính vì thế, `b` phải viết sẵn ở **dạng đã sanitize**: xem mục dưới.

## Khuôn `audit.json`

```json
{
  "id": "op-example-vn-3f7a",
  "host": "example.vn",
  "url": "https://example.vn/",
  "date": "2026-09-04",
  "title": "Audit on-page SEO / GEO / AIO — example.vn",
  "sub": "Một câu: đo gì, ngày nào, bao nhiêu loại trang.",
  "chips": ["Ngày audit: 04/09/2026", "4 loại trang đo thật", "18 user-agent"],
  "method": ["<code>bash probe.sh https://example.vn/</code> — 18 UA × 3 endpoint, TTFB 3 lượt"],
  "cannot": ["Core Web Vitals thật (LCP/INP/CLS field data) → PageSpeed Insights / CrUX"],
  "scores": [["Technical SEO", 7, "ghi chú CÓ SỐ ĐO, không có dấu ngoặc kép"]],
  "sections": [
    { "id": "P0", "tag": "t-p0", "title": "P0 — 3 lỗi đang chặn traffic",
      "note": "<p>Làm trong 48h. Vì sao mấy lỗi này chặn phần lớn tiềm năng của site.</p>",
      "items": [
        { "id": "bot-ai-403", "t": "Gỡ chặn 403 cho bot AI search",
          "w": "Mất 3 kênh AI search", "e": "1–3h", "b": "<h4>Số đo hiện tại</h4>…" }
      ] }
  ]
}
```

| Field | Bắt buộc | Giới hạn | Ghi chú |
|---|---|---|---|
| `id` | ✅ | `^[a-z0-9][a-z0-9-]{0,39}$` | `op-{host-slug}-{hash4}`, giữ nguyên `www.` |
| `host` | ✅ | — | Đi vào dấu `Audit host:` và tên hiển thị gợi ý |
| `date` | ✅ | — | `YYYY-MM-DD`, vào tên file và footer |
| `chips`/`method`/`cannot` | ❌ | — | HTML **thô**, không qua sanitize (nằm ngoài `b`/`note`) |
| `scores[i]` | ✅ | tên ≤ 60, ghi chú ≤ 300 | `[tên, 0–10, ghi chú]`. Ghi chú **không được có `"`** |
| `section.id` | ✅ | — | `P0 P1 P2 P3 GEO VFY`. Nó thành `data-p` và thành nút filter |
| `section.tag` | ✅ | 6 giá trị | `t-p0 t-p1 t-p2 t-p3 t-geo t-bl` — chỉ 6 class này có màu |
| `section.items` | ✅ | ≥ 1 | **Nhóm rỗng làm `validateDef` NÉM** → bỏ hẳn nhóm khỏi `sections` |
| `item.id` | ✅ | `^[a-z0-9][a-z0-9-]{0,39}$`, duy nhất toàn file | Lấy từ `check-catalogue.md` |
| `item.t` | ✅ | ≤ 300 | **Động từ trước**: "Gỡ chặn 403 cho bot AI search" |
| `item.w` | ❌ | ≤ 300 | Hệ quả, có số nếu được. Hạng mục đã xong: `ĐÃ XONG — {số đo}` |
| `item.e` | ❌ | ≤ **40** | `"30 phút"`, `"1–3h"`, `"2–4h / 10 bài"` |
| `item.b` | ❌ | ≤ 200.000 | HTML hướng dẫn — 5 khối, xem dưới |

Vượt giới hạn `t`/`w`/`e`/`scores` thì hub **cắt âm thầm** (`parse-def.js:578-622`): bản local
hiện đủ chữ, bản team bị cụt. `build-file.js` và `check-out.js` đều fail ở đó thay vì để lệch.

## `item.b` — 5 khối theo thứ tự

```
1. Số đo hiện tại      bảng: chỉ số | đo được (class="bad") | nên là (class="good") + thời điểm đo
2. Vì sao quan trọng   CƠ CHẾ: Google/AI xử lý thế nào → hệ quả gì. KHÔNG "vì SEO cần"
3. Cách làm            <pre><code> config/code dán chạy được ngay
4. Lệnh verify         <pre><code> lệnh curl/python3 THUẦN + "Đạt khi: {điều kiện có số}"
5. Bẫy (nếu có thật)   <div class="callout warn"><b>Bẫy:</b> …
```

Khối 1, 2, 4 bắt buộc với mọi hạng mục P0/P1. Khối 3 bắt buộc khi có config cụ thể. Khối 5 chỉ
thêm khi có bẫy thật — đừng bịa cho đủ khối.

**Lệnh verify phải tự chạy được trên máy người đọc.** Người nhận file HTML không có skill này,
không có `probe.sh`. Viết `curl`/`python3 -` thuần:

```
for UA in OAI-SearchBot Claude-SearchBot PerplexityBot; do
  printf '%-18s %s\n' "$UA" \
    "$(curl -sS -o /dev/null -A "$UA/1.0" -w '%{http_code}' https://example.vn/)"
done
```

## Viết `b` ở dạng ĐÃ SANITIZE

`check-out.js` bắt `sanitizeHtml(b) === b` **byte-for-byte**. Lý do: file là bản xem trước của
bản hub; sai một byte là preview nói dối. Luật để viết đúng ngay lần đầu:

| Dùng | Không dùng | Vì |
|---|---|---|
| `<h4>` `<h5>` `<h6>` | `<h2>` `<h3>` | Ngoài whitelist → hub **bỏ thẻ, giữ chữ** (mất cấu trúc) |
| `class="bad"` `class="good"` `callout` `callout warn` `callout good` | `style="…"` `id="…"` `data-*` | Mọi attribute khác `class`/`href`/`colspan`/`rowspan` bị xoá |
| `<table><thead><tr><th>` | `<table>` rồi text trần | Text nằm trực tiếp trong `<table>` bị browser đẩy ra ngoài bảng |
| `<a href="https://…" target="_blank" rel="noopener noreferrer">` | `<a href="…">` | Sanitize **tự thêm** `target`/`rel` → viết sẵn thì byte mới khớp |
| `&lt;` `&gt;` `&amp;` cho dấu trong text | `<` `>` trần | Ví dụ HTML phải là entity, không thì thành thẻ thật |
| `&nbsp;` `&ge;` viết bằng ký tự thường / `≥` | U+00A0 trần, `&#8805;` | DOMParser giải mã entity số rồi serialize lại thành ký tự → byte lệch |
| `<br>` | `<br/>` | Serializer nhả `<br>` |
| Mọi attribute trên **cùng một dòng** | newline giữa hai attribute | Parser chuẩn hoá newline thành một space |
| `<pre><code>lệnh` | `<pre>` rồi newline | Newline ngay sau `<pre>` bị parser bỏ |
| — | comment `<!-- -->` | Sanitize xoá comment; trong khối DATA nó còn phá tokenizer |

Không phải nhớ hết: `build-file.js` **tự chuẩn hoá** (chạy `sanitizeHtml` rồi ghi bản đã
chuẩn hoá) và in ra số chỗ nó phải sửa. Con số đó nên là 0 — khác 0 nghĩa là bản local đang
khác ý anh viết.

## Escape: `b` là **chuỗi JSON**, không phải template literal

Đây là chỗ khác biệt lớn nhất so với khuôn cũ của `audit-onpage` (dùng backtick):

| Trong nội dung | Viết trong JSON | Nếu dùng backtick |
|---|---|---|
| `\` (regex, lệnh shell) | `\\` (JSON escape) | Backtick **ăn mất** `\` → `\d{3}` thành `d{3}`, `grep "a\|b"` thành `grep "a|b"` (tìm ký tự `\|`, kết quả rỗng) |
| `${` | `${` viết thẳng | Bị hiểu là nội suy biến → cả khối DATA **ném** |
| Backtick | viết thẳng | Đóng template literal sớm |
| `</script` | `&lt;/script` | Đóng thẻ script của cả file |

`build-file.js` gọi `JSON.stringify` cho từng **giá trị**, nên trong `audit.json` anh chỉ cần
viết đúng luật JSON bình thường. `check-out.js` bước 2 fail nếu thấy giá trị nào là template
literal, và bước 3 fail nếu khối DATA ném.

## Audit lần thứ hai trên cùng site

Đây là chỗ mất tick nếu làm sai, nên có luật riêng. Ba truy vấn read-only ở bước 1:

```bash
SB=$(grep -o "https://[a-z0-9]*\.supabase\.co" "$REPO/assets/config.js" | head -1)
KEY=$(grep -o "eyJ[A-Za-z0-9._-]*" "$REPO/assets/config.js" | head -1)
H="apikey: $KEY"

curl -sS "$SB/rest/v1/checklists?id=eq.$ID&select=id,kind,name,total"        -H "$H"
curl -sS "$SB/rest/v1/checklist_defs?id=eq.$ID&select=sections"              -H "$H"
curl -sS "$SB/rest/v1/checklist_progress?checklist_id=eq.$ID&select=item_id,done" -H "$H"
```

| Tình huống | Luật |
|---|---|
| `kind:"file"` | **Dừng.** `upload_checklist_def` (`schema.sql:386-390`) raise 23505: mã đang thuộc một file trong repo. Đổi `id=` |
| Dấu `Audit host:` trong `sections[*].note` **khớp** host đang audit | Audit lần 2 của đúng site này. Giữ **toàn bộ** id cũ |
| Dấu lệch host, hoặc không có dấu | **Dừng, hỏi người dùng.** Đi tiếp chỉ khi có `--force-id` |
| Mã chưa có trên hub | Checklist mới |

Khi là audit lần 2, mỗi id cũ đi vào một trong hai đường — **không có đường thứ ba**:

1. **Vẫn còn vấn đề** → giữ hạng mục, cập nhật `b` bằng số đo mới.
2. **Đã sửa xong** → giữ hạng mục, đổi `w` thành `ĐÃ XONG — {số đo mới} (đo {ngày})`, và `b`
   ghi bảng trước/sau. Cách này là cách `webnovel-vn.html` trong repo đang làm (18 hạng mục
   `ĐÃ XONG`), nên nó cũng là cách người dùng đã quen đọc.

Bỏ hạng mục đã tick → `schema.sql:410-415` chặn upload, và nút force trên hub thì **xoá** tick
đó. `check-out.js` bước 8 bắt trước, so với **hợp** của `checklist_progress` (cả `done=false`)
và `sections` cũ.

File phồng lên theo mỗi lần audit là chuyện có thật: trần là 800KB dữ liệu sau
`JSON.stringify`. `check-out.js` fail từ **600KB** để còn kịp xử lý — cách xử lý là cắt `b` của
các hạng mục `ĐÃ XONG` xuống còn bảng trước/sau, **giữ nguyên id nên giữ nguyên tick**.

## Kiểm trước khi bàn giao

```bash
node scripts/build-file.js /tmp/audit-$ID.json --out="$OUT"   # 12 luật cấu trúc
node scripts/check-out.js "$OUT"                               # 11 nhóm luật + DB
```

`check-out.js` in ra `contract-version` — bản trong repo và bản ở
`~/.claude/skills/audit-onpage/scripts/` phải cùng số. Lệch số nghĩa là một bên đã sửa luật mà
bên kia chưa; sync bằng:

```bash
cp "$REPO/.claude/skills/op-optimize/scripts/"{contract.js,check-out.js,build-file.js} \
   "$HOME/.claude/skills/audit-onpage/scripts/"
cp -R "$REPO/.claude/skills/op-optimize/templates" "$HOME/.claude/skills/audit-onpage/"
```

Sau khi upload, chạy lần cuối:

```bash
node scripts/check-out.js "$OUT" --after-upload
```

Nó tải bản đã lưu trên DB (bản này đã đi qua sanitize của **browser thật**, không phải
`dom-shim`) và so byte từng `b`/`note`/`t`/`w`/`e` với file. Diff rỗng = câu "bản xem trước
giống bản cả team thấy" là sự thật đo được, không phải lời hứa.

