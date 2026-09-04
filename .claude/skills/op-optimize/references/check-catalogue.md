# Thư viện `item.id` — danh mục phép kiểm

`item.id` là **khoá gắn tick trong DB**. Lấy id từ bảng dưới, không tự đặt theo thứ tự phát
hiện: hai lý do, cả hai đều là mất tick thật.

1. **Id không được mang mức ưu tiên.** Một việc hạ từ P0 xuống P1 ở lần audit sau vẫn phải giữ
   nguyên id. Nếu id là `p0-1a` thì nó buộc phải đổi thành `p1-…` và tick của nó mồ côi.
   Mức ưu tiên là **`section` mà hạng mục nằm vào**, không phải một phần của id.
2. **Id không được mang thứ tự.** Chèn một phát hiện vào giữa làm mọi số sau đó trượt một bước
   → tick nhảy sang hạng mục khác, sai âm thầm, không ai thấy.

Nên id ở đây là **tên của phép kiểm**. Cùng một phép kiểm trên mọi site, mọi lần audit, mọi
mức ưu tiên → cùng một id.

## Cách dùng

- Site nào **không áp dụng** một phép kiểm thì bỏ hẳn hạng mục đó (site một ngôn ngữ không cần
  `hreflang-missing`), trừ khi lần audit trước đã có nó → lúc đó giữ, `w` = `ĐÃ XONG` hoặc
  `KHÔNG ÁP DỤNG — {lý do}`.
- Một phép kiểm sinh nhiều việc trên nhiều loại trang thì thêm hậu tố loại trang:
  `title-len-home`, `title-len-post`, `title-len-cat`. Hậu tố cũng phải ổn định.
- Phát hiện **không có trong bảng** → tự đặt id theo cùng lối (danh từ việc, không số thứ tự,
  không mức ưu tiên), rồi **thêm một dòng vào bảng này** trong cùng lần chạy đó.
- Cột "Mức mặc định" chỉ là điểm khởi đầu. Nâng/hạ theo ngữ cảnh site rồi đặt hạng mục vào
  `section` tương ứng — id không đổi.

---

## Technical SEO

| `item.id` | Phép kiểm | Đo bằng | Mức mặc định |
|---|---|---|---|
| `noindex-on-page` | `meta robots` / `X-Robots-Tag` có `noindex` | `onpage.py` → `meta.noindex` | P0 |
| `canonical-missing` | Không có `rel=canonical` | `meta.canonical` | P1 |
| `canonical-multi` | Nhiều hơn 1 thẻ canonical (Google bỏ qua tất cả) | `meta.canonical_count` | P0 |
| `canonical-cross` | Canonical trỏ sang URL khác | `meta.canonical_self` | P1 |
| `url-dup-www` | `www` và không `www` đều trả 200 | `probe.sh` → CHUẨN HOÁ URL | P1 |
| `url-dup-slash` | Có/không dấu `/` cuối đều trả 200 | CHUẨN HOÁ URL | P2 |
| `url-dup-index` | `/index.html` trả 200 song song với `/` | CHUẨN HOÁ URL | P2 |
| `url-dup-case` | Path viết hoa trả 200 | CHUẨN HOÁ URL | P2 |
| `url-param-dup` | `?utm_*` / `?fbclid` / param rác tạo bản trùng | CHUẨN HOÁ URL | P2 |
| `http-no-redirect` | `http://` không 301 sang `https://` | CHUẨN HOÁ URL | P1 |
| `soft-404` | URL không tồn tại trả 200 hoặc 301 về trang chủ | `probe.sh` → 404 THẬT | P1 |
| `redirect-chain` | Chuỗi redirect ≥ 2 hop | `hops=` trong CHUẨN HOÁ URL | P2 |
| `cert-expiry` | Cert TLS sắp hết hạn | `probe.sh` → DNS / TLS | P2 |
| `hsts-missing` | Không có `strict-transport-security` | HEADER BẢO MẬT | P3 |
| `mixed-content` | Link/tài nguyên còn `http://` trên trang https | `links.http_links_on_https` | P2 |
| `viewport-missing` | Không có `meta viewport` | `meta.viewport` | P0 |
| `lang-missing` | `<html>` không có `lang` | `meta.lang` | P2 |
| `charset-missing` | Không khai charset | `meta.charset` | P3 |
| `hreflang-missing` | Site nhiều ngôn ngữ mà không có `hreflang` | `meta.hreflang` | P2 |
| `xrobots-conflict` | `X-Robots-Tag` xung đột với `meta robots` | `meta.x_robots_tag` | P1 |

## On-page SEO

| `item.id` | Phép kiểm | Đo bằng | Mức mặc định |
|---|---|---|---|
| `title-missing` | Không có `<title>` | `meta.title` | P0 |
| `title-multi` | Nhiều hơn 1 thẻ `<title>` | `meta.title_count` | P0 |
| `title-len` | Title ngoài khoảng 30–60 ký tự | `meta.title_len` | P1 |
| `title-no-keyword` | Title không chứa keyword chính | so với `keyword=` | P2 |
| `title-dup` | Nhiều loại trang dùng chung một title | so giữa các trang mẫu | P1 |
| `desc-missing` | Không có meta description | `meta.description` | P1 |
| `desc-len` | Description ngoài khoảng 70–160 | `meta.desc_len` | P2 |
| `h1-missing` | Không có H1 | `content.h1_count` | P1 |
| `h1-multi` | Nhiều H1 | `content.h1_count` | P2 |
| `heading-jump` | Heading nhảy bậc (h2 → h4) | `content.heading_jumps` | P2 |
| `heading-empty` | Heading rỗng hoặc dưới 3 ký tự | `content.empty_headings` | P3 |
| `img-alt-missing` | Ảnh thiếu `alt` | `images.no_alt` | P2 |
| `img-alt-empty` | `alt=""` trên ảnh nội dung | `images.empty_alt` | P3 |
| `og-missing` | Không có Open Graph | `social.og_count` | P2 |
| `og-partial` | Thiếu một phần OG (`image`, `url`, `type`) | `social.og_missing` | P3 |
| `twitter-missing` | Không có Twitter Card | `social.twitter_count` | P3 |
| `internal-link-thin` | Dưới 5 internal link — trang gần như mồ côi | `links.internal` | P1 |
| `anchor-generic` | Anchor kiểu "xem thêm", "tại đây" | `links.generic_anchor` | P2 |
| `anchor-empty` | Link không có anchor text | `links.empty_anchor` | P2 |
| `nofollow-internal` | `nofollow` trên internal link | `links.nofollow` | P3 |

## Structured Data

| `item.id` | Phép kiểm | Đo bằng | Mức mặc định |
|---|---|---|---|
| `schema-none` | Không có structured data nào | `schema.jsonld_blocks` + `microdata` | P1 |
| `schema-invalid` | JSON-LD sai cú pháp — Google bỏ cả block | `schema.errors` | P0 |
| `schema-org-missing` | Thiếu `Organization`/`LocalBusiness` | `schema.has_org` | P2 |
| `schema-breadcrumb` | Thiếu `BreadcrumbList` | `schema.has_breadcrumb` | P2 |
| `schema-article` | Trang nội dung thiếu `Article`/`BlogPosting` | `schema.has_article` | P1 |
| `schema-product` | Trang sản phẩm thiếu `Product`/`Offer` | `schema.has_product` | P1 |
| `schema-faq` | Có khối hỏi đáp mà thiếu `FAQPage` | `schema.has_faq` + `content.has_faq_text` | P2 |
| `schema-howto` | Có quy trình từng bước mà thiếu `HowTo` | `schema.has_howto` | P3 |
| `schema-author` | Thiếu `Person` cho tác giả | `schema.has_person_author` | P2 |
| `schema-dates` | Thiếu `datePublished`/`dateModified` | `schema.has_dates` | P2 |
| `schema-searchaction` | Thiếu `SearchAction` (sitelinks searchbox) | `schema.has_searchaction` | P3 |
| `schema-video` | Có video mà thiếu `VideoObject` | `schema.has_video` | P3 |

## Crawlability

| `item.id` | Phép kiểm | Đo bằng | Mức mặc định |
|---|---|---|---|
| `robots-missing` | Không có `robots.txt` | `probe.sh` → FILE HẠ TẦNG | P1 |
| `robots-blocks-assets` | `robots.txt` chặn CSS/JS cần để render | robots.txt toàn văn | P1 |
| `sitemap-missing` | Không tìm thấy sitemap nào | `probe.sh` → SITEMAP | P1 |
| `sitemap-not-in-robots` | Sitemap có nhưng `robots.txt` không khai | robots.txt toàn văn | P2 |
| `sitemap-gap` | Có loại trang không nằm trong sitemap | số URL từng sitemap con | P1 |
| `sitemap-no-lastmod` | Sitemap thiếu `lastmod` | `N_LM` trong SITEMAP | P2 |
| `pagination-canonical` | Trang phân trang canonical về trang 1 | `onpage.py` trên trang 2 | P1 |
| `orphan-deep-page` | Trang tầng sâu không có link trỏ vào | `links.internal_sample` | P2 |
| `crawl-budget-param` | Nhiều URL tham số cùng nội dung | CHUẨN HOÁ URL + sitemap | P2 |

## GEO / AIO

Nhóm này đi vào `section` `GEO` (`tag: t-geo`), trừ khi bot bị chặn hẳn thì lên `P0`.

| `item.id` | Phép kiểm | Đo bằng | Mức mặc định |
|---|---|---|---|
| `bot-ai-search-403` | Bot AI **có trả link** (`OAI-SearchBot`, `Claude-SearchBot`, `PerplexityBot`) không nhận 200 | `probe.sh` → STATUS THEO USER-AGENT | P0 |
| `bot-ai-user-403` | Bot đọc-khi-user-hỏi (`ChatGPT-User`, `Claude-User`, `Perplexity-User`) bị chặn | STATUS THEO UA | P0 |
| `bot-search-403` | `Googlebot`/`Bingbot`/`Applebot` bị chặn | STATUS THEO UA | P0 |
| `bot-robots-403` | Chính `robots.txt` trả 403 với một số UA | cột `robots` | P1 |
| `bot-training-policy` | Chính sách bot training (`GPTBot`, `ClaudeBot`, `CCBot`) chưa nhất quán với robots.txt | STATUS THEO UA + robots.txt | P3 |
| `bot-extended-flag` | Dùng `Allow` cho `Google-Extended`/`Applebot-Extended` (vô nghĩa — chỉ `Disallow` có tác dụng) | robots.txt toàn văn | P3 |
| `llms-txt-missing` | Không có `/llms.txt` | FILE HẠ TẦNG | GEO |
| `llms-full-missing` | Không có `/llms-full.txt` | FILE HẠ TẦNG | GEO |
| `question-headings` | Không có heading dạng câu hỏi — mất cửa vào AI Overview và PAA | `content.question_headings` | P1 |
| `answer-first-para` | Đoạn ngay dưới heading không trả lời thẳng trong 40–60 từ | đọc `content.headings` + body | GEO |
| `numeric-facts-thin` | Ít số liệu cụ thể — AI ưu tiên trích nội dung có số đo | `content.numeric_facts` | GEO |
| `source-cite-missing` | Không dẫn nguồn ngoài | `content.has_source_cite` | GEO |
| `faq-block-missing` | Không có khối hỏi đáp trên trang nội dung | `content.has_faq_text` | GEO |
| `toc-missing` | Bài dài không có mục lục có anchor | `content.has_toc` | GEO |
| `entity-clarity` | Không nói rõ thực thể (tên tổ chức/địa chỉ/lĩnh vực) ở đầu trang | body + schema `Organization` | GEO |
| `js-only-content` | Nội dung chính chỉ có sau khi chạy JS — phần lớn bot AI không thấy | bước 4: WebFetch vs `onpage.py` | P0 |
| `speakable-missing` | Thiếu `speakable` cho trợ lý giọng nói | `schema.has_speakable` | P3 |
| `freshness-signal` | Không có ngày đăng/cập nhật hiển thị | `content.has_date_text` | GEO |
| `table-for-facts` | Số liệu nằm trong đoạn văn thay vì bảng (AI trích bảng dễ hơn) | `content.tables` | GEO |
| `list-for-steps` | Quy trình viết thành đoạn thay vì `<ol>` | `content.lists` | GEO |

## Content

| `item.id` | Phép kiểm | Đo bằng | Mức mặc định |
|---|---|---|---|
| `thin-content` | Dưới 300 từ thân bài | `content.words` | P1 |
| `content-gap-vs-competitor` | Ngắn hơn đối thủ đáng kể | bước 5 | P1 |
| `topic-coverage-gap` | Thiếu H2 mà cả 3 đối thủ đều có | bước 5 | P1 |
| `cannibalization` | Nhiều trang nhắm cùng keyword | so title + top bigram giữa các trang | P2 |
| `long-paragraph` | Đoạn dài quá 120 từ | `content.long_paragraphs` | P3 |
| `chrome-heavy` | Chữ ở nav/footer nhiều hơn thân bài | `content.chrome_words` vs `words` | P2 |
| `text-html-ratio` | Tỉ lệ text/HTML quá thấp | `content.text_html_ratio` | P3 |
| `intent-mismatch` | Loại nội dung không khớp intent của keyword | bước 5 (SERP đang xếp loại gì) | P1 |

## E-E-A-T

| `item.id` | Phép kiểm | Đo bằng | Mức mặc định |
|---|---|---|---|
| `author-missing` | Không thấy tác giả (cả text và schema) | `content.has_author_text`, `schema.has_person_author` | P1 |
| `author-page-missing` | Có tên tác giả nhưng không có trang tác giả | `links.internal_sample` | P2 |
| `date-missing` | Không có ngày đăng/cập nhật | `content.has_date_text` | P2 |
| `about-page-missing` | Không có trang giới thiệu | sitemap + internal link | P2 |
| `contact-info-missing` | Không có địa chỉ/điện thoại kiểm chứng được | body trang liên hệ | P2 |
| `credential-missing` | Lĩnh vực YMYL mà không có chứng chỉ/giấy phép | body + schema | P1 |
| `external-authority-link` | Không dẫn link ra nguồn uy tín | `links.external_domains` | P3 |

## Performance

| `item.id` | Phép kiểm | Đo bằng | Mức mặc định |
|---|---|---|---|
| `ttfb-slow` | TTFB trên 0,8s | `probe.sh` → TỐC ĐỘ | P1 |
| `no-compression` | Không có `content-encoding` | dòng `nén:` | P1 |
| `render-blocking-js` | Script chặn render trong `<head>` | `perf.head_scripts_blocking` | P1 |
| `inline-css-heavy` | CSS nội tuyến lớn, không cache được | `perf.inline_css_bytes` | P2 |
| `img-no-dimensions` | Ảnh thiếu `width`/`height` → CLS | `images.no_dimensions` | P2 |
| `img-no-lazy` | Ảnh dưới màn hình đầu không `loading="lazy"` | `images.no_lazy` | P2 |
| `img-not-next-gen` | Chưa dùng WebP/AVIF | `images.next_gen` | P2 |
| `img-no-srcset` | Không có `srcset` cho ảnh lớn | `images.srcset` | P3 |
| `lcp-no-preload` | Ảnh LCP không `preload`/`fetchpriority=high` | `perf.preload`, `images.fetchpriority_high` | P2 |
| `font-no-preload` | Font tự host không `preload` | `perf.font_preload` | P3 |
| `third-party-heavy` | Nhiều host bên thứ ba | `perf.third_party_hosts` | P2 |
| `iframe-no-lazy` | `<iframe>` không lazy | `perf.iframe_no_lazy` | P3 |
| `cache-header-weak` | `cache-control` quá ngắn / thiếu `etag` | HEADER BẢO MẬT / CACHE | P2 |

## VFY — bộ lệnh đo lại

Nhóm `VFY` (`tag: t-bl`) **luôn có**, vì dấu `Audit host:` gắn ở `note` của nhóm này.

| `item.id` | Nội dung |
|---|---|
| `vfy-bots` | Chạy lại bảng status theo user-agent, so với số đo lần này |
| `vfy-speed` | Đo lại TTFB 3 lượt + tỉ lệ nén |
| `vfy-onpage` | Chạy lại `onpage.py` trên đúng các loại trang đã đo |
| `vfy-schema` | Dán JSON-LD vào Rich Results Test, đối chiếu `@type` mong đợi |
| `vfy-url-norm` | Chạy lại 10 biến thể chuẩn hoá URL, mỗi dòng phải 301 về đúng một bản |
| `vfy-sitemap` | Đếm lại URL từng sitemap con, so với số trang thật của từng loại |
| `vfy-render` | So lại WebFetch (có JS) với `onpage.py` (không JS) |
| `vfy-index-status` | Kiểm Search Console: trang đã index chưa (cần quyền, không đo được bằng script) |

