#!/usr/bin/env python3
"""Kiểm tra các file checklist HTML trong repo.

Danh sách checklist nằm trên Supabase (bảng `checklists`), không nằm trong repo,
nên script này không đối chiếu với config nữa. Nó kiểm những thứ chỉ đọc file mới biết:

  1. Mỗi file .html ở gốc repo (trừ các file trong NOT_CHECKLIST) phải khai
     `const CHECKLIST_ID`.
  2. `CHECKLIST_ID` phải đúng định dạng và không trùng giữa các file — hai file cùng
     mã sẽ ghi tick chồng lên nhau trong DB.
  3. Không có item_id trùng nhau trong cùng một file.
  4. item_id phải khớp định dạng DB chấp nhận (`^[a-z0-9][a-z0-9-]{0,39}$`), nếu không
     `tick_item` sẽ từ chối và nhân viên không tick được hạng mục đó.
  5. Item id là append-only: không hạng mục nào bị xoá hay đổi tên so với
     tools/item-ids.json. Đổi id là mất tick của hạng mục đó trong DB.

Script này chỉ gác checklist dạng **file** (nội dung nằm trong repo). Checklist dạng
**def** (upload từ trang hub, nội dung nằm trong bảng `checklist_defs`) không có file
trong repo để kiểm — nó được gác bởi `upload_checklist_def()` trong schema.sql, và
chặt hơn: hàm đó từ chối bản upload nào làm mất tick của hạng mục ĐÃ ĐƯỢC TICK.

Số hạng mục không cần khai ở đâu cả — trang checklist tự báo lại cho DB khi mở.

Chạy: python3 tools/verify.py
       python3 tools/verify.py --update-snapshot   (sau khi CỐ Ý thêm/đổi hạng mục)
Exit 0 = mọi thứ khớp. Exit 1 = có lệch, in rõ lệch ở đâu.
"""

import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SNAPSHOT = Path(__file__).resolve().parent / 'item-ids.json'

# Không phải file checklist.
#   index.html     — trang hub
#   checklist.html — renderer chung cho checklist dạng def; nó ĐỌC CHECKLIST_ID từ
#                    DB lúc chạy nên cố tình không khai biến đó trong file.
NOT_CHECKLIST = {'index.html', 'checklist.html'}

# Hạng mục và section trông giống nhau (`{id:"..."`), khác ở chỗ section có `tag:`
# ngay sau id. Loại section ra bằng lookahead, thay vì dựa vào khoảng trắng —
# file mới viết sát nhau sẽ làm cách kia đếm section thành hạng mục.
ITEM_RE = re.compile(r'\{\s*id:"([^"]+)"(?!\s*,\s*tag:")')
CHECKLIST_ID_RE = re.compile(r"""const\s+CHECKLIST_ID\s*=\s*['"]([^'"]+)['"]""")
ID_FMT = re.compile(r'^[a-z0-9][a-z0-9-]{0,39}$')


def load_snapshot(update):
    if SNAPSHOT.exists():
        try:
            return json.loads(SNAPSHOT.read_text(encoding='utf-8'))
        except json.JSONDecodeError as exc:
            sys.exit(f'FAIL: {SNAPSHOT.name} không đọc được: {exc}')
    if update:
        return {}
    sys.exit(
        f'FAIL: không có {SNAPSHOT.name} — chạy '
        '`python3 tools/verify.py --update-snapshot` để tạo lần đầu'
    )


def main():
    update = '--update-snapshot' in sys.argv[1:]
    unknown = [a for a in sys.argv[1:] if a != '--update-snapshot']
    if unknown:
        sys.exit(f'FAIL: tham số không hiểu: {unknown}. Chỉ hỗ trợ --update-snapshot')

    snapshot = load_snapshot(update)
    errors = []
    seen_ids = {}
    dropped = {}
    by_cid = {}

    files = [p for p in sorted(ROOT.glob('*.html')) if p.name not in NOT_CHECKLIST]
    if not files:
        sys.exit('FAIL: không có file checklist nào ở gốc repo')

    for path in files:
        html = path.read_text(encoding='utf-8')

        m = CHECKLIST_ID_RE.search(html)
        if not m:
            errors.append(
                f"{path.name} không khai `const CHECKLIST_ID` "
                "→ không tick được. Nếu đây không phải file checklist, đưa vào NOT_CHECKLIST."
            )
            continue
        cid = m.group(1)

        if not ID_FMT.match(cid):
            errors.append(
                f"{path.name}: CHECKLIST_ID='{cid}' sai định dạng "
                "(chỉ chữ thường, số, gạch ngang, tối đa 40 ký tự) → DB sẽ từ chối"
            )

        if cid in by_cid:
            errors.append(
                f"CHECKLIST_ID='{cid}' dùng ở cả {by_cid[cid]} và {path.name} "
                "→ tick của hai file sẽ ghi chồng lên nhau trong DB"
            )
        else:
            by_cid[cid] = path.name

        ids = ITEM_RE.findall(html)
        if not ids:
            errors.append(f"{path.name}: không tìm thấy hạng mục nào")
            continue
        seen_ids[cid] = ids

        dupes = sorted(k for k, v in Counter(ids).items() if v > 1)
        if dupes:
            errors.append(f"{path.name}: item_id trùng nhau: {dupes}")

        bad = sorted({i for i in ids if not ID_FMT.match(i)})
        if bad:
            errors.append(
                f"{path.name}: item_id sai định dạng: {bad} "
                "→ tick_item sẽ từ chối, nhân viên không tick được các hạng mục này"
            )

        gone = [i for i in snapshot.get(cid, []) if i not in set(ids)]
        if gone and not update:
            errors.append(
                f"{path.name}: item_id đã biến mất: {gone} "
                "→ tick của các hạng mục này trong DB sẽ thành mồ côi. "
                "Nếu cố ý, chạy lại với --update-snapshot"
            )
        elif gone:
            dropped[cid] = gone

    if errors:
        print('FAIL — có lệch:')
        for err in errors:
            print('  •', err)
        return 1

    if update:
        merged = dict(snapshot)
        merged.update(seen_ids)
        SNAPSHOT.write_text(
            json.dumps(merged, indent=2, ensure_ascii=False) + '\n', encoding='utf-8'
        )
        print(f'Đã cập nhật {SNAPSHOT.name}.')
        for cid, gone in dropped.items():
            print(
                f'  ⚠ `{cid}`: đã bỏ {gone} khỏi snapshot. '
                'Tick của các hạng mục này trong DB giờ là mồ côi — dọn bằng SQL nếu cần.'
            )

    print(f'OK — {len(seen_ids)} checklist:')
    for cid, ids in seen_ids.items():
        print(f'  • {cid:<16} {by_cid[cid]:<24} {len(ids)} hạng mục')
    return 0


if __name__ == '__main__':
    sys.exit(main())
