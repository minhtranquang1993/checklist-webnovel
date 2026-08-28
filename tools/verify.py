#!/usr/bin/env python3
"""Chặn drift giữa assets/config.js và các file checklist HTML.

Kiểm tra:
  1. Mỗi entry trong CHECKLISTS có file HTML tồn tại.
  2. `total` trong config khớp số hạng mục thật đếm được trong HTML.
  3. `CHECKLIST_ID` khai trong HTML khớp `id` trong config.
  4. Không có item_id trùng nhau trong cùng một file.
  5. Không có file checklist nào bị bỏ quên (có HTML mà không có trong config).
  6. Item id là append-only: không hạng mục nào bị xoá hay đổi tên so với
     tools/item-ids.json. Đổi id trong HTML là mất tick của hạng mục đó trong DB.

Chạy: python3 tools/verify.py
       python3 tools/verify.py --update-snapshot   (sau khi CỐ Ý thêm hạng mục mới)
Exit 0 = mọi thứ khớp. Exit 1 = có lệch, in rõ lệch ở đâu.
"""

import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / 'assets' / 'config.js'
SNAPSHOT = Path(__file__).resolve().parent / 'item-ids.json'

# Không phải file checklist, bỏ qua khi soát file bị bỏ quên.
NOT_CHECKLIST = {'index.html'}

ITEM_RE = re.compile(r'\{id:"([a-z0-9-]+)"')
CHECKLIST_ID_RE = re.compile(r"""const\s+CHECKLIST_ID\s*=\s*['"]([^'"]+)['"]""")
ENTRY_RE = re.compile(r'\{(.*?)\}', re.S)


def parse_config(text):
    """Đọc mảng CHECKLISTS trong config.js mà không cần chạy JS."""
    start = text.find('const CHECKLISTS')
    if start == -1:
        sys.exit('FAIL: không tìm thấy `const CHECKLISTS` trong assets/config.js')
    body = text[text.index('[', start): text.index('];', start)]

    entries = []
    for raw in ENTRY_RE.findall(body):
        entry = {}
        for key in ('id', 'file', 'name'):
            m = re.search(rf"""{key}\s*:\s*['"]([^'"]*)['"]""", raw)
            if m:
                entry[key] = m.group(1)
        m = re.search(r'total\s*:\s*(\d+)', raw)
        if m:
            entry['total'] = int(m.group(1))
        if entry:
            entries.append(entry)
    if not entries:
        sys.exit('FAIL: CHECKLISTS rỗng — không có checklist nào để kiểm tra')
    return entries


def main():
    update = '--update-snapshot' in sys.argv[1:]
    unknown = [a for a in sys.argv[1:] if a != '--update-snapshot']
    if unknown:
        sys.exit(f'FAIL: tham số không hiểu: {unknown}. Chỉ hỗ trợ --update-snapshot')

    if not CONFIG.exists():
        sys.exit(f'FAIL: không có {CONFIG.relative_to(ROOT)}')

    entries = parse_config(CONFIG.read_text(encoding='utf-8'))
    errors = []
    listed_files = set()
    seen_ids = {}
    dropped = {}

    if SNAPSHOT.exists():
        try:
            snapshot = json.loads(SNAPSHOT.read_text(encoding='utf-8'))
        except json.JSONDecodeError as exc:
            sys.exit(f'FAIL: {SNAPSHOT.name} không đọc được: {exc}')
    elif update:
        snapshot = {}
    else:
        sys.exit(
            f'FAIL: không có {SNAPSHOT.name} — chạy '
            '`python3 tools/verify.py --update-snapshot` để tạo lần đầu'
        )

    for e in entries:
        for key in ('id', 'file', 'total'):
            if key not in e:
                errors.append(f"CHECKLISTS thiếu `{key}`: {e}")
        if 'file' not in e or 'id' not in e or 'total' not in e:
            continue

        listed_files.add(e['file'])
        path = ROOT / e['file']
        if not path.exists():
            errors.append(f"`{e['id']}`: không có file {e['file']}")
            continue

        html = path.read_text(encoding='utf-8')

        ids = ITEM_RE.findall(html)
        seen_ids[e['id']] = ids
        if len(ids) != e['total']:
            errors.append(
                f"`{e['id']}`: config ghi total={e['total']} nhưng {e['file']} có {len(ids)} hạng mục"
            )

        dupes = [k for k, v in Counter(ids).items() if v > 1]
        if dupes:
            errors.append(f"`{e['id']}`: item_id trùng trong {e['file']}: {sorted(dupes)}")

        m = CHECKLIST_ID_RE.search(html)
        if not m:
            errors.append(f"`{e['id']}`: {e['file']} không khai `const CHECKLIST_ID`")
        elif m.group(1) != e['id']:
            errors.append(
                f"{e['file']} khai CHECKLIST_ID='{m.group(1)}' nhưng config ghi id='{e['id']}' "
                "→ tick sẽ ghi vào sai chỗ trong DB"
            )

        # Item id chỉ được thêm. Xoá hoặc đổi tên là mất tick trong DB.
        # `--update-snapshot` là đường thoát tường minh cho việc đổi có chủ đích,
        # nên khi có cờ đó thì bỏ qua đúng phép kiểm này — các phép kiểm khác vẫn chặn.
        gone = [i for i in snapshot.get(e['id'], []) if i not in set(ids)]
        if gone and not update:
            errors.append(
                f"`{e['id']}`: item_id đã biến mất khỏi {e['file']}: {gone} "
                "→ tick của các hạng mục này trong DB sẽ thành mồ côi. "
                "Nếu cố ý, chạy lại với --update-snapshot"
            )
        elif gone:
            dropped[e['id']] = gone

    for path in sorted(ROOT.glob('*.html')):
        if path.name in NOT_CHECKLIST or path.name in listed_files:
            continue
        if CHECKLIST_ID_RE.search(path.read_text(encoding='utf-8')):
            errors.append(
                f"{path.name} là file checklist nhưng chưa có trong CHECKLISTS "
                "→ sẽ không hiện ở trang index"
            )

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

    print(f'OK — {len(entries)} checklist, mọi con số khớp:')
    for e in entries:
        print(f"  • {e['id']:<16} {e['file']:<24} {e['total']} hạng mục")
    return 0


if __name__ == '__main__':
    sys.exit(main())
