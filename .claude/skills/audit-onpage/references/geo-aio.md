# GEO / AIO — tối ưu cho AI search

GEO (Generative Engine Optimization) và AIO (AI Optimization) là việc làm cho nội
dung **được AI trích dẫn**, không phải làm cho nó xếp hạng cao trên SERP truyền
thống. Hai việc chồng lấn nhiều nhưng không giống nhau.

Khác biệt cốt lõi: SERP xếp hạng **trang**, AI trích dẫn **đoạn**. Một trang tốt
nhưng viết dàn trải thì AI không có đoạn nào để bốc ra. Ngược lại một trang có 5
đoạn trả lời gọn, mỗi đoạn tự đứng được, sẽ được trích dẫn nhiều lần.

---

## Phần 1 — Bot AI phải vào được

### Ba loại bot, ba quyết định khác nhau

| Loại | Bot | Chặn thì mất gì | Nên |
|---|---|---|---|
| **AI search — có trả link** | `OAI-SearchBot`, `Claude-SearchBot`, `PerplexityBot` | Mất hẳn kênh traffic từ AI search | **Luôn cho vào** |
| **Đọc khi user hỏi** | `ChatGPT-User`, `Claude-User`, `Perplexity-User` | User hỏi về site → AI không đọc được, trả lời sai hoặc bỏ qua | **Luôn cho vào** |
| **Hút dữ liệu training** | `GPTBot`, `ClaudeBot`, `CCBot`, `meta-externalagent`, `Amazonbot` | Không mất traffic | Tuỳ nội dung |
| **Cờ opt-out training** | `Google-Extended`, `Applebot-Extended` | Chặn **không** ảnh hưởng Google Search / Siri | Tuỳ nội dung |

Hai lỗi hay gặp nhất:

- Nghĩ `ClaudeBot` là bot trả link. Không phải — nó hút dữ liệu training. Bot có
  trả link là `Claude-User` (khi user hỏi) và `Claude-SearchBot` (index cho search).
- `Allow: /` cho `Applebot-Extended`. Vô nghĩa — đó là **cờ opt-out**, chỉ
  `Disallow` mới có tác dụng. Bot đọc để trả lời là `Applebot`.

### Chốt chiến lược theo loại nội dung

| Nội dung | Bot search/đọc | Bot training | Lý do |
|---|---|---|---|
| Blog, tin tức, hướng dẫn | mở | mở | Nội dung để lan toả, càng nhiều nơi nhắc càng tốt |
| Nội dung có bản quyền (truyện, khoá học, sách) | mở phần giới thiệu | chặn | Cho AI biết có gì, không cho lấy nội dung |
| Sản phẩm thương mại | mở | mở | Muốn AI gợi ý sản phẩm |
| Nội dung sau paywall | chặn cả hai | chặn | Không có lý gì cho không |

Với nội dung có bản quyền, cấu trúc URL quyết định việc chặn có làm được hay không.
URL kiểu `/ten-truyen/chuong-5/` cho phép một dòng `Disallow: /*/chuong-` chặn đúng
nội dung mà không đụng trang giới thiệu. URL phẳng kiểu `/chuong-5-ten-truyen/` thì
không tách được — phải sửa cấu trúc URL trước.

### robots.txt mẫu — mở search, chặn training

```
# Search truyền thống: mở hết
User-agent: Googlebot
Disallow: /admin/
Disallow: /cart/

User-agent: Bingbot
Disallow: /admin/
Disallow: /cart/

# AI search có trả link: mở trang giới thiệu, chặn nội dung đầy đủ
User-agent: OAI-SearchBot
Disallow: /*/chuong-
Disallow: /admin/

User-agent: ChatGPT-User
Disallow: /*/chuong-
Disallow: /admin/

User-agent: Claude-SearchBot
Disallow: /*/chuong-
Disallow: /admin/

User-agent: Claude-User
Disallow: /*/chuong-
Disallow: /admin/

User-agent: PerplexityBot
Disallow: /*/chuong-
Disallow: /admin/

User-agent: Perplexity-User
Disallow: /*/chuong-
Disallow: /admin/

# Training: chặn toàn bộ
User-agent: GPTBot
Disallow: /

User-agent: ClaudeBot
Disallow: /

User-agent: CCBot
Disallow: /

User-agent: Google-Extended
Disallow: /

User-agent: Applebot-Extended
Disallow: /

User-agent: meta-externalagent
Disallow: /

# Còn lại
User-agent: *
Disallow: /admin/
Disallow: /cart/

Sitemap: https://example.com/sitemap.xml
```

Muốn chừa một chương đọc thử thì thêm `Allow` **trước** `Disallow` trong cùng khối:

```
User-agent: OAI-SearchBot
Allow: /*/chuong-1/$
Allow: /*/chuong-1$
Disallow: /*/chuong-
```

Thứ tự không quan trọng với Google (nó chọn rule khớp dài nhất), nhưng đặt `Allow`
trước là quy ước dễ đọc và an toàn với bot xử lý theo thứ tự.

### Truy nguồn chặn bot khi probe.sh báo ≠ 200

`robots.txt` chỉ là **lời đề nghị**. Bot bị 403 nghĩa là có lớp chặn thật ở đâu đó.
Đọc dấu vết trong response để biết chặn ở tầng nào:

| Dấu hiệu trong response | Nguồn chặn |
|---|---|
| Body HTML, có `error code: 1020` | Cloudflare WAF custom rule |
| Body HTML, có `Cloudflare Ray ID` + "Sorry, you have been blocked" | Cloudflare Bot Fight Mode / "Block AI Scrapers" |
| Body `text/plain` ngắn, header có `post-check=0, pre-check=0` | Code PHP ở origin (đặc trưng `session_cache_limiter`) |
| Body HTML của chính site, kèm 403 | Rule trong `.htaccess` hoặc nginx |
| 503 + `Retry-After` | Rate limit, không phải chặn theo UA |

```bash
# Xem cả header và body của response 403
curl -sSD - -A "GPTBot/1.2" https://example.com/ | head -40

# Tìm trong code PHP ở origin
ssh user@server
grep -rn "GPTBot\|ClaudeBot\|PerplexityBot\|CCBot\|HTTP_USER_AGENT" \
  /path/to/webroot --include=*.php | head -40

# Tìm trong cấu hình server
grep -rn "GPTBot\|ClaudeBot\|user_agent" /etc/nginx/ /path/to/webroot/.htaccess 2>/dev/null
```

Với Cloudflare, kiểm theo thứ tự: Security → Bots → tắt **"Block AI Scrapers and
Crawlers"**; Security → WAF → Custom rules → tìm rule lọc `User-Agent`; Security →
WAF → Managed rules.

---

## Phần 2 — llms.txt

`llms.txt` là file text ở gốc domain, mô tả nội dung site theo cách LLM đọc được.
Chưa có engine nào chính thức cam kết đọc nó, nên đừng đặt kỳ vọng cao — nhưng nó
rẻ và không có rủi ro.

```markdown
# Example.com

> Một câu mô tả site làm gì, cho ai.

Bối cảnh cần biết: {2-3 câu về lĩnh vực, quy mô, điểm khác biệt}

## Nội dung chính

- [Tên trang](https://example.com/trang/): mô tả một câu
- [Trang khác](https://example.com/khac/): mô tả một câu

## Chủ đề chuyên sâu

- [Hướng dẫn X](https://example.com/x/): dành cho ai, giải quyết gì

## Không nên trích dẫn

- Trang khuyến mãi (giá thay đổi liên tục)
- Trang tin tức cũ hơn 2 năm
```

Luật: phải là `text/plain` (không phải `text/html`), phải trả 200 cho bot AI (kiểm
bằng `probe.sh`), và **phải nhất quán với robots.txt**. Có `llms.txt` mời AI đọc
trong khi robots.txt chặn hết bot AI là tự mâu thuẫn — chọn một.

`llms-full.txt` là bản đầy đủ nội dung, chỉ nên có khi site nhỏ (< 50 trang).

---

## Phần 3 — Nội dung dễ được AI trích dẫn

Đây là phần quan trọng hơn cả robots.txt, và cũng là phần hay bị bỏ.

### Cấu trúc câu hỏi → trả lời

AI bốc ra đoạn trả lời được câu hỏi. Nên viết sẵn cho nó bốc:

```html
<h2>Mổ Lasik có đau không?</h2>
<p><b>Không đau trong lúc mổ</b> vì mắt được nhỏ thuốc tê bề mặt. Sau mổ 2–6 giờ
có cảm giác cộm và chảy nước mắt, hết dần trong 1–2 ngày. Khoảng 3% ca cần thuốc
giảm đau nhẹ.</p>
<p>{giải thích thêm 2-3 đoạn cho người đọc kỹ}</p>
```

Ba thứ làm đoạn này dễ trích dẫn:

1. **Heading là chính câu hỏi** người ta gõ — không phải "Vấn đề cảm giác đau"
2. **Câu đầu tiên trả lời thẳng**, 40–60 từ, tự đứng được không cần ngữ cảnh trước
3. **Có số liệu cụ thể** — "2–6 giờ", "khoảng 3%" — AI ưu tiên nội dung định lượng

Câu mở đầu kiểu "Đây là một câu hỏi mà rất nhiều người thắc mắc khi tìm hiểu về
phẫu thuật khúc xạ" không trả lời gì, và đó chính là đoạn AI sẽ bỏ qua.

### Định nghĩa thực thể

AI xây bản đồ thực thể. Nói rõ ràng cái gì là cái gì:

```html
<p><b>Lasik</b> là phương pháp phẫu thuật khúc xạ dùng dao vi phẫu tạo vạt giác
mạc, sau đó laser excimer chỉnh hình phần nhu mô bên dưới. Khác với
<b>Femto-Lasik</b> (tạo vạt bằng laser femtosecond) và <b>SMILE</b> (không tạo
vạt, rút mô qua đường mổ nhỏ).</p>
```

Mẫu `X là Y, khác với Z ở chỗ W` cho AI cả định nghĩa lẫn quan hệ phân biệt.

### Bảng so sánh

Bảng là dạng dữ liệu AI parse chính xác nhất. Chủ đề nào có tính so sánh thì phải
có bảng — mỗi hàng một đối tượng, mỗi cột một thuộc tính, có đơn vị.

### Trích dẫn nguồn

Link tới nguồn ngoài kiểm chứng được (nghiên cứu, cơ quan chính thức, số liệu công
bố) làm tăng khả năng AI coi trang là đáng tin. Không phải link ra là mất PageRank
— đó là hiểu sai từ 2010.

### Ngày cập nhật thật

AI ưu tiên nội dung mới với chủ đề có tính thời sự. Ngày phải thật; đổi ngày mà
không sửa nội dung là thứ vừa vô ích vừa rủi ro.

---

## Phần 4 — Schema cho GEO

| Schema | Tác dụng với AI |
|---|---|
| `FAQPage` | Cặp câu hỏi–trả lời đã cấu trúc sẵn, AI không phải tự tách |
| `HowTo` | Chuỗi bước có thứ tự, dùng cho câu hỏi "làm thế nào" |
| `Article` + `author` + `dateModified` | Tín hiệu tác giả và độ mới |
| `Organization` + `sameAs` | Liên kết site với thực thể đã biết trong knowledge graph |
| `Person` cho tác giả | Gắn nội dung với chuyên gia có định danh |
| `speakable` | Đánh dấu đoạn nào đọc lên được — voice assistant |
| `BreadcrumbList` | Cho AI biết trang nằm ở đâu trong cấu trúc chủ đề |

Chi tiết JSON-LD dán được: xem `schema-recipes.md`.

**Luật cứng:** `FAQPage` schema mà trang không có FAQ hiển thị là vi phạm chính
sách Google. Schema phải mô tả thứ người dùng thật sự thấy.

---

## Phần 5 — Đo kết quả GEO

Khó hơn SEO vì không có "GSC cho AI". Cách đo được:

| Cách | Đo được gì | Hạn chế |
|---|---|---|
| Hỏi trực tiếp ChatGPT/Claude/Perplexity về chủ đề của mình | Có được trích dẫn không, trích trang nào | Không lặp lại được chính xác, kết quả thay đổi |
| Log server, lọc theo UA bot AI | Tần suất bot ghé, trang nào được đọc nhiều | Cần quyền vào log |
| Referrer từ `chat.openai.com`, `perplexity.ai` trong Analytics | Traffic thật từ AI | Nhiều AI không gửi referrer |
| `probe.sh` định kỳ | Bot có bị chặn lại không | Chỉ đo được cửa vào, không đo được kết quả |

Ghi trong báo cáo: cái nào đo được, cái nào chỉ quan sát được. Không hứa "sẽ tăng
X% trích dẫn" — không ai đo được con số đó.
