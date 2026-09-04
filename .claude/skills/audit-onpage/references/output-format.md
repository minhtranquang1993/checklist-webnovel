# Khuôn file HTML xuất ra

File xuất ra phải chạy được ở hai chỗ: mở trực tiếp trong repo (`{id}.html` cạnh
`index.html`), và upload qua nút **⬆ Upload file HTML** ở trang hub. Cả hai đường
đều đọc `const CHECKLIST_ID` / `SCORES` / `SECTIONS` từ **một thẻ `<script>` inline
duy nhất**.

## Cơ chế đọc file — vì sao ràng buộc lại như vậy

Lúc upload, `assets/parse-def.js` không parse HTML bằng regex. Nó bóc thẻ `<script>`
inline đầu tiên có khai `const SECTIONS`, nhét vào một `<iframe sandbox="allow-scripts">`
(không `allow-same-origin`), cho browser tự chạy, rồi lấy giá trị ra bằng
`postMessage`.

Hệ quả trực tiếp:

- **`<script src>` không được nạp.** File có trỏ tới `assets/sync.js` hay CDN nào
  cũng không chạy trong sandbox. Đó là lý do dữ liệu **phải** ở script inline.
- **`localStorage` ném lỗi** trong sandbox origin mờ. Nhưng `const` nào đã khởi tạo
  xong vẫn đọc được ở thẻ script sau — nên script của anh ném giữa đường không nhất
  thiết làm mất `SECTIONS`. Dù vậy: đừng viết code có thể ném.
- **Mọi HTML trong `b:` và `note:` đi qua sanitize.** Tag/attribute ngoài whitelist
  bị lọc bỏ. Đừng thêm `<style>`, `onclick`, `<script>` bên trong nội dung hạng mục.

---

## Khuôn đầy đủ

```html
<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Audit on-page SEO / GEO / AIO — {domain}</title>
<link rel="stylesheet" href="assets/checklist.css">
</head>
<body>
<div class="wrap">

<header class="hero">
  <h1>Audit on-page SEO / GEO / AIO — {domain}</h1>
  <p class="sub">Bản làm việc kèm số đo thật và lệnh verify từng hạng mục.
  Tick xong lưu lên server — cả team thấy chung.</p>
  <div class="meta">
    <span class="chip">Ngày audit: {dd/mm/yyyy}</span>
    <span class="chip">{N} loại trang đo thật</span>
    <span class="chip">18 user-agent · {M} sitemap</span>
    <span class="chip">Mọi con số là số đo thật từ HTTP response</span>
  </div>
  <div class="idbar" id="idbar"></div>
  <div class="needname" id="needname" style="display:none">
    Chưa nhập tên nên chưa tick được. Nhập tên ở ô phía trên — tên này hiện cạnh
    mỗi hạng mục bạn tick, để cả team biết ai đã làm việc gì.
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
  <p><b>Cách dùng:</b> nhập tên một lần, click vào dòng để mở hướng dẫn chi tiết,
  click ô vuông để đánh dấu xong. Tick lưu lên server nên đổi máy vẫn còn.
  Mất mạng vẫn tick được — trang giữ lại và tự đẩy lên khi có mạng.
  Nút <b>Xoá tick</b> bỏ tick cho <b>cả team</b>, không chỉ máy bạn.</p>

  <p><b>Phương pháp đo ({dd/mm/yyyy}):</b></p>
  <ul>
   <li><code>bash probe.sh {url}</code> — 18 user-agent × 3 endpoint, TTFB 3 lượt,
       tỉ lệ nén, chuỗi redirect, robots/llms/sitemap, 10 biến thể chuẩn hoá URL</li>
   <li><code>python3 onpage.py {url}</code> trên {N} loại trang — không chạy JS,
       đúng góc nhìn bot ở lượt crawl đầu</li>
   <li>Đối chiếu render: WebFetch (có JS) vs onpage.py (không JS)</li>
   <li>Đối chiếu đối thủ: {3 domain} cùng keyword "{keyword}"</li>
  </ul>

  <p><b>Không đo được bằng bộ script này</b> — cần công cụ có quyền:</p>
  <ul>
   <li>Core Web Vitals thật (LCP/INP/CLS field data) → PageSpeed Insights / CrUX</li>
   <li>Trang nào đang có impression, keyword nào đang xếp hạng → Google Search Console</li>
   <li>Backlink profile → Ahrefs / Semrush</li>
   <li>Tần suất bot AI ghé thật → log server</li>
  </ul>
</footer>
</div>

<script src="assets/config.js"></script>
<script>
const CHECKLIST_ID = '{id}';

const SCORES=[
 ["Technical SEO",{n},"{ghi chú CÓ SỐ ĐO}"],
 ["On-page SEO",{n},"{...}"],
 ["Structured Data",{n},"{...}"],
 ["Crawlability",{n},"{...}"],
 ["GEO / AIO",{n},"{...}"],
 ["Content",{n},"{...}"],
 ["E-E-A-T",{n},"{...}"],
 ["Performance",{n},"{...}"],
];

/* ---------- DỮ LIỆU CHECKLIST ---------- */
const SECTIONS=[
{
 id:"P0", tag:"t-p0", title:"P0 — {mô tả ngắn: N lỗi đang chặn traffic}",
 note:"{Làm trong 48h. Vì sao mấy lỗi này chặn phần lớn tiềm năng của site.}",
 items:[
  /* 3–8 hạng mục */
 ]
},
{
 id:"P1", tag:"t-p1", title:"P1 — Lỗi lớn",
 note:"{Làm trong 2 tuần. …}",
 items:[ /* 10–18 hạng mục */ ]
},
{
 id:"P2", tag:"t-p2", title:"P2 — Quan trọng, không gấp",
 note:"{...}",
 items:[ /* 15–25 hạng mục */ ]
},
{
 id:"P3", tag:"t-p3", title:"P3 — Nâng cao",
 note:"{Làm sau khi P0–P2 xong.}",
 items:[ /* 8–15 hạng mục */ ]
},
{
 id:"GEO", tag:"t-geo", title:"GEO / AIO — Tối ưu cho AI search",
 note:"{...}",
 items:[ /* 12–20 hạng mục */ ]
},
{
 id:"VFY", tag:"t-bl", title:"Bộ lệnh verify — chạy lại sau khi sửa",
 note:"Mỗi hạng mục ở đây là một lệnh đo lại. Sửa xong chạy lệnh, so với số đo cũ.",
 items:[ /* 5–10 hạng mục */ ]
},
];
</script>
<script src="assets/sync.js"></script>
</body>
</html>
```

---

## Cấu trúc một hạng mục

```js
{id:"{nhóm}-{số}{chữ}", t:"{Việc cần làm}", w:"{Hệ quả nếu không làm}",
 e:"{ước lượng}", b:`{HTML hướng dẫn}`},
```

| Field | Bắt buộc | Giới hạn | Viết thế nào |
|---|---|---|---|
| `id` | ✅ | `^[a-z0-9][a-z0-9-]{0,39}$`, duy nhất toàn file | `p0-1a`, `geo-3b`, `vfy-2` |
| `t` | ✅ | ≤ 300 ký tự | **Động từ trước**: "Gỡ chặn 403 cho bot AI search" |
| `w` | ❌ | ≤ 300 ký tự | Hệ quả, có số nếu được: "Mất 3 kênh AI search" |
| `e` | ❌ | ≤ 40 ký tự | `"30 phút"`, `"1–3h"`, `"1 ngày"` |
| `b` | ❌ | ≤ 200.000 ký tự | HTML — cấu trúc bên dưới |

Quy ước `id`: `{nhóm chữ thường}-{thứ tự}{biến thể}`. Nhóm hạng mục liên quan bằng
cùng số, khác chữ: `p0-1a`, `p0-1b`, `p0-1c` là ba việc của cùng một vấn đề. Cách
này giữ id ổn định khi thêm hạng mục mới — chỉ cần thêm chữ, không phải đánh số lại.

### Body `b:` — 5 khối theo thứ tự

```js
b:`
 <h4>Số đo hiện tại</h4>
 <table><tr><th>Chỉ số</th><th>Đo được</th><th>Nên là</th></tr>
 <tr><td>TTFB trang chi tiết</td><td class="bad">2,41s</td><td class="good">&lt; 0,8s</td></tr>
 <tr><td>Tỉ lệ nén</td><td class="bad">0% (không có Content-Encoding)</td><td class="good">≥ 70%</td></tr></table>
 <p>Đo lúc {hh:mm dd/mm/yyyy}, 3 lượt liên tiếp, cache đã nóng.</p>

 <h4>Vì sao việc này quan trọng</h4>
 <p>{Cơ chế cụ thể: Google/AI xử lý thế nào, dẫn tới hệ quả gì. KHÔNG viết
 "vì SEO cần" hay "để cải thiện trải nghiệm".}</p>

 <h4>Cách làm</h4>
 <pre><code>{config/code dán chạy được ngay}</code></pre>
 <p>{Giải thích 1-2 câu nếu code không tự nói hết}</p>

 <h4>Lệnh verify</h4>
 <pre><code>curl -sS -o /dev/null -w 'ttfb=%{time_starttransfer}s\\n' https://example.com/</code></pre>
 <p><b>Đạt khi:</b> {điều kiện có số đo cụ thể}</p>

 <div class="callout warn"><b>Bẫy:</b> {sai lầm hay gặp đúng ở việc này}</div>`
```

Khối 1, 2, 4 là bắt buộc với mọi hạng mục P0/P1. Khối 3 bắt buộc khi có config/code
cụ thể. Khối 5 chỉ thêm khi có bẫy thật — đừng bịa ra để cho đủ khối.

---

## Class CSS dùng được

Chỉ những class này có style trong `assets/checklist.css`. Thêm class khác không có
hiệu lực; thêm `<style>` thì bị sanitize lọc bỏ.

| Class / tag | Hiển thị |
|---|---|
| `<h4>` | Tiêu đề nhỏ, chữ hoa, màu xám |
| `<table><tr><th><td>` | Bảng có viền |
| `<pre><code>` | Khối code, nền tối |
| `<code>` trong `<p>`/`<li>`/`<td>` | Inline code có viền |
| `class="good"` | Chữ xanh, đậm — số đo đạt |
| `class="bad"` | Chữ đỏ, đậm — số đo không đạt |
| `<div class="callout">` | Hộp viền xanh — ghi chú |
| `<div class="callout warn">` | Hộp viền cam — cảnh báo, bẫy |
| `<div class="callout good">` | Hộp viền xanh lá — đã xong, tin tốt |
| `<ul>` `<ol>` `<li>` `<p>` `<b>` `<i>` `<a>` | Bình thường |

`section.tag` chỉ nhận 6 giá trị: `t-p0` `t-p1` `t-p2` `t-p3` `t-geo` `t-bl`.
Giá trị khác → thẻ mất màu (và `parse-def.js` cảnh báo rồi bỏ `tag`).

---

## Escape trong template literal

`b:` dùng backtick, nên bốn thứ này phải escape:

| Trong nội dung | Viết trong `b:` | Vì sao |
|---|---|---|
| Backtick | `` \` `` | Đóng template literal sớm |
| `${` | `\${` | Bị hiểu là nội suy biến |
| `\` (regex, lệnh shell) | `\\` | Backslash trần bị ăn mất |
| `</script>` | `<\/script>` | Đóng thẻ script của cả file |

Ví dụ đúng:

```js
b:`<pre><code>grep -rn "GPTBot\\|ClaudeBot" /etc/nginx/ | head -20
curl -sS -w 'ttfb=%{time_starttransfer}s\\n' https://example.com/</code></pre>`
```

`\\|` cho `grep` là chỗ sai nhiều nhất: viết `\|` thì template literal ăn mất
backslash, lệnh dán ra thành `grep "GPTBot|ClaudeBot"` — với `grep` cơ bản đó là
tìm chuỗi có ký tự `|`, không phải OR, nên kết quả rỗng và người dùng tưởng site
không có gì.

Và `<` `>` trong text (không phải tag) phải là `&lt;` `&gt;`:

```js
b:`<p>Đạt khi TTFB &lt; 0,8s và số script chặn render = 0.</p>`
```

---

## Ví dụ hạng mục hoàn chỉnh

### P0 — bot AI bị chặn

```js
{id:"p0-1a", t:"Gỡ chặn 403 cho nhóm bot AI có trả link về site",
 w:"Mất 3 kênh AI search — ChatGPT Search, Claude, Perplexity đều không đọc được",
 e:"1–3h", b:`
 <h4>Số đo hiện tại (đo {hh:mm dd/mm/yyyy})</h4>
 <table><tr><th>Bot</th><th>Loại</th><th>Trang chủ</th><th>robots.txt</th></tr>
 <tr><td><code>OAI-SearchBot</code></td><td>AI search, CÓ trả link</td>
     <td class="bad">403</td><td class="bad">403</td></tr>
 <tr><td><code>Claude-SearchBot</code></td><td>AI search, CÓ trả link</td>
     <td class="bad">403</td><td class="bad">403</td></tr>
 <tr><td><code>PerplexityBot</code></td><td>AI search, CÓ trả link</td>
     <td class="bad">403</td><td class="bad">403</td></tr>
 <tr><td><code>Googlebot</code></td><td>search</td>
     <td class="good">200</td><td class="good">200</td></tr></table>
 <p>9/18 user-agent nhận 403. Response body dài đúng 25 byte
 (<code>Your request was blocked.</code>), <code>content-type: text/plain</code>.</p>

 <h4>Vì sao việc này quan trọng</h4>
 <p>Ba bot trên là bot <b>có gắn link về site</b> khi trả lời. Chặn chúng không bảo
 vệ được nội dung — bot training là nhóm khác (<code>GPTBot</code>,
 <code>ClaudeBot</code>, <code>CCBot</code>) và vẫn bị chặn riêng — mà chỉ làm mất
 kênh traffic. Đối thủ mở thì AI trích dẫn đối thủ.</p>

 <h4>Cách truy nguồn chặn</h4>
 <p>Header có <code>post-check=0, pre-check=0</code> là đặc trưng PHP
 (<code>session_cache_limiter</code>), <b>không phải</b> trang chặn của Cloudflare —
 Cloudflare khi chặn trả HTML kèm <code>error code: 1020</code>. Vậy khả năng cao
 nhất là code ở origin.</p>
<pre><code>ssh user@server
grep -rn "GPTBot\\|ClaudeBot\\|PerplexityBot\\|HTTP_USER_AGENT" \\
  /path/to/webroot --include=*.php | head -40

grep -rn "GPTBot\\|user_agent" /etc/nginx/ /path/to/webroot/.htaccess 2>/dev/null</code></pre>
 <p>Nếu không thấy: Cloudflare → Security → Bots → tắt
 <b>"Block AI Scrapers and Crawlers"</b>; rồi WAF → Custom rules → tìm rule lọc
 <code>User-Agent</code>.</p>

 <h4>Lệnh verify</h4>
<pre><code>for UA in OAI-SearchBot Claude-SearchBot PerplexityBot ChatGPT-User Claude-User; do
  printf '%-18s %s\\n' "$UA" \\
    "$(curl -sS -o /dev/null -A "$UA/1.0" -w '%{http_code}' https://example.com/)"
done</code></pre>
 <p><b>Đạt khi:</b> cả 5 dòng trả <code>200</code>.</p>

 <div class="callout warn"><b>Bẫy:</b> sửa <code>robots.txt</code> mà không sửa lớp
 chặn ở server thì bot vẫn nhận 403. <code>robots.txt</code> chỉ là lời đề nghị —
 nó không gỡ được chặn thật. Phải sửa cả hai tầng.</div>`},
```

### GEO — heading dạng câu hỏi

```js
{id:"geo-2a", t:"Đổi heading trang nội dung sang dạng câu hỏi người dùng thật gõ",
 w:"Không có cửa vào AI Overview và People Also Ask",
 e:"2–4h / 10 bài", b:`
 <h4>Số đo hiện tại</h4>
 <table><tr><th>Trang</th><th>Tổng H2+H3</th><th>Dạng câu hỏi</th><th>Đối thủ TB</th></tr>
 <tr><td>Trang chủ</td><td>72</td><td class="bad">1</td><td>—</td></tr>
 <tr><td>Trang bài viết</td><td>14</td><td class="bad">0</td><td class="good">6</td></tr></table>

 <h4>Vì sao việc này quan trọng</h4>
 <p>AI Overview và PAA lấy đoạn trả lời cho một câu hỏi cụ thể. Heading dạng chủ đề
 ("Quy trình phẫu thuật") không khớp với câu người ta gõ ("mổ lasik mất bao lâu"),
 nên đoạn dưới nó không được coi là câu trả lời cho truy vấn nào.</p>

 <h4>Cách làm</h4>
 <table><tr><th>Đang có</th><th>Đổi thành</th></tr>
 <tr><td>Quy trình phẫu thuật</td><td>Mổ Lasik mất bao lâu?</td></tr>
 <tr><td>Vấn đề cảm giác đau</td><td>Mổ Lasik có đau không?</td></tr>
 <tr><td>Chi phí</td><td>Mổ Lasik giá bao nhiêu?</td></tr></table>
 <p>Ngay dưới mỗi heading, câu đầu tiên trả lời thẳng trong 40–60 từ, tự đứng được
 không cần đọc phần trước, và có số liệu cụ thể:</p>
<pre><code>&lt;h2&gt;Mổ Lasik có đau không?&lt;/h2&gt;
&lt;p&gt;&lt;b&gt;Không đau trong lúc mổ&lt;/b&gt; vì mắt được nhỏ thuốc tê bề mặt.
Sau mổ 2–6 giờ có cảm giác cộm và chảy nước mắt, hết dần trong 1–2 ngày.
Khoảng 3% ca cần thuốc giảm đau nhẹ.&lt;/p&gt;</code></pre>

 <h4>Lệnh verify</h4>
<pre><code>python3 .claude/skills/audit-onpage/scripts/onpage.py https://example.com/bai-viet/ \\
  | grep -A 10 "heading câu hỏi"</code></pre>
 <p><b>Đạt khi:</b> ≥ 3 heading câu hỏi mỗi trang nội dung.</p>

 <div class="callout warn"><b>Bẫy:</b> đừng mở đầu bằng câu dẫn ("Đây là thắc mắc
 của rất nhiều người..."). Câu đó không trả lời gì và chính nó là đoạn AI đọc đầu
 tiên rồi bỏ qua cả section.</div>`},
```

### VFY — lệnh đo lại

```js
{id:"vfy-1", t:"Chạy lại toàn bộ probe HTTP và so với số đo ngày {dd/mm}",
 w:"Không có số đo mới thì không biết việc sửa có tác dụng hay không",
 e:"5 phút", b:`
 <h4>Lệnh</h4>
<pre><code>bash .claude/skills/audit-onpage/scripts/probe.sh https://example.com/ \\
  > /tmp/probe-moi.txt
diff /tmp/probe-cu.txt /tmp/probe-moi.txt</code></pre>

 <h4>Đối chiếu với số đo cũ</h4>
 <table><tr><th>Chỉ số</th><th>{dd/mm} (cũ)</th><th>Mục tiêu</th></tr>
 <tr><td>Bot AI trả 403</td><td class="bad">9/18</td><td class="good">0/18</td></tr>
 <tr><td>TTFB trang chi tiết</td><td class="bad">2,41s</td><td class="good">&lt; 0,8s</td></tr>
 <tr><td>Tỉ lệ nén</td><td class="bad">0%</td><td class="good">≥ 70%</td></tr>
 <tr><td>Biến thể URL trả 200</td><td class="bad">4</td><td class="good">1</td></tr></table>
 <p><b>Đạt khi:</b> cả 4 dòng đạt cột mục tiêu.</p>`},
```

---

## Checklist trước khi giao file

- [ ] `const CHECKLIST_ID` có, khớp `^[a-z0-9][a-z0-9-]{0,39}$`
- [ ] Mọi `item.id` duy nhất trong toàn file (kiểm bằng `verify.py`)
- [ ] `section.id` khớp `data-f` của nút filter; `section.tag` ∈ 6 giá trị cho phép
- [ ] `SCORES` đủ 8 trục, mỗi ghi chú **có số đo**
- [ ] Điểm `SCORES` không mâu thuẫn với `SECTIONS` (GEO 8/10 mà có 5 hạng mục GEO P0 là sai)
- [ ] Mọi hạng mục P0/P1 có số đo thật + lệnh verify
- [ ] Không có `<script src>` nào ngoài `assets/config.js` và `assets/sync.js`
- [ ] Không có `<style>` hay `onclick` trong `b:`
- [ ] Backslash đã escape `\\`, `<`/`>` trong text đã thành `&lt;`/`&gt;`
- [ ] Footer ghi rõ phương pháp đo + những gì **không** đo được
- [ ] `python3 tools/verify.py` pass
- [ ] Mở bằng browser, bấm **Mở hết** — không hạng mục nào body rỗng hoặc HTML vỡ
