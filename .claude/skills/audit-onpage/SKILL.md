---
name: audit-onpage
description: >-
  Audit on-page SEO/GEO/AIO đầy đủ cho một URL hoặc domain, dựa trên SỐ ĐO THẬT
  (curl đo status theo 18 user-agent, TTFB, nén, redirect, robots/llms/sitemap;
  parser HTML đo title/heading/schema/link/ảnh/render-blocking). Xuất ra một file
  HTML checklist tương thích trang hub của repo này — const CHECKLIST_ID + SCORES
  + SECTIONS, dùng assets/checklist.css + assets/sync.js, upload lên hub là cả
  team tick chung được.
  Trigger: "/audit-onpage {url|domain}", "audit onpage", "audit on-page",
  "audit seo onpage", "kiểm tra onpage site", "audit GEO AIO cho site".
---

# Skill: audit-onpage

Audit on-page cho một site rồi xuất **file HTML checklist** tương thích trang hub
của repo `checklist-webnovel`. Mọi con số trong báo cáo phải là số đo thật từ HTTP
response — không có con số nào được suy đoán, không có hạng mục nào chép từ
checklist mẫu mà không đo.

## Usage

```
/audit-onpage https://example.com/
/audit-onpage example.com
/audit-onpage https://example.com/ pages=5
/audit-onpage https://example.com/bai-viet/ keyword="mổ cận lasik"
/audit-onpage example.com quick
```

| Tham số | Bắt buộc | Mặc định | Mô tả |
|---|---|---|---|
| url/domain | ✅ | — | Trang đích. Không có scheme → thêm `https://` |
| `pages=N` | ❌ | 3 | Số loại trang lấy mẫu để đo (trang chủ + N-1 trang con) |
| `keyword=` | ❌ | tự suy | Keyword chính để đối chiếu title/H1/heading. Không truyền → suy từ title + top bigram |
| `quick` | ❌ | tắt | Bỏ bước 5 (đối thủ) và bước 6 (WebSearch), chỉ đo site. Nhanh ~3× |
| `out=` | ❌ | tự đặt | Đường dẫn file HTML xuất ra |

## Nguyên tắc bất di bất dịch

1. **Không đo được thì không viết.** Mỗi hạng mục trong file HTML phải có ít nhất
   một số đo thật, hoặc ghi rõ `chưa đo được — lý do`. Tuyệt đối không có câu
   kiểu "có thể trang đang gặp vấn đề về tốc độ".
2. **Ghi cả số đo lẫn lệnh verify.** Người đọc phải chạy lại được đúng lệnh anh đã
   chạy và thấy đúng con số đó.
3. **Không sửa gì trên site đích.** Chỉ GET/HEAD. Không POST, không thử đăng nhập,
   không dò admin path, không brute-force. Đây là audit, không phải pentest.
4. **Không chạy JS.** `onpage.py` cố tình không render — đó là góc nhìn của bot ở
   lượt crawl đầu. Nếu WebFetch (có render) thấy nội dung mà script không thấy,
   phần chênh đó là **một phát hiện P0/P1**, không phải lỗi của script.
5. **Nói rõ mức tin cậy.** Cái gì đo trực tiếp, cái gì suy ra từ dấu hiệu, cái gì
   cần quyền GSC mới xác nhận được — phải phân biệt trong báo cáo.

---

## WORKFLOW — 8 bước, không bỏ bước

```
1. Chuẩn hoá input        → xác định origin, path, loại site
2. Đo tầng HTTP           → probe.sh (bot, tốc độ, robots, sitemap, chuẩn hoá URL)
3. Đo on-page từng trang  → onpage.py trên 3–5 loại trang
4. Đối chiếu render       → WebFetch vs onpage.py, tìm nội dung phụ thuộc JS
5. Đối chiếu đối thủ      → (bỏ nếu `quick`) 3 đối thủ cùng keyword
6. Chấm điểm 8 trục       → mỗi điểm phải trỏ về số đo ở bước 2–5
7. Sinh file HTML         → theo khuôn hub, 60–90 hạng mục
8. Verify file            → python3 tools/verify.py + tự kiểm 6 điểm
```

---

## BƯỚC 1 — Chuẩn hoá input

Từ input, tách ra:

- `ORIGIN` — `https://example.com` (không có path)
- `URL` — URL đích đầy đủ, giữ nguyên path người dùng đưa
- Nếu input chỉ là domain → `URL = ORIGIN + "/"`, và đây là **audit cấp site**
- Nếu input có path → đây là **audit một trang cụ thể**, nhưng vẫn phải đo cấp site
  ở bước 2 (robots/sitemap là chuyện toàn site)

Đặt tên checklist id ngay: lấy host, bỏ `www.`, thay `.` và ký tự lạ bằng `-`,
chữ thường, tối đa 40 ký tự.

```
webnovel.vn                    → webnovel-vn
matquoctednd.vn/lasik/         → matquoctednd-vn
shop.example.co.uk             → shop-example-co-uk
```

Mã này phải khớp `^[a-z0-9][a-z0-9-]{0,39}$`, nếu không DB từ chối tick.

---

## BƯỚC 2 — Đo tầng HTTP

```bash
bash .claude/skills/audit-onpage/scripts/probe.sh "$URL" 2>&1 | tee /tmp/probe-$ID.txt
```

Chạy mất 2–5 phút (18 user-agent × 3 request + sitemap). Nó in ra:

| Khối | Dùng để chấm |
|---|---|
| DNS/TLS + cert | Technical — cert sắp hết hạn là rủi ro tụt trust |
| Response header | Technical — cache, `x-robots-tag`, CDN |
| Tốc độ 3 lần + nén | Performance — TTFB nóng/lạnh, tỉ lệ nén |
| Status theo 18 UA | **GEO/AIO** — bot AI bị 403 là P0 chí tử |
| File hạ tầng | Technical + GEO — robots, llms.txt, sitemap, ads.txt |
| robots.txt toàn văn | GEO — chiến lược bot AI có nhất quán không |
| Sitemap + số URL con | Crawlability — loại trang nào bị bỏ khỏi sitemap |
| Chuẩn hoá URL | Technical — trùng lặp do www/slash/param |
| 404 thật | Crawlability — soft 404 làm loãng ngân sách crawl |
| Header bảo mật/cache | Technical, mức phụ |

**Đọc kết quả bot AI theo bảng này** — hiểu sai loại bot là hiểu sai cả chiến lược:

| Bot | Loại | Chặn thì mất gì |
|---|---|---|
| `OAI-SearchBot`, `Claude-SearchBot`, `PerplexityBot` | AI search, **có trả link** | Mất traffic từ AI search |
| `ChatGPT-User`, `Claude-User`, `Perplexity-User` | Đọc khi user hỏi | User hỏi về site → AI không đọc được |
| `GPTBot`, `ClaudeBot`, `CCBot`, `meta-externalagent` | Hút dữ liệu training | Không mất traffic — chặn là quyết định kinh doanh |
| `Google-Extended`, `Applebot-Extended` | Cờ opt-out training | Chặn ở đây **không** ảnh hưởng Google Search |
| `Googlebot`, `Bingbot`, `Applebot` | Search truyền thống | Chặn = ra khỏi index |

Sai lầm hay gặp: nghĩ `ClaudeBot` là bot trả link (không phải — nó là training),
hoặc `Allow` cho `Applebot-Extended` (vô nghĩa — nó là cờ opt-out, chỉ có
`Disallow` mới có tác dụng).

Nếu `probe.sh` báo bot nào ≠ 200, đọc `references/geo-aio.md` phần "Truy nguồn chặn
bot" để tìm lớp nào đang chặn.

---

## BƯỚC 3 — Đo on-page từng loại trang

Chọn mẫu **theo template, không theo số lượng**. Mỗi template render bằng một
đoạn code khác nhau nên lỗi cũng khác nhau; đo 5 trang cùng template thì chỉ tốn
thời gian mà không thấy gì mới.

Tìm mẫu bằng internal link của trang chủ (`onpage.py … --json` trả
`links.internal_sample`), hoặc bằng sitemap ở bước 2. Ưu tiên:

1. Trang chủ — bắt buộc
2. Trang danh mục / listing
3. Trang chi tiết (bài viết / sản phẩm / truyện) — **quan trọng nhất**, đây là chỗ
   traffic long-tail vào
4. Trang tầng sâu (chương / trang phân trang) — nếu có
5. Trang tin cậy (giới thiệu / liên hệ / tác giả) — cho E-E-A-T

```bash
for U in "$ORIGIN/" "$ORIGIN/danh-muc/" "$ORIGIN/bai-viet-cu-the/"; do
  python3 .claude/skills/audit-onpage/scripts/onpage.py "$U"
done 2>&1 | tee /tmp/onpage-$ID.txt

# Cần dữ liệu để tính toán tiếp thì thêm --json
python3 .claude/skills/audit-onpage/scripts/onpage.py "$URL" --json > /tmp/onpage-$ID.json
```

Script tự sinh cảnh báo có gán mức P0–P3. **Đừng chép nguyên cảnh báo vào file
HTML** — nó là điểm khởi đầu. Việc của anh là:

- Gộp cảnh báo trùng nhau giữa các trang thành một hạng mục ("thiếu OG trên **cả
  4** loại trang" mạnh hơn 4 hạng mục rời)
- Nâng/hạ mức khi có ngữ cảnh (thiếu H1 ở trang chủ nhẹ hơn ở trang bài viết)
- Bỏ cảnh báo không áp dụng (site một ngôn ngữ thì không cần hreflang)
- **Thêm** thứ script không đo được: chất lượng nội dung, cannibalization, ý định
  tìm kiếm có khớp không

---

## BƯỚC 4 — Đối chiếu render

`onpage.py` không chạy JS, `WebFetch` có chạy. So hai bên:

```
WebFetch(url, "Liệt kê H1, H2 và 200 từ đầu của nội dung chính")
```

| Kết quả | Kết luận |
|---|---|
| Số từ hai bên xấp xỉ | Server-side render — tốt, không có việc gì phải làm |
| `onpage.py` < 300 từ mà WebFetch thấy đủ | **P0** — nội dung chỉ có sau khi chạy JS. Googlebot phải chờ render queue (tính bằng ngày–tuần), và phần lớn bot AI **không bao giờ** thấy |
| Cả hai đều ít | Thin content thật — vấn đề nội dung, không phải kỹ thuật |
| `onpage.py` thấy heading mà WebFetch không | JS **xoá** nội dung sau khi load, hoặc WebFetch bị chặn |

Đây là bước hay bị bỏ nhất và cũng là chỗ hay ra phát hiện đắt nhất.

---

## BƯỚC 5 — Đối chiếu đối thủ (bỏ nếu `quick`)

Xác định keyword chính: dùng `keyword=` nếu có, không thì lấy từ `content.top_bigrams`
và title của trang đích.

```
WebSearch("{keyword}")
WebSearch("{keyword} là gì")     ← tìm PAA và câu hỏi liên quan
```

Lấy 3 URL top đầu **không phải site đích**, chạy `onpage.py` cho từng URL, rồi lập
bảng so:

| Chỉ số | Site đích | ĐT 1 | ĐT 2 | ĐT 3 | Kết luận |
|---|---|---|---|---|---|
| số từ thân bài | | | | | thiếu bao nhiêu % |
| số H2 / H3 | | | | | độ phủ chủ đề |
| heading câu hỏi | | | | | cửa vào AI Overview |
| số liệu cụ thể | | | | | độ dễ trích dẫn |
| schema @type | | | | | loại schema đang thiếu |
| internal link | | | | | |
| TTFB | | | | | |

Bảng này biến "nên viết dài hơn" thành "đối thủ trung bình 2.400 từ, trang anh 890
từ — thiếu 1.500 từ, tập trung vào 6 H2 mà cả 3 đối thủ đều có mà anh không có".

---

## BƯỚC 6 — Chấm điểm 8 trục

Mỗi trục 0–10. **Mỗi điểm phải trỏ về được số đo cụ thể** ở bước 2–5.

| Trục | Đo bằng | 0–3 | 4–6 | 7–8 | 9–10 |
|---|---|---|---|---|---|
| Technical SEO | canonical, chuẩn hoá URL, 404, header | trùng lặp tràn lan | canonical có nhưng URL chưa chuẩn hoá | chỉ còn lỗi nhỏ | không lỗi đo được |
| On-page SEO | title, desc, heading, alt | thiếu title/H1 | có nhưng sai độ dài | đúng chuẩn, chưa tối ưu keyword | tối ưu đầy đủ |
| Structured Data | JSON-LD @type, lỗi cú pháp | không có | có Organization | + Breadcrumb + Article | + FAQ/HowTo/Product đúng loại trang |
| Crawlability | sitemap, robots, phân trang | sitemap lỗi/thiếu | có sitemap, thiếu loại trang | đủ loại trang, có lastmod | + phân trang chuẩn |
| **GEO / AIO** | status bot AI, llms.txt, heading câu hỏi, số liệu | bot AI bị 403 | bot vào được, nội dung chưa GEO | + heading câu hỏi + FAQ schema | + llms.txt + trích dẫn nguồn + số liệu dày |
| Content | số từ, cannibalization, so đối thủ | thin/trùng lặp | đủ dài, mỏng hơn ĐT | ngang ĐT | vượt ĐT về độ phủ |
| E-E-A-T | tác giả, ngày, nguồn, Organization | không có gì | có tên tác giả | + trang tác giả + schema Person | + chứng chỉ + nguồn ngoài uy tín |
| Performance | TTFB, nén, render-blocking, CLS | TTFB > 2s | 1–2s, có blocking | < 1s, nén tốt | < 0,5s, không blocking, ảnh đủ dimension |

Ghi chú mỗi trục phải **nêu con số**: `"TTFB 0,16s, nén Brotli 83%, 0 script chặn
render — trừ điểm vì 76KB CSS nội tuyến không cache được"`.

---

## BƯỚC 7 — Sinh file HTML

Đây là phần chính. Đọc `references/output-format.md` để lấy khuôn đầy đủ và
`references/checklist-items.md` để lấy thư viện hạng mục theo từng nhóm.

Khung tối thiểu:

```html
<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Audit on-page — {domain}</title>
<link rel="stylesheet" href="assets/checklist.css">
</head>
<body>
<div class="wrap">
<header class="hero">
  <h1>Audit on-page SEO / GEO / AIO — {domain}</h1>
  <p class="sub">{1 câu: đo gì, ngày nào, số trang}</p>
  <div class="meta">
    <span class="chip">Ngày audit: {dd/mm/yyyy}</span>
    <span class="chip">{N} loại trang đo thật</span>
    <span class="chip">{M} user-agent</span>
    <span class="chip">Mọi con số là số đo thật từ HTTP response</span>
  </div>
  <div class="idbar" id="idbar"></div>
  <div class="needname" id="needname" style="display:none">
    Chưa nhập tên nên chưa tick được. Nhập tên ở ô phía trên.
  </div>
  <div class="scores" id="scores"></div>
</header>

<div class="progwrap">
  <div class="progtop">
    <b id="progtxt">0 / 0 hạng mục</b>
    <span style="color:var(--muted);font-size:13px" id="progpct">0%</span>
  </div>
  <div class="progbar"><i id="progbar"></i></div>
  <div class="filters" id="filters">
    <button data-f="all" class="on">Tất cả</button>
    <button data-f="P0">P0 · Chí tử</button>
    <button data-f="P1">P1 · Lớn</button>
    <button data-f="P2">P2 · Quan trọng</button>
    <button data-f="P3">P3 · Nâng cao</button>
    <button data-f="GEO">GEO / AIO</button>
    <button data-f="VFY">Lệnh verify</button>
    <button data-f="todo">Chưa xong</button>
    <div class="tools">
      <button id="expandAll">Mở hết</button>
      <button id="collapseAll">Thu hết</button>
      <button id="reset">Xoá tick</button>
    </div>
  </div>
</div>

<div id="content"></div>

<footer>
  <p><a href="index.html">← Về danh sách checklist</a></p>
  <p><b>Cách dùng:</b> …</p>
  <p><b>Phương pháp đo:</b> {liệt kê lệnh đã chạy, ngày giờ}</p>
</footer>
</div>

<script src="assets/config.js"></script>
<script>
const CHECKLIST_ID = '{id-đã-đặt-ở-bước-1}';
const SCORES=[
 ["Technical SEO",7,"{ghi chú có số đo}"],
 ["On-page SEO",6,"…"],
 ["Structured Data",5,"…"],
 ["Crawlability",7,"…"],
 ["GEO / AIO",4,"…"],
 ["Content",5,"…"],
 ["E-E-A-T",4,"…"],
 ["Performance",8,"…"],
];
const SECTIONS=[ /* xem references/output-format.md */ ];
</script>
<script src="assets/sync.js"></script>
</body>
</html>
```

### Ràng buộc cứng của khuôn hub

Vi phạm bất kỳ điểm nào dưới đây là file không dùng được:

| Ràng buộc | Vì sao |
|---|---|
| `const CHECKLIST_ID` phải có, khớp `^[a-z0-9][a-z0-9-]{0,39}$` | `verify.py` chặn, DB từ chối tick |
| `item.id` **duy nhất trong toàn file**, cùng định dạng | Hai id trùng → tick ghi chồng lên nhau |
| `item.id` là **append-only** giữa các lần audit | Đổi id = mất toàn bộ tick của hạng mục đó |
| `section.id` phải khớp `data-f` của nút filter | Filter dựa trên `data-p === curF` |
| `section.tag` ∈ `t-p0 t-p1 t-p2 t-p3 t-geo t-bl` | Chỉ 6 class này có màu trong CSS |
| Không thêm `<script src>` nào khác | Sandbox lúc upload chỉ chạy script inline khai `SECTIONS` |
| `SCORES` là `[tên, 0–10, ghi chú]` | Sai dạng thì hàng đó bị bỏ |
| `b:` dùng backtick, escape `\\` trong regex/lệnh shell | Backslash trần trong template literal bị ăn mất |
| Tổng `JSON.stringify(SECTIONS)` < 800KB, ≤ 5000 hạng mục | Constraint `checklist_defs_shape` trong DB |

### Mỗi hạng mục viết theo 6 khối

```js
{id:"p0-1a", t:"{Việc cần làm — động từ trước}", w:"{Hệ quả nếu không làm}",
 e:"{2h}", b:`
 <h4>Số đo hiện tại</h4>
 <table><tr><th>Chỉ số</th><th>Đo được</th><th>Nên là</th></tr>
 <tr><td>TTFB</td><td class="bad">2,4s</td><td class="good">&lt; 0,8s</td></tr></table>

 <h4>Vì sao việc này quan trọng</h4>
 <p>{cơ chế — vì sao Google/AI xử lý thế nào, không phải "vì SEO cần"}</p>

 <h4>Cách làm</h4>
 <pre><code>{code/config cụ thể, copy dán chạy được}</code></pre>

 <h4>Lệnh verify</h4>
 <pre><code>{lệnh đo lại}</code></pre>
 <p>Đạt khi: {điều kiện đo được, có số}</p>

 <div class="callout warn"><b>Bẫy:</b> {sai lầm hay gặp khi làm việc này}</div>`},
```

Class có sẵn trong `assets/checklist.css`: `.callout` `.callout.warn`
`.callout.good` `.good` `.bad` `table` `pre` `code` `h4` `ul` `ol`.
**Không tự thêm CSS** — file upload bị sanitize, style lạ bị lọc bỏ.

### Phân bổ hạng mục

| Nhóm | id | tag | Số hạng mục | Nội dung |
|---|---|---|---|---|
| P0 | `P0` | `t-p0` | 3–8 | Chỉ thứ đang **chặn hẳn** index/traffic. Nhiều hơn 8 là đã lạm dụng P0 |
| P1 | `P1` | `t-p1` | 10–18 | Lỗi lớn, làm trong 2 tuần |
| P2 | `P2` | `t-p2` | 15–25 | Quan trọng, không gấp |
| P3 | `P3` | `t-p3` | 8–15 | Nâng cao, làm sau khi P0–P2 xong |
| GEO/AIO | `GEO` | `t-geo` | 12–20 | Bot AI, llms.txt, nội dung dễ trích dẫn, FAQ schema |
| Verify | `VFY` | `t-bl` | 5–10 | Bộ lệnh đo lại toàn bộ sau khi sửa |

Tổng 60–90 hạng mục. Dưới 50 là audit chưa đủ sâu; trên 120 thì không ai làm hết
và checklist trở thành trang trí.

---

## BƯỚC 8 — Verify file

```bash
cp /tmp/audit-{id}.html {ORIGIN_REPO}/{id}.html
python3 tools/verify.py
```

`verify.py` chặn: thiếu `CHECKLIST_ID`, id sai định dạng, id trùng, id bị xoá so
với `tools/item-ids.json`. **Lần đầu thêm file mới thì nó báo id mới** — chạy
`python3 tools/verify.py --update-snapshot` để chốt.

Tự kiểm thêm 6 điểm `verify.py` không biết:

1. Mỗi hạng mục P0/P1 có **số đo thật** trong `b:` — không có câu nào dạng "có thể"
2. Mỗi hạng mục có **lệnh verify** chạy được
3. `SCORES` khớp với `SECTIONS` — điểm GEO 8/10 mà có 5 hạng mục GEO P0 là mâu thuẫn
4. Không có `<script src>` lạ, không có `<style>` tự thêm
5. Backslash trong `b:` đã escape đúng (`\\|` trong regex grep, `\\n` trong lệnh)
6. Mở file bằng browser, bấm **Mở hết** — không có hạng mục nào body rỗng hoặc
   HTML vỡ

Rồi báo lại: đường dẫn file, số hạng mục theo nhóm, 3 phát hiện nặng nhất kèm số
đo, và cách upload lên hub (nút **⬆ Upload file HTML** ở `index.html`).

---

## Reference

| File | Khi nào đọc |
|---|---|
| `references/onpage-checklist.md` | Danh mục đầy đủ những gì cần kiểm, theo 8 trục |
| `references/geo-aio.md` | Bước 2 khi bot AI ≠ 200; bước 6 khi chấm điểm GEO; viết nhóm GEO |
| `references/schema-recipes.md` | Viết hạng mục structured data — JSON-LD dán được theo từng loại trang |
| `references/output-format.md` | Bước 7 — khuôn HTML đầy đủ + ví dụ hạng mục hoàn chỉnh |
| `references/checklist-items.md` | Bước 7 — thư viện hạng mục mẫu theo nhóm P0–P3/GEO/VFY |

## Script

| Script | Chạy | Cần gì |
|---|---|---|
| `scripts/probe.sh` | `bash probe.sh <url>` | curl, openssl (tuỳ chọn), awk |
| `scripts/onpage.py` | `python3 onpage.py <url\|file> [--json] [--url …]` | Python 3.8+, không cần pip |
