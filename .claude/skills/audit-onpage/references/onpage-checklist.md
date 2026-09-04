# Danh mục kiểm on-page — 8 trục

Danh mục để đối chiếu khi viết checklist. Cột **Đo bằng** cho biết lấy số ở đâu:
`probe` = probe.sh, `onpage` = onpage.py, `json` = onpage.py --json, `tay` = phải
tự kiểm bằng WebFetch/WebSearch/đọc HTML.

---

## 1. Technical SEO

| Kiểm | Đo bằng | Đạt khi | Không đạt thì mất gì |
|---|---|---|---|
| HTTPS + cert còn hạn | probe · cert | notAfter còn > 30 ngày | Cảnh báo trình duyệt, mất trust |
| http → https | probe · CHUẨN HOÁ URL | 301, 1 hop | Hai bản song song trong index |
| www ↔ non-www | probe · CHUẨN HOÁ URL | 301 về đúng 1 bản | Chia PageRank làm hai |
| Dấu `/` cuối URL | probe · CHUẨN HOÁ URL | 1 bản 200, bản kia 301 | Trùng lặp toàn site |
| Path chữ hoa | probe · UPPERCASE path | 301 về chữ thường, hoặc 404 | Trùng lặp |
| `index.html` | probe · index.html | 301 về `/` hoặc 404 | Trùng lặp trang chủ |
| Tham số rác (`?zz=1`) | probe · junk param | 301 bỏ param, hoặc canonical trỏ bản sạch | Vô số bản trùng, loãng ngân sách crawl |
| UTM/fbclid | probe · ?utm_source | 200 nhưng canonical trỏ bản sạch | Bản có UTM bị index |
| `rel=canonical` | onpage · META | có, self-referencing, đúng 1 thẻ | Google tự chọn — thường chọn sai |
| `meta robots` | onpage · META | không có `noindex` ngoài ý muốn | Trang biến mất khỏi index |
| `X-Robots-Tag` | onpage · META | không xung đột với meta robots | Xung đột thì Google chọn cái nghiêm hơn |
| `meta viewport` | onpage · META | có | Mobile-first index đánh giá là không thân thiện |
| `<html lang>` | onpage · META | có, đúng ngôn ngữ | Sai targeting, screen reader đọc sai |
| hreflang | onpage · META | đối xứng hai chiều, có `x-default` | Google bỏ qua cả cụm hreflang |
| 404 thật | probe · 404 THẬT | trả 404, không redirect về `/` | Soft 404 ăn ngân sách crawl |
| Chuỗi redirect | probe · hops | ≤ 1 hop | Mỗi hop mất một phần tín hiệu link |
| Header bảo mật | probe · HEADER | có HSTS, X-Content-Type-Options | Ảnh hưởng trust, không trực tiếp ranking |

---

## 2. On-page SEO

| Kiểm | Đo bằng | Đạt khi | Ghi chú |
|---|---|---|---|
| `<title>` | onpage · META | 30–60 ký tự, đúng 1 thẻ | Ngưỡng theo chỗ SERP cắt (~600px) |
| Keyword trong title | tay | xuất hiện, ưu tiên gần đầu | Không nhồi — 1 lần là đủ |
| Title trùng nhau | tay · so nhiều trang | mỗi trang một title | Trùng title = Google gộp trang |
| `meta description` | onpage · META | 70–160 ký tự, có CTA | Không phải yếu tố ranking, nhưng ảnh hưởng CTR |
| H1 | onpage · NỘI DUNG | đúng 1, khác title | 0 H1 hoặc nhiều H1 đều là vấn đề |
| Cấu trúc H2/H3 | onpage · heading | không nhảy bậc | Nhảy bậc → AI parse sai quan hệ section |
| Heading rỗng | json · empty_headings | 0 | Heading rỗng để tạo khoảng trắng là dấu hiệu spam |
| Slug URL | tay | ngắn, có keyword, không có ID số | `/lasik-gia-bao-nhieu/` > `/p?id=8821` |
| Độ sâu URL | tay | ≤ 3 tầng từ trang chủ | Sâu hơn → crawl thưa, ít link |
| Alt ảnh | onpage · ẢNH | 100% có alt, mô tả thật | Alt nhồi keyword bị coi là spam |
| Anchor internal | json · generic_anchor | anchor mô tả đích, không "xem thêm" | Anchor chung chung không truyền ngữ cảnh |
| Anchor rỗng | json · empty_anchor | 0 | Link không anchor = không truyền tín hiệu |
| Số internal link | onpage · LINK | ≥ 5 vào, ≥ 3 ra | < 5 → trang gần mồ côi |
| Link http:// trên https | json · http_links_on_https | 0 | Mixed content |
| Link chết | tay | 0 | `curl -o /dev/null -w '%{http_code}'` từng link |

---

## 3. Structured Data

| Kiểm | Đo bằng | Đạt khi |
|---|---|---|
| JSON-LD cú pháp | onpage · STRUCTURED | `jsonld_valid == jsonld_blocks` |
| `Organization` / `LocalBusiness` | onpage · @type | có ở trang chủ, kèm `sameAs`, `logo` |
| `WebSite` + `SearchAction` | onpage · @type | có ở trang chủ |
| `BreadcrumbList` | onpage · breadcrumb | có ở **mọi** trang không phải trang chủ |
| `Article`/`BlogPosting`/`NewsArticle` | onpage · @type | có ở trang bài viết, đủ `author` + `datePublished` + `dateModified` |
| `Product` + `Offer` + `AggregateRating` | onpage · @type | có ở trang sản phẩm, giá khớp giá hiển thị |
| `FAQPage` | onpage · has_faq | có khi trang **thật sự** có Q&A hiển thị |
| `HowTo` | onpage · has_howto | có ở bài hướng dẫn từng bước |
| `Person` cho tác giả | onpage · has_person_author | có, `@id` trỏ trang tác giả |
| `speakable` | onpage · has_speakable | có ở nội dung ngắn, rõ — cho voice search |
| Khớp nội dung hiển thị | tay | mọi field trong schema đều thấy được trên trang |

**Luật cứng:** schema khai thứ không hiển thị trên trang là vi phạm chính sách
Google — có thể bị phạt thủ công. Giá trong `Offer` phải là giá người dùng thấy;
`AggregateRating` phải có review thật hiển thị.

---

## 4. Crawlability

| Kiểm | Đo bằng | Đạt khi |
|---|---|---|
| `robots.txt` tồn tại | probe · FILE HẠ TẦNG | 200, `text/plain` |
| Không chặn nhầm CSS/JS | probe · robots toàn văn | không `Disallow` asset cần để render |
| `Sitemap:` trong robots | probe · SITEMAP | có, URL tuyệt đối |
| Sitemap 200 + XML hợp lệ | probe · SITEMAP | 200, `application/xml` |
| Đủ loại trang trong sitemap | probe · số URL con | mọi template đều có mặt |
| `lastmod` | probe · số lastmod | có và đúng thật | 
| URL trong sitemap đều 200 | tay · lấy mẫu 20 URL | 0 URL trả 3xx/4xx |
| Sitemap ≤ 50.000 URL / 50MB | probe | nếu vượt thì phải chia + index |
| Phân trang | tay | mỗi trang phân trang self-canonical, có link tới trang sau |
| `?page=N` vs `/N/` | tay | chỉ 1 dạng trả 200, dạng kia 301 |
| Nội dung chính không cần JS | **bước 4** | `onpage.py` thấy đủ nội dung |
| Faceted navigation | tay | tổ hợp filter không sinh URL index được vô hạn |
| Trang mồ côi | tay | mọi trang trong sitemap đều có ≥ 1 internal link |

---

## 5. GEO / AIO

Chi tiết ở `geo-aio.md`. Rút gọn:

| Kiểm | Đo bằng | Đạt khi |
|---|---|---|
| Bot AI search không bị chặn | probe · STATUS THEO UA | `OAI-SearchBot`, `Claude-SearchBot`, `PerplexityBot` = 200 |
| Bot đọc-khi-hỏi không bị chặn | probe | `ChatGPT-User`, `Claude-User`, `Perplexity-User` = 200 |
| Chiến lược training đã chốt | probe · robots | `GPTBot`/`ClaudeBot`/`CCBot` nhất quán với quyết định kinh doanh |
| `llms.txt` | probe · FILE HẠ TẦNG | 200, `text/plain`, nội dung thật |
| Heading dạng câu hỏi | onpage · heading câu hỏi | ≥ 3 mỗi trang nội dung |
| Trả lời ngay dưới heading | tay | 40–60 từ đầu tiên là câu trả lời trực tiếp |
| Số liệu cụ thể | onpage · số liệu cụ thể | ≥ 5 mỗi trang |
| Trích dẫn nguồn | json · has_source_cite | có nguồn ngoài kiểm chứng được |
| FAQ schema + FAQ hiển thị | onpage | cả hai, khớp nhau |
| Ngày cập nhật | json · has_date_text | có, thật |
| Bảng so sánh | json · tables | ≥ 1 với chủ đề có tính so sánh |
| Định nghĩa thực thể rõ | tay | "X là Y" ở đoạn đầu |

---

## 6. Content

| Kiểm | Đo bằng | Đạt khi |
|---|---|---|
| Số từ so đối thủ | bước 5 | ≥ 80% trung bình top 3 |
| Độ phủ chủ đề | bước 5 | có mọi H2 mà ≥ 2/3 đối thủ đều có |
| Cannibalization | WebSearch `site:domain {keyword}` | 1 URL cho 1 intent |
| Trùng lặp nội bộ | tay | mô tả sản phẩm/danh mục không copy-paste |
| Khớp ý định tìm kiếm | bước 5 · SERP | dạng bài khớp dạng bài đang top |
| Đoạn văn dễ đọc | json · long_paragraphs | 0 đoạn > 120 từ |
| Có list/table | json · lists/tables | có — dễ vào featured snippet |
| Mục lục | json · has_toc | có với bài > 1.500 từ |
| Ảnh/video minh hoạ | onpage · ẢNH | có, không phải stock chung chung |
| CTA rõ | tay | có, đúng giai đoạn phễu |

---

## 7. E-E-A-T

| Kiểm | Đo bằng | Đạt khi |
|---|---|---|
| Tên tác giả hiển thị | json · has_author_text | có |
| Trang tác giả | tay | có, kèm bằng cấp/kinh nghiệm |
| `Person` schema cho tác giả | onpage · has_person_author | có |
| Ngày đăng + cập nhật | json · has_date_text | cả hai, hiển thị |
| Trích nguồn ngoài | json · has_source_cite | có, link tới nguồn uy tín |
| Trang Giới thiệu / Liên hệ | tay | có, địa chỉ + điện thoại thật |
| `Organization` + `sameAs` | onpage · has_org | có, trỏ social thật |
| Chính sách (bảo mật, đổi trả) | tay | có với site thương mại |
| Kinh nghiệm trực tiếp | tay | có ảnh/số liệu tự làm, không chỉ tổng hợp lại |

Với chủ đề YMYL (sức khoẻ, tài chính, pháp lý) mọi dòng trên là **bắt buộc**, không
phải nên có.

---

## 8. Performance

| Kiểm | Đo bằng | Đạt khi |
|---|---|---|
| TTFB | probe · TỐC ĐỘ | < 0,8s (tốt < 0,3s) |
| Nén | probe · nén | Brotli hoặc gzip, tiết kiệm ≥ 70% |
| HTTP/2 hoặc /3 | probe · alpn | HTTP/2+ |
| Script chặn render | onpage · HIỆU NĂNG | 0 |
| CSS nội tuyến | onpage · CSS inline | < 50KB (critical CSS thôi) |
| Ảnh có width/height | onpage · ẢNH | 100% — chống CLS |
| Lazy load ảnh dưới màn hình đầu | onpage · không lazy | ảnh dưới fold đều lazy |
| Ảnh WebP/AVIF | onpage · next_gen | phần lớn |
| `srcset` | onpage · srcset | có với ảnh responsive |
| iframe lazy | json · iframe_no_lazy | 0 |
| preconnect cho font/CDN | onpage · preconnect | có |
| Số host bên thứ ba | json · third_party_hosts | càng ít càng tốt; > 5 là gánh nặng |
| Cache header | probe · HEADER | `cache-control` hợp lý, có `etag`/`last-modified` |

**Core Web Vitals thật** (LCP/INP/CLS) cần dữ liệu field — `probe.sh` không đo
được. Ghi trong báo cáo là "cần PageSpeed Insights hoặc CrUX để xác nhận", đừng
suy đoán con số.
