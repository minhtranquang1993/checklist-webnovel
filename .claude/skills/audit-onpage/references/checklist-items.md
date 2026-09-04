# Thư viện hạng mục mẫu

Hạng mục mẫu để chọn và **sửa lại theo số đo thật**. Chỗ `{...}` bắt buộc thay bằng
số đo. Hạng mục nào không đo được thì bỏ, không giữ lại với con số bịa.

Cột **Điều kiện** cho biết chỉ thêm hạng mục đó khi số đo thoả điều kiện — thêm
hạng mục "gỡ chặn bot AI" vào site mà bot đã 200 hết là làm loãng checklist.

---

## P0 — chỉ thứ đang chặn hẳn index/traffic

Ngưỡng vào P0 rất cao: **không sửa thì mọi việc khác đều lãng phí**. 3–8 hạng mục.
Nhiều hơn là đã lạm dụng.

| id gợi ý | Hạng mục | Điều kiện |
|---|---|---|
| `p0-1a` | Gỡ chặn 403/503 cho nhóm bot AI có trả link | `probe`: `OAI-SearchBot`/`Claude-SearchBot`/`PerplexityBot` ≠ 200 |
| `p0-1b` | Chốt chiến lược bot AI: mở chọn lọc hay chặn hết | robots.txt không nhất quán, hoặc chưa từng quyết định |
| `p0-1c` | Cấu hình lại robots.txt theo chiến lược đã chốt | Sau `p0-1b` |
| `p0-1d` | Chặn thật nhóm bot training ở tầng server | Đã chốt chặn training nhưng chỉ có robots.txt |
| `p0-2a` | Gỡ `noindex` khỏi trang cần index | `onpage`: `noindex` ngoài ý muốn |
| `p0-2b` | Sửa canonical trỏ sai trang | `canonical_self` false và không cố ý |
| `p0-2c` | Gộp nhiều thẻ canonical/title về một | `canonical_count` hoặc `title_count` > 1 |
| `p0-3a` | Render nội dung chính ở server, không phụ thuộc JS | Bước 4: `onpage.py` < 300 từ mà WebFetch thấy đủ |
| `p0-3b` | Sửa sitemap trả lỗi hoặc XML không hợp lệ | `probe`: sitemap ≠ 200 hoặc không parse được |
| `p0-3c` | Đưa loại trang bị bỏ sót vào sitemap | Có template không xuất hiện trong sitemap nào |
| `p0-4a` | Sửa soft 404 thành 404 thật | `probe`: URL rác trả 200 hoặc 301 về `/` |
| `p0-4b` | Thêm `meta viewport` | `onpage`: không có viewport |
| `p0-5a` | Sửa JSON-LD sai cú pháp | `onpage`: `jsonld_valid < jsonld_blocks` |
| `p0-5b` | Gỡ `aggregateRating` không có review hiển thị | Có `AggregateRating` mà trang không có review |
| `p0-6a` | Chuẩn hoá http/www về một bản bằng 301 | `probe`: nhiều biến thể trả 200 |
| `p0-6b` | Gia hạn cert sắp hết hạn | `probe`: `notAfter` còn < 30 ngày |

---

## P1 — lỗi lớn, làm trong 2 tuần

10–18 hạng mục.

| id gợi ý | Hạng mục | Điều kiện |
|---|---|---|
| `p1-1a` | Viết lại title vượt/thiếu ngưỡng hiển thị | `title_len` ngoài 30–60 |
| `p1-1b` | Bỏ title trùng nhau giữa các trang cùng template | Đo ≥ 2 trang thấy title giống nhau |
| `p1-1c` | Thêm meta description cho trang đang thiếu | `description` null |
| `p1-1d` | Thêm/sửa H1 | `h1_count` = 0 hoặc > 1 |
| `p1-2a` | Thêm `rel=canonical` self-referencing | `canonical` null |
| `p1-2b` | 301 biến thể URL chữ hoa / thiếu-thừa dấu `/` | `probe`: nhiều biến thể trả 200 |
| `p1-2c` | Chuẩn hoá tham số phân trang về một dạng | `?page=N` và `/N/` đều trả 200 |
| `p1-2d` | Canonical cho URL có UTM trỏ bản sạch | `?utm_source` trả 200 mà canonical trỏ chính nó |
| `p1-3a` | Thêm structured data cho loại trang đang thiếu | `jsonld_blocks` = 0 ở template nào |
| `p1-3b` | Thêm `Organization` + `sameAs` ở trang chủ | `has_org` false |
| `p1-3c` | Thêm `Article`/`Product` cho trang chi tiết | Template chi tiết thiếu schema tương ứng |
| `p1-4a` | Bỏ script chặn render trong `<head>` | `head_scripts_blocking` > 0 |
| `p1-4b` | Bật nén Brotli/gzip | `probe`: không có `content-encoding` hoặc tiết kiệm < 60% |
| `p1-4c` | Giảm TTFB | `probe`: TTFB > 1s |
| `p1-5a` | Thêm internal link vào trang đang mồ côi | `links.internal` < 5 |
| `p1-5b` | Thêm ngày đăng + cập nhật hiển thị | `has_date_text` false |
| `p1-5c` | Thêm tên tác giả + trang tác giả | `has_author_text` false và `has_person_author` false |
| `p1-6a` | Bổ sung nội dung để bằng mặt bằng đối thủ | Bước 5: số từ < 70% TB top 3 |
| `p1-6b` | Gộp/phân định trang bị cannibalization | `site:` search thấy nhiều URL cùng intent |

---

## P2 — quan trọng, không gấp

15–25 hạng mục.

| id gợi ý | Hạng mục | Điều kiện |
|---|---|---|
| `p2-1a` | Sửa description ngoài ngưỡng 70–160 | `desc_len` ngoài ngưỡng |
| `p2-1b` | Sửa heading nhảy bậc | `heading_jumps` > 0 |
| `p2-1c` | Bỏ heading rỗng | `empty_headings` > 0 |
| `p2-1d` | Cắt đoạn văn dài quá 120 từ | `long_paragraphs` > 0 |
| `p2-2a` | Thêm alt cho ảnh đang thiếu | `images.no_alt` > 0 |
| `p2-2b` | Thêm width/height cho ảnh | `no_dimensions` > 0 |
| `p2-2c` | Lazy load ảnh dưới màn hình đầu | `no_lazy` > số ảnh trong màn hình đầu |
| `p2-2d` | Chuyển ảnh sang WebP/AVIF | `next_gen` thấp so với `total` |
| `p2-2e` | Thêm `srcset` cho ảnh responsive | `srcset` = 0 mà có ảnh lớn |
| `p2-2f` | Lazy load iframe | `iframe_no_lazy` > 0 |
| `p2-3a` | Thêm `BreadcrumbList` schema + breadcrumb HTML | `has_breadcrumb` false |
| `p2-3b` | Thêm Open Graph | `og_count` = 0 |
| `p2-3c` | Thêm `<html lang>` | `lang` null |
| `p2-4a` | Đổi anchor chung chung thành anchor mô tả | `generic_anchor` > 0 |
| `p2-4b` | Thêm anchor cho link đang rỗng | `empty_anchor` > 0 |
| `p2-4c` | Đổi link `http://` thành `https://` | `http_links_on_https` > 0 |
| `p2-5a` | Tách CSS nội tuyến, chỉ giữ critical CSS | `inline_css_bytes` > 50KB |
| `p2-5b` | Giảm số host bên thứ ba | `third_party_hosts` > 5 |
| `p2-5c` | Thêm `preconnect` cho font/CDN | `preconnect` = 0 mà có font ngoài |
| `p2-6a` | Thêm `lastmod` vào sitemap | `probe`: số `lastmod` < số `url` |
| `p2-6b` | Dọn URL 3xx/4xx trong sitemap | Lấy mẫu 20 URL thấy có URL không 200 |
| `p2-7a` | Thêm mục lục cho bài dài | `has_toc` false và `words` > 1500 |
| `p2-7b` | Thêm bảng so sánh | `tables` = 0 với chủ đề có tính so sánh |
| `p2-7c` | Thêm trích dẫn nguồn ngoài | `has_source_cite` false |
| `p2-8a` | Thêm header bảo mật (HSTS, X-Content-Type-Options) | `probe`: header không có |

---

## P3 — nâng cao

8–15 hạng mục. Làm sau khi P0–P2 xong.

| id gợi ý | Hạng mục | Điều kiện |
|---|---|---|
| `p3-1a` | Thêm Twitter Card | `twitter_count` = 0 |
| `p3-1b` | Thêm `speakable` cho nội dung ngắn rõ | Có nội dung Q&A |
| `p3-1c` | Thêm `VideoObject` cho trang có video | Có video nhúng |
| `p3-1d` | Thêm hreflang | Site đa ngôn ngữ mà `hreflang` = 0 |
| `p3-2a` | Rút ngắn độ sâu URL | Có trang > 3 tầng |
| `p3-2b` | Thêm `.well-known/security.txt` | `probe`: 404 |
| `p3-2c` | Thêm favicon đầy đủ bộ | `probe`: `/favicon.ico` 404 |
| `p3-3a` | Chuyển sang HTTP/3 | `probe`: alpn = HTTP/2 |
| `p3-3b` | Thêm `fetchpriority=high` cho ảnh LCP | `fetchpriority_high` = 0 |
| `p3-3c` | Preload font chính | `font_preload` = 0 |
| `p3-4a` | Xây internal link theo cụm chủ đề | Sau khi đã đủ nội dung |
| `p3-4b` | Thêm trang tổng hợp chủ đề (pillar page) | Có ≥ 5 bài cùng chủ đề mà không có trang trục |
| `p3-4c` | Thêm chính sách bảo mật / đổi trả | Site thương mại đang thiếu |

---

## GEO / AIO

12–20 hạng mục. Nhóm này là chỗ tạo khác biệt — hầu hết site đối thủ chưa làm.

| id gợi ý | Hạng mục | Điều kiện |
|---|---|---|
| `geo-1a` | Mở nhóm bot AI có trả link | Nếu chưa xử ở P0 |
| `geo-1b` | Sửa tên bot khai sai trong robots.txt | `ClaudeBot` bị coi là bot trả link, `Applebot-Extended` bị `Allow`, v.v. |
| `geo-1c` | Thêm `llms.txt` | `probe`: 404 |
| `geo-1d` | Sửa `llms.txt` trả sai content-type | Trả `text/html` thay vì `text/plain` |
| `geo-1e` | Bỏ mâu thuẫn giữa `llms.txt` và `robots.txt` | Có `llms.txt` mà robots chặn hết bot AI |
| `geo-2a` | Đổi heading sang dạng câu hỏi người dùng gõ | `question_headings` < 3 ở trang nội dung |
| `geo-2b` | Viết câu trả lời trực tiếp 40–60 từ ngay dưới mỗi heading câu hỏi | Sau `geo-2a` |
| `geo-2c` | Thêm số liệu cụ thể vào nội dung | `numeric_facts` < 5 |
| `geo-2d` | Thêm định nghĩa thực thể rõ ràng ("X là Y, khác Z ở W") | Chủ đề có thực thể cần phân biệt |
| `geo-2e` | Thêm bảng so sánh cho chủ đề có tính so sánh | `tables` = 0 |
| `geo-3a` | Thêm `FAQPage` schema + FAQ hiển thị | `has_faq` false, có câu hỏi khách thật |
| `geo-3b` | Thêm `HowTo` cho bài hướng dẫn từng bước | Có bài dạng hướng dẫn mà `has_howto` false |
| `geo-3c` | Thêm `Person` schema cho tác giả, `@id` khớp `author.@id` | `has_person_author` false |
| `geo-3d` | Nối schema thành `@graph` bằng `@id` nhất quán | Có nhiều block schema rời không trỏ nhau |
| `geo-4a` | Thêm ngày cập nhật thật vào trang nội dung | `has_dates` false |
| `geo-4b` | Thêm trích dẫn nguồn ngoài kiểm chứng được | `has_source_cite` false |
| `geo-5a` | Dựng cách đo trích dẫn AI (hỏi thủ công định kỳ + lọc log theo UA bot) | Chưa có cách đo nào |
| `geo-5b` | Lọc referrer từ `chat.openai.com`/`perplexity.ai` trong Analytics | Chưa theo dõi |

---

## VFY — bộ lệnh verify

5–10 hạng mục. Mỗi hạng mục là một lệnh đo lại kèm bảng đối chiếu số đo cũ.

| id gợi ý | Hạng mục |
|---|---|
| `vfy-1` | Chạy lại `probe.sh` toàn bộ, `diff` với kết quả cũ |
| `vfy-2` | Đo lại status 18 user-agent — mục tiêu 0 bot bị chặn ngoài ý muốn |
| `vfy-3` | Chạy lại `onpage.py` trên {N} loại trang, so số cảnh báo |
| `vfy-4` | Đo lại TTFB 3 lượt + tỉ lệ nén |
| `vfy-5` | Đếm lại biến thể URL trả 200 — mục tiêu đúng 1 |
| `vfy-6` | Test schema bằng Rich Results Test + Schema Markup Validator |
| `vfy-7` | Lấy mẫu 20 URL trong sitemap, kiểm đều 200 |
| `vfy-8` | Kiểm lại render: `onpage.py` vs WebFetch |
| `vfy-9` | Chạy PageSpeed Insights lấy Core Web Vitals field data |
| `vfy-10` | Kiểm Coverage + Enhancements trong Google Search Console sau 2 tuần |

Mẫu `b:` cho hạng mục VFY: lệnh chạy được, rồi bảng ba cột **Chỉ số / số đo ngày
audit / mục tiêu**. Không có bảng đối chiếu thì hạng mục VFY vô nghĩa — người làm
không biết lấy gì làm chuẩn.

---

## Nguyên tắc chọn hạng mục

1. **Không đo được thì không đưa vào.** Checklist 90 hạng mục mà 30 cái không có số
   đo thì tệ hơn checklist 60 hạng mục có số đo hết.
2. **Gộp trùng lặp.** "Thiếu OG trên cả 4 loại trang" là một hạng mục, không phải bốn.
3. **P0 phải khắt khe.** Nếu hạng mục không thoả "không sửa thì việc khác lãng phí"
   thì nó là P1.
4. **Mỗi hạng mục một việc.** "Sửa title và description" là hai hạng mục — người
   làm cần tick riêng để biết còn gì chưa xong.
5. **Ước lượng `e:` thật.** Nói "30 phút" cho việc mất một ngày làm người ta mất
   niềm tin vào cả checklist.
