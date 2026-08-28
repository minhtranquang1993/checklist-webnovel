# Brief: Checklist Hub — tick shared cho nhân viên

## Vấn đề
File `webnovel-vn-checklist-seo-geo-aio.html` (77 hạng mục, kèm hướng dẫn chi tiết) đang lưu tick
trong `localStorage`. Hệ quả: mỗi nhân viên mở file thấy một tiến độ khác nhau, Minh không biết ai
đã làm gì, xoá cache là mất sạch, và không thể dùng làm bảng theo dõi công việc thật.

## Giải pháp
Repo GitHub Pages `checklist-webnovel`: mỗi checklist là 1 file HTML độc lập, dùng chung một
engine `assets/sync.js` đọc/ghi tick vào Supabase (`checklist_progress`). Một `index.html` liệt kê
mọi checklist kèm % tiến độ đọc trực tiếp từ Supabase.

## MVP Features
- [x] Table `checklist_progress` + RLS cho anon read/insert/update (đã tạo & verify)
- [ ] `assets/sync.js` — engine render checklist + sync Supabase, offline-first
- [ ] `assets/checklist.css` — style dùng chung
- [ ] `assets/config.js` — URL + anon key + registry checklist
- [ ] `webnovel-vn.html` — chuyển từ file gốc, giữ 100% nội dung hướng dẫn
- [ ] `index.html` — hub + % tiến độ từng checklist
- [ ] Hiện "ai tick · lúc nào" trên từng hạng mục
- [ ] Nhập tên 1 lần (localStorage), chưa có tên thì không tick được
- [ ] Tick offline được, badge "chưa sync", tự đẩy khi có mạng
- [ ] Seed 17 hạng mục Minh đã làm xong vào DB (một lần, server-side)
- [ ] `tools/verify.py` — chặn drift giữa registry và số item thật trong HTML
- [ ] `README.md` + `schema.sql` + `.gitignore`

## Hướng kỹ thuật
- **Không SDK**: gọi PostgREST bằng `fetch` thuần. Bớt 1 dependency, file nhẹ, không cần build.
- **Upsert** `POST ?on_conflict=checklist_id,item_id` + `Prefer: resolution=merge-duplicates`.
- **`updated_at` do trigger Postgres đặt**, client không ghi đè được → thứ tự thời gian đáng tin.
- **Không cho anon DELETE** → giữ audit trail; bỏ tick = `done=false`, vẫn biết ai bỏ.
- **Seed server-side một lần**, KHÔNG seed ở client: DB đã shared, client seed sẽ ghi lại preset
  mỗi lần có browser mới → sai.
- **Merge rule**: item đang nằm trong queue chờ sync thì local thắng; còn lại server thắng.
- **Refetch** khi tab được focus lại + nút "Tải lại", không dùng websocket (đơn giản, đủ dùng).

## Pitfall đã nhận diện
- `anon key` nhúng trong HTML public là đúng thiết kế (RLS chặn), nhưng **`service_role` và
  `SUPABASE_ACCESS_TOKEN` tuyệt đối không được vào repo** → `.gitignore` + không hardcode.
- Trang public: ai có link đều tick được. Đã chốt: chấp nhận, đổi lấy việc không phải quản account.
- Tách `sync.js` → mở bằng `file://` sẽ bị CORS chặn. Phải chạy qua GitHub Pages hoặc local server;
  README phải ghi rõ.

## Scope & Constraints
- Đối tượng: nhân viên nội bộ, không cần login.
- Không đổi một chữ nào trong nội dung 77 hạng mục — chỉ thay lớp lưu trữ.
- Deploy: GitHub Pages, repo `minhtranquang1993/checklist-webnovel` (public, đang rỗng).
