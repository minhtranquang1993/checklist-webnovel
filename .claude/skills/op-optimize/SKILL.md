---
name: op-optimize
description: >-
  Sinh file HTML checklist tối ưu on-page SEO/GEO/AIO cho một URL hoặc domain, dựa trên
  SỐ ĐO THẬT (curl 18 user-agent, TTFB, nén, robots/llms/sitemap; parser HTML đo
  title/heading/schema/link/ảnh/render-blocking). Khác audit-onpage ở chỗ file xuất ra
  TỰ ĐỦ: double-click là xem và tick được ngay ở máy (CSS + renderer nhúng trong file),
  đồng thời upload lên hub checklist-webnovel được để cả team tick chung. Có cửa gác
  check-out.js chạy trước khi upload: so byte với sanitize thật của hub, đối chiếu mã
  checklist và tick đã có trên DB, nên không bao giờ upload rồi mới biết bị từ chối.
  Trigger: "/op-optimize {url|domain}", "op-optimize", "checklist onpage cho site",
  "làm checklist tối ưu onpage", "audit onpage xuất file upload được".
---

# Skill: op-optimize

Nhận một URL/domain, đo thật, rồi xuất **một file HTML** dùng được ở hai chỗ:

| Mở trực tiếp ở máy (`file://`) | Upload lên hub |
|---|---|
| Double-click là thấy đủ nhóm/hạng mục, mở/thu từng hạng mục, tick được, in PDF được | Cả team tick chung, tiến độ lưu trên Supabase |
| Tick lưu localStorage (`op-local-{id}`), không đồng bộ ai | Tick lưu DB, hiện tên người tick |
| Dùng để xem trước, gửi khách, in | Dùng để làm việc thật |

Cùng một file, không phải hai bản. Cơ chế và lý do: `references/output-format.md`.

## Usage

```
/op-optimize https://example.com/
/op-optimize example.com
/op-optimize https://example.com/ pages=5
/op-optimize https://example.com/bai-viet/ keyword="mổ cận lasik"
/op-optimize example.com quick
/op-optimize example.com id=op-example-com-abcd     # ghi tiếp lên checklist đã có
```

| Tham số | Mặc định | Mô tả |
|---|---|---|
| url/domain | — | Bắt buộc. Không có scheme → thêm `https://` |
| `pages=N` | 3 | Số **loại trang** lấy mẫu (trang chủ + N-1 loại khác) |
| `keyword=` | tự suy | Keyword chính để đối chiếu title/H1. Không truyền → suy từ title + top bigram |
| `id=` | tự sinh | Mã checklist. Dùng khi audit lại một site đã có checklist trên hub |
| `quick` | tắt | Bỏ bước 5 (đối thủ) và WebSearch. Nhanh ~3× |
| `out=` | `~/Downloads/onpage/{id}-{ngày}.html` | Đường dẫn file xuất ra |

## Luật bất di bất dịch

1. **Không đo được thì không viết.** Mỗi hạng mục phải có ít nhất một số đo thật, hoặc ghi
   rõ `chưa đo được — lý do`. Không có câu nào dạng "có thể trang đang chậm".
2. **Ghi cả số đo lẫn lệnh verify**, và lệnh đó phải **tự chạy được trên máy người đọc** —
   `curl`/`python3 -` thuần, KHÔNG trỏ tới script của skill (người nhận file không có nó).
3. **Chỉ GET/HEAD trên site đích.** Không POST, không thử đăng nhập, không dò admin path.
4. **Không POST lên hub.** Skill dựng file và kiểm file; bấm Upload là việc của người dùng.
5. **`item.id` lấy từ `references/check-catalogue.md`**, không tự đặt theo thứ tự phát hiện.
   Id là khoá gắn tick trong DB: đổi id = mất tick của hạng mục đó.
6. **Không bao giờ bỏ hạng mục đã có trên hub.** Việc đã làm xong thì giữ hạng mục, đổi `w`
   thành `ĐÃ XONG — {số đo mới}` và cập nhật `b`. Bỏ hạng mục đã tick là DB chặn upload.

---

## WORKFLOW — 9 bước

```
0. Tìm repo + script đo      → không có thì DỪNG, không đo gì cả
1. Chuẩn hoá input + PRE-FLIGHT → hỏi DB trước khi mất 5 phút đo
2. Đo tầng HTTP              → probe.sh
3. Đo on-page từng loại trang → onpage.py
4. Đối chiếu render          → WebFetch (có JS) vs onpage.py (không JS)
5. Đối chiếu đối thủ         → bỏ nếu `quick`
6. Chấm điểm 8 trục          → mỗi điểm trỏ về một số đo
7. Viết audit.json → build-file.js
8. check-out.js → sửa tới khi xanh → bàn giao
```

### BƯỚC 0 — Tìm repo và script đo

```bash
REPO=""
for d in "$PWD" "$HOME/Downloads/checklist-webnovel" "$HOME/checklist-webnovel"; do
  [ -f "$d/assets/parse-def.js" ] && [ -f "$d/tools/test/dom-shim.js" ] && REPO="$d" && break
done
SKILL="$REPO/.claude/skills/op-optimize"
SCRIPTS=""
for d in "$REPO/.claude/skills/audit-onpage/scripts" "$HOME/.claude/skills/audit-onpage/scripts"; do
  [ -f "$d/onpage.py" ] && SCRIPTS="$d" && break
done
echo "REPO=$REPO"; echo "SCRIPTS=$SCRIPTS"
```

`REPO` rỗng → **dừng**: không có `assets/sanitize.js` thì không kiểm được file, mà file không
kiểm được thì đừng sinh. `SCRIPTS` rỗng → **dừng**: nói rõ cần
`~/.claude/skills/audit-onpage/scripts/`, đừng tự viết lại bộ đo.

### BƯỚC 1 — Chuẩn hoá input + pre-flight

Tách `ORIGIN` (`https://example.com`) và `URL` (giữ nguyên path người dùng đưa). Domain trần
→ `URL = ORIGIN + "/"`, và đây là audit **cấp site**.

Mã checklist — **giữ nguyên `www.`**, vì `www.a.com` và `a.com` có thể là hai site khác nhau:

```
host = "www.example.co.uk"  →  slug = "www-example-co-uk"
id   = "op-" + slug(≤32) + "-" + hash4(ORIGIN)
     = "op-www-example-co-uk-3f7a"
```

`hash4` là 4 ký tự base36 đầu của djb2 hash trên `ORIGIN`. Tiền tố `op-` để **không đụng
vào** mã của checklist dạng file trong repo (`webnovel-vn` là một mã như vậy, và
`upload_checklist_def` raise 23505 nếu def upload đè lên nó).

Rồi hỏi DB **trước khi đo** (3 truy vấn read-only, dùng anon key trong `assets/config.js`):

```bash
SB=$(grep -o "https://[a-z0-9]*\.supabase\.co" "$REPO/assets/config.js" | head -1)
KEY=$(grep -o "eyJ[A-Za-z0-9._-]*" "$REPO/assets/config.js" | head -1)
curl -sS "$SB/rest/v1/checklists?id=eq.$ID&select=id,kind,name,total" -H "apikey: $KEY"
```

| Kết quả | Làm gì |
|---|---|
| rỗng | Checklist mới. Đi tiếp |
| `kind:"file"` | **Dừng** — mã đang thuộc một file trong repo. Đổi `id=` rồi chạy lại |
| `kind:"def"` | Audit lần 2+. Tải `checklist_defs` và `checklist_progress`, đọc dấu `Audit host:` trong `note`. Host khớp → **bắt buộc** giữ lại toàn bộ id cũ (luật 6). Host lệch → dừng, hỏi người dùng |

Chi tiết truy vấn và cách xử lý: `references/output-format.md` mục "Audit lần thứ hai".

### BƯỚC 2 — Đo tầng HTTP

```bash
bash "$SCRIPTS/probe.sh" "$URL" 2>&1 | tee /tmp/probe-$ID.txt
```

2–5 phút (18 user-agent × 3 request + sitemap). Đọc kết quả bot theo bảng ở
`{SCRIPTS}/../references/geo-aio.md` — hiểu sai loại bot là hiểu sai cả chiến lược:
`OAI-SearchBot`/`Claude-SearchBot`/`PerplexityBot` **có trả link** (chặn = mất traffic),
`GPTBot`/`ClaudeBot`/`CCBot` là training (chặn là quyết định kinh doanh, không mất traffic),
`Google-Extended`/`Applebot-Extended` chỉ là **cờ opt-out** (`Allow` cho chúng là vô nghĩa).

### BƯỚC 3 — Đo on-page từng loại trang

Chọn mẫu **theo template, không theo số lượng** — mỗi template render bằng code khác nhau nên
lỗi khác nhau; đo 5 trang cùng template chỉ tốn thời gian. Ưu tiên: trang chủ (bắt buộc) →
danh mục → **trang chi tiết** (quan trọng nhất, long-tail vào đây) → trang tầng sâu →
trang tin cậy (giới thiệu/liên hệ, cho E-E-A-T).

```bash
for U in "$ORIGIN/" "$ORIGIN/danh-muc/" "$ORIGIN/bai-viet-cu-the/"; do
  python3 "$SCRIPTS/onpage.py" "$U"
done 2>&1 | tee /tmp/onpage-$ID.txt
python3 "$SCRIPTS/onpage.py" "$URL" --json > /tmp/onpage-$ID.json
```

Script tự sinh cảnh báo có gán mức P0–P3. **Đừng chép nguyên vào file** — nó là điểm khởi đầu:
gộp cảnh báo trùng giữa các trang thành một hạng mục ("thiếu OG trên **cả 4** loại trang" mạnh
hơn 4 hạng mục rời), nâng/hạ mức theo ngữ cảnh, bỏ cái không áp dụng, và **thêm** thứ script
không đo được (chất lượng nội dung, cannibalization, intent có khớp không).

### BƯỚC 4 — Đối chiếu render

`onpage.py` không chạy JS, `WebFetch` có. So hai bên — đây là bước hay bị bỏ nhất và cũng là
chỗ ra phát hiện đắt nhất:

| Kết quả | Kết luận |
|---|---|
| Số từ xấp xỉ | Server-side render — không có việc gì phải làm |
| `onpage.py` < 300 từ mà WebFetch thấy đủ | **P0** — nội dung chỉ có sau JS. Googlebot phải chờ render queue (ngày–tuần), phần lớn bot AI **không bao giờ** thấy |
| Cả hai đều ít | Thin content thật — vấn đề nội dung |
| `onpage.py` thấy heading mà WebFetch không | JS xoá nội dung sau load, hoặc WebFetch bị chặn |

### BƯỚC 5 — Đối chiếu đối thủ (bỏ nếu `quick`)

`WebSearch("{keyword}")` + `WebSearch("{keyword} là gì")` → lấy 3 URL top **không phải site
đích** → `onpage.py` từng URL → lập bảng so: số từ thân bài, số H2/H3, heading câu hỏi, số liệu
cụ thể, schema `@type`, internal link, TTFB.

Bảng này biến "nên viết dài hơn" thành "đối thủ trung bình 2.400 từ, trang anh 890 từ — thiếu
1.500 từ, tập trung vào 6 H2 mà cả 3 đối thủ đều có mà anh không có".

### BƯỚC 6 — Chấm điểm 8 trục

8 trục, mỗi trục 0–10, **mỗi điểm phải trỏ về được số đo cụ thể** ở bước 2–5: Technical SEO ·
On-page SEO · Structured Data · Crawlability · GEO/AIO · Content · E-E-A-T · Performance.

Ghi chú mỗi trục phải **nêu con số** và **không được có dấu `"`** (`sync.js:184` render nó vào
`title="…"` mà `esc()` không escape dấu ngoặc kép — attribute sẽ đóng sớm):

```
"TTFB 0,16s, nén Brotli 83%, 0 script chặn render — trừ điểm vì 76KB CSS nội tuyến"
```

Thang điểm từng trục: `{SCRIPTS}/../SKILL.md` bước 6 (bảng 4 mức cho cả 8 trục).

### BƯỚC 7 — Viết `audit.json` rồi dựng file

Agent chỉ viết **nội dung**; cấu trúc file do script lo (đó là chỗ dễ sai nhất và cũng là chỗ
máy làm đúng hơn người).

```bash
node "$SKILL/scripts/build-file.js" /tmp/audit-$ID.json --out="$OUT"
```

Khuôn `audit.json`, cách viết `b:` theo 5 khối, và toàn bộ ràng buộc:
**`references/output-format.md`** (đọc trước khi viết dòng JSON đầu tiên).
Danh sách id hạng mục ổn định: **`references/check-catalogue.md`**.

Phân bổ hạng mục — tổng **60–90**. Dưới 50 là audit chưa đủ sâu; trên 120 thì không ai làm hết:

| Nhóm | `id` | `tag` | Số hạng mục | Nội dung |
|---|---|---|---|---|
| P0 | `P0` | `t-p0` | 3–8 | Chỉ thứ đang **chặn hẳn** index/traffic. Hơn 8 là đã lạm dụng P0 |
| P1 | `P1` | `t-p1` | 10–18 | Lỗi lớn, làm trong 2 tuần |
| P2 | `P2` | `t-p2` | 15–25 | Quan trọng, không gấp |
| P3 | `P3` | `t-p3` | 8–15 | Nâng cao, làm sau khi P0–P2 xong |
| GEO | `GEO` | `t-geo` | 12–20 | Bot AI, llms.txt, nội dung dễ trích dẫn, FAQ schema |
| VFY | `VFY` | `t-bl` | 5–10 | Bộ lệnh đo lại sau khi sửa |

Nhóm nào không có hạng mục thì **bỏ hẳn nhóm đó** khỏi `sections` — `validateDef` của hub NÉM
với nhóm rỗng ("Nhóm X không có hạng mục nào"), tức là file không upload được. Nhóm VFY luôn
có, vì dấu `Audit host:` gắn ở đó.

### BƯỚC 8 — Cửa gác rồi bàn giao

```bash
node "$SKILL/scripts/check-out.js" "$OUT"
```

Sửa tới khi xanh. Cửa gác kiểm 11 nhóm luật, trong đó 2 nhóm cần mạng (mã đã thuộc file trong
repo chưa; bản mới có bỏ hạng mục đã tick không) — hai lỗi duy nhất có thể làm **mất tick**.

Báo lại cho người dùng: đường dẫn file · số hạng mục theo nhóm · 3 phát hiện nặng nhất kèm số
đo · tên hiển thị nên dán khi upload · và đúng ba bước:

1. Double-click file để xem trước (tick ở đây chỉ lưu trong máy).
2. Mở `index.html` của repo → **⬆ Upload file HTML** → chọn file → dán tên hiển thị.
3. Sau khi upload: `node "$SKILL/scripts/check-out.js" "$OUT" --after-upload` — so byte bản
   trên DB với file. Diff rỗng = bản cả team thấy giống y bản đã xem trước.

---

## Reference

| File | Khi nào đọc |
|---|---|
| `references/output-format.md` | Bước 7 — khuôn `audit.json`, ràng buộc, cách viết `b:`, audit lần 2 |
| `references/check-catalogue.md` | Bước 7 — lấy `item.id` ổn định theo từng phép kiểm |
| `{SCRIPTS}/../references/geo-aio.md` | Bước 2 khi bot AI ≠ 200; bước 6 khi chấm GEO |
| `{SCRIPTS}/../references/schema-recipes.md` | Viết hạng mục structured data |
| `{SCRIPTS}/../references/onpage-checklist.md` | Danh mục đầy đủ những gì cần kiểm |

## Script

| Script | Chạy | Vai |
|---|---|---|
| `scripts/build-file.js` | `node build-file.js audit.json [--out=…]` | Dựng file HTML từ JSON. Chặn 12 loại lỗi cấu trúc trước khi ghi |
| `scripts/check-out.js` | `node check-out.js file.html [--offline\|--after-upload]` | Cửa gác 11 nhóm luật, dùng chính `parse-def.js`/`sanitize.js` của repo |
| `scripts/contract.js` | (module) | Tìm repo, nạp luật hub với `dom-shim`, các phép quét ký tự |
| `templates/preview.css` · `templates/render.js` | (nhúng vào output) | CSS + renderer của file tự đủ |
| `tests/test.js` | `node tests/test.js` | 37 test: đường upload, chia esc/thô, 16 fixture lỗi |

`probe.sh` và `onpage.py` **không** có bản copy trong skill này — dùng bản của `audit-onpage`
(xem bước 0). Một bộ đo, một chỗ sửa.

