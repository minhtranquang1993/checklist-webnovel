# JSON-LD dán được — theo loại trang

Mọi mẫu dưới đây đặt trong `<script type="application/ld+json">` ở `<head>` hoặc
cuối `<body>`. Thay giá trị trong `{}`.

**Ba luật bất di bất dịch:**

1. Mọi field trong schema **phải hiển thị được trên trang**. Khai giá 5.000.000 mà
   trang ghi 6.000.000 là vi phạm chính sách, có thể bị phạt thủ công.
2. `@id` dùng URL tuyệt đối và **giữ nguyên giữa các trang** — đó là cách nối các
   node thành một graph. Đổi `@id` là tạo thực thể mới.
3. Test bằng cả hai: [Rich Results Test](https://search.google.com/test/rich-results)
   (Google có đọc được không) và [Schema Markup Validator](https://validator.schema.org/)
   (cú pháp schema.org có đúng không). Hai công cụ kiểm hai thứ khác nhau.

---

## Trang chủ — Organization + WebSite

```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://example.com/#organization",
      "name": "{Tên đầy đủ}",
      "alternateName": "{Tên gọi tắt}",
      "url": "https://example.com/",
      "logo": {
        "@type": "ImageObject",
        "url": "https://example.com/logo.png",
        "width": 512,
        "height": 512
      },
      "description": "{1-2 câu mô tả}",
      "foundingDate": "{2015}",
      "sameAs": [
        "https://www.facebook.com/{page}",
        "https://www.youtube.com/@{channel}",
        "https://www.linkedin.com/company/{slug}"
      ],
      "contactPoint": {
        "@type": "ContactPoint",
        "telephone": "+84{...}",
        "contactType": "customer service",
        "areaServed": "VN",
        "availableLanguage": ["Vietnamese", "English"]
      }
    },
    {
      "@type": "WebSite",
      "@id": "https://example.com/#website",
      "url": "https://example.com/",
      "name": "{Tên site}",
      "publisher": { "@id": "https://example.com/#organization" },
      "inLanguage": "vi-VN",
      "potentialAction": {
        "@type": "SearchAction",
        "target": {
          "@type": "EntryPoint",
          "urlTemplate": "https://example.com/tim-kiem/?q={search_term_string}"
        },
        "query-input": "required name=search_term_string"
      }
    }
  ]
}
```

`SearchAction` chỉ khai khi site **thật sự có** trang tìm kiếm nhận query qua URL.
Kiểm bằng cách mở `urlTemplate` với một từ khoá thật.

---

## Doanh nghiệp có địa chỉ — LocalBusiness

Thay `LocalBusiness` bằng type con cụ thể nếu có: `MedicalClinic`, `Restaurant`,
`Store`, `Dentist`, `LegalService`… Type càng cụ thể càng nhiều tín hiệu.

```json
{
  "@context": "https://schema.org",
  "@type": "MedicalClinic",
  "@id": "https://example.com/#business",
  "name": "{Tên}",
  "image": "https://example.com/anh-mat-tien.jpg",
  "url": "https://example.com/",
  "telephone": "+84{...}",
  "priceRange": "{500.000₫ - 30.000.000₫}",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "{Số nhà, đường}",
    "addressLocality": "{Quận}",
    "addressRegion": "{Thành phố}",
    "postalCode": "{70000}",
    "addressCountry": "VN"
  },
  "geo": {
    "@type": "GeoCoordinates",
    "latitude": "{10.7769}",
    "longitude": "{106.7009}"
  },
  "openingHoursSpecification": [
    {
      "@type": "OpeningHoursSpecification",
      "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
      "opens": "07:30",
      "closes": "17:00"
    },
    {
      "@type": "OpeningHoursSpecification",
      "dayOfWeek": "Saturday",
      "opens": "07:30",
      "closes": "12:00"
    }
  ],
  "sameAs": ["https://www.facebook.com/{page}"]
}
```

Toạ độ phải khớp địa chỉ thật — lấy từ Google Maps, không đoán.

---

## Bài viết — Article / BlogPosting / NewsArticle

Chọn type: `NewsArticle` cho tin tức có tính thời sự, `BlogPosting` cho blog,
`Article` cho phần còn lại.

```json
{
  "@context": "https://schema.org",
  "@type": "BlogPosting",
  "@id": "https://example.com/bai-viet/#article",
  "headline": "{Tiêu đề, ≤ 110 ký tự}",
  "description": "{Mô tả 1-2 câu}",
  "image": {
    "@type": "ImageObject",
    "url": "https://example.com/anh-bai-viet.jpg",
    "width": 1200,
    "height": 675
  },
  "datePublished": "2026-03-15T08:00:00+07:00",
  "dateModified": "2026-08-20T14:30:00+07:00",
  "author": {
    "@type": "Person",
    "@id": "https://example.com/tac-gia/nguyen-van-a/#person",
    "name": "{Tên tác giả}",
    "url": "https://example.com/tac-gia/nguyen-van-a/",
    "jobTitle": "{Chức danh}"
  },
  "publisher": { "@id": "https://example.com/#organization" },
  "mainEntityOfPage": {
    "@type": "WebPage",
    "@id": "https://example.com/bai-viet/"
  },
  "inLanguage": "vi-VN",
  "articleSection": "{Danh mục}",
  "keywords": ["{từ khoá 1}", "{từ khoá 2}"]
}
```

`dateModified` phải là ngày sửa nội dung thật. `author` là `Person` có `url` trỏ
trang tác giả thật — `author: "Admin"` không cho tín hiệu E-E-A-T nào.

---

## Trang tác giả — Person

```json
{
  "@context": "https://schema.org",
  "@type": "Person",
  "@id": "https://example.com/tac-gia/nguyen-van-a/#person",
  "name": "{Tên}",
  "url": "https://example.com/tac-gia/nguyen-van-a/",
  "image": "https://example.com/anh-tac-gia.jpg",
  "jobTitle": "{Chức danh}",
  "worksFor": { "@id": "https://example.com/#organization" },
  "description": "{Kinh nghiệm, chuyên môn — 2-3 câu}",
  "alumniOf": {
    "@type": "EducationalOrganization",
    "name": "{Trường}"
  },
  "knowsAbout": ["{lĩnh vực 1}", "{lĩnh vực 2}"],
  "sameAs": ["https://www.linkedin.com/in/{slug}"]
}
```

`@id` ở đây phải **khớp chính xác** `author.@id` trong Article. Đó là chỗ nối
bài viết với thực thể tác giả.

---

## Breadcrumb — mọi trang không phải trang chủ

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Trang chủ", "item": "https://example.com/" },
    { "@type": "ListItem", "position": 2, "name": "{Danh mục}", "item": "https://example.com/danh-muc/" },
    { "@type": "ListItem", "position": 3, "name": "{Tên trang}" }
  ]
}
```

Phần tử cuối **không có** `item` — nó là trang hiện tại. Breadcrumb schema phải
khớp breadcrumb HTML hiển thị trên trang.

---

## FAQ — chỉ khi trang có FAQ hiển thị

```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "{Câu hỏi đúng như hiển thị trên trang}",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "{Câu trả lời. HTML cơ bản được: <p> <br> <ul> <li> <a>}"
      }
    },
    {
      "@type": "Question",
      "name": "{Câu hỏi 2}",
      "acceptedAnswer": { "@type": "Answer", "text": "{Trả lời 2}" }
    }
  ]
}
```

3–8 câu là vừa. Câu hỏi phải là câu người ta thật sự gõ — lấy từ People Also Ask
hoặc từ câu hỏi khách hàng thật, không tự nghĩ ra câu không ai hỏi.

`QAPage` là type khác, dùng cho trang forum một câu hỏi nhiều câu trả lời của người
dùng. Đừng lẫn.

---

## Hướng dẫn từng bước — HowTo

```json
{
  "@context": "https://schema.org",
  "@type": "HowTo",
  "name": "{Cách làm X}",
  "description": "{Mô tả ngắn}",
  "totalTime": "PT30M",
  "estimatedCost": { "@type": "MonetaryAmount", "currency": "VND", "value": "0" },
  "supply": [{ "@type": "HowToSupply", "name": "{Vật liệu cần}" }],
  "tool": [{ "@type": "HowToTool", "name": "{Dụng cụ}" }],
  "step": [
    {
      "@type": "HowToStep",
      "position": 1,
      "name": "{Tên bước}",
      "text": "{Làm gì cụ thể}",
      "url": "https://example.com/bai-viet/#buoc-1",
      "image": "https://example.com/buoc-1.jpg"
    },
    {
      "@type": "HowToStep",
      "position": 2,
      "name": "{Bước 2}",
      "text": "{...}",
      "url": "https://example.com/bai-viet/#buoc-2"
    }
  ]
}
```

`totalTime` theo ISO 8601: `PT30M` = 30 phút, `PT2H` = 2 giờ, `P1D` = 1 ngày.
`url` của mỗi bước trỏ tới anchor thật trong trang — phải có `id` tương ứng trong
HTML.

---

## Sản phẩm — Product + Offer

```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  "@id": "https://example.com/san-pham/#product",
  "name": "{Tên sản phẩm}",
  "image": ["https://example.com/sp-1.jpg", "https://example.com/sp-2.jpg"],
  "description": "{Mô tả}",
  "sku": "{MÃ-SKU}",
  "brand": { "@type": "Brand", "name": "{Thương hiệu}" },
  "offers": {
    "@type": "Offer",
    "url": "https://example.com/san-pham/",
    "priceCurrency": "VND",
    "price": "1990000",
    "priceValidUntil": "2026-12-31",
    "availability": "https://schema.org/InStock",
    "itemCondition": "https://schema.org/NewCondition",
    "seller": { "@id": "https://example.com/#organization" },
    "shippingDetails": {
      "@type": "OfferShippingDetails",
      "shippingRate": { "@type": "MonetaryAmount", "value": "30000", "currency": "VND" },
      "shippingDestination": { "@type": "DefinedRegion", "addressCountry": "VN" }
    }
  },
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.7",
    "reviewCount": "128",
    "bestRating": "5",
    "worstRating": "1"
  }
}
```

`price` là số thuần — không dấu phẩy, không `₫`, không `.000`. `availability` dùng
đúng URL schema.org: `InStock`, `OutOfStock`, `PreOrder`, `Discontinued`.

`aggregateRating` **phải có review thật hiển thị trên trang**. Đây là dạng schema
bị phạt thủ công nhiều nhất — Google kiểm tay khá thường xuyên.

---

## Video

```json
{
  "@context": "https://schema.org",
  "@type": "VideoObject",
  "name": "{Tiêu đề video}",
  "description": "{Mô tả}",
  "thumbnailUrl": ["https://example.com/thumb-16x9.jpg"],
  "uploadDate": "2026-05-10T09:00:00+07:00",
  "duration": "PT8M45S",
  "contentUrl": "https://example.com/video.mp4",
  "embedUrl": "https://www.youtube.com/embed/{id}",
  "publisher": { "@id": "https://example.com/#organization" }
}
```

---

## Voice search — speakable

Thêm vào node `Article` hoặc `WebPage`:

```json
"speakable": {
  "@type": "SpeakableSpecification",
  "cssSelector": [".answer-summary", "h1"]
}
```

Selector phải trỏ tới nội dung **đọc lên nghe được** — câu ngắn, không có bảng,
không có danh sách dài, không có ký hiệu.

---

## Nối nhiều schema thành một graph

Đúng cách: một khối `@graph`, các node trỏ nhau bằng `@id`.

```json
{
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Organization", "@id": "https://example.com/#organization", "...": "..." },
    { "@type": "WebSite", "@id": "https://example.com/#website",
      "publisher": { "@id": "https://example.com/#organization" } },
    { "@type": "WebPage", "@id": "https://example.com/bai-viet/",
      "isPartOf": { "@id": "https://example.com/#website" },
      "breadcrumb": { "@id": "https://example.com/bai-viet/#breadcrumb" } },
    { "@type": "BreadcrumbList", "@id": "https://example.com/bai-viet/#breadcrumb", "...": "..." },
    { "@type": "BlogPosting", "@id": "https://example.com/bai-viet/#article",
      "mainEntityOfPage": { "@id": "https://example.com/bai-viet/" },
      "author": { "@id": "https://example.com/tac-gia/a/#person" } }
  ]
}
```

Nhiều khối `<script type="application/ld+json">` rời cũng hợp lệ và Google đọc
được, nhưng dùng `@graph` thì quan hệ giữa các thực thể rõ hơn và ít bị khai trùng.

---

## Lỗi hay gặp

| Lỗi | Hệ quả |
|---|---|
| JSON sai cú pháp (thiếu dấu phẩy, dùng nháy đơn) | Google bỏ qua **cả block**, không chỉ field lỗi |
| `price: "1.990.000₫"` | Không parse được — phải là `"1990000"` |
| `datePublished: "15/03/2026"` | Sai định dạng — phải ISO 8601 |
| `aggregateRating` không có review hiển thị | Rủi ro phạt thủ công |
| `FAQPage` mà trang không có FAQ | Vi phạm chính sách |
| `@id` khác nhau giữa các trang cho cùng một Organization | Không nối được graph, mất tín hiệu thực thể |
| Khai `Article` cho trang danh mục | Sai type — danh mục là `CollectionPage` |
| Nhồi mọi type vào một trang | Tín hiệu loãng; Google chọn type nào nó thấy hợp |
| Comment `//` trong JSON | JSON không có comment — parse lỗi |
