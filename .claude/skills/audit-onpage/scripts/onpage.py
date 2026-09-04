#!/usr/bin/env python3
"""onpage.py — bóc các yếu tố on-page từ HTML thật của một URL.

    python3 onpage.py https://example.com/bai-viet/
    python3 onpage.py https://example.com/ --json      # cho máy đọc
    python3 onpage.py trang.html --url https://…       # phân tích file đã tải

Chỉ dùng thư viện chuẩn — không cần pip install gì.

KHÔNG chạy JavaScript, và đó là chủ ý: Googlebot ở lượt crawl đầu cùng phần lớn
bot AI cũng không chạy JS. Cái script này thấy = cái bot thấy ở lượt đầu. Muốn
biết JS bù thêm gì thì so với WebFetch (có render); chỗ chênh nhau chính là nội
dung phụ thuộc JS, và đó là một phát hiện đáng ghi vào báo cáo.
"""

import argparse
import gzip
import json
import re
import sys
import unicodedata
import urllib.error
import urllib.request
import zlib
from collections import Counter
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse

UA = ('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/124.0 Safari/537.36')

# Ngưỡng lấy theo chỗ SERP thực sự cắt hiển thị (đo pixel, quy đổi ra ký tự).
TITLE_MIN, TITLE_MAX = 30, 60
DESC_MIN, DESC_MAX = 70, 160

STOP_VI = set("""và của có là được cho các những một với trong khi không này đó
từ đến về như tại theo trên sau ra vào nên nếu thì mà cũng đã sẽ bị bởi hoặc
nhưng vì do rất hơn nhất nữa lại còn chỉ đang cùng qua ai gì nào sao đâu tôi
bạn anh chị em họ mình chúng ta người ngày năm""".split())
STOP_EN = set("""the a an and or but if of to in on at for with from by as is
are was were be been being this that these those it its you your we our they
their he she his her i me my not no so than then too very can will just do
does did have has had how what when where which who whom why""".split())
STOPWORDS = STOP_VI | STOP_EN


# ------------------------------------------------------------------ tải trang
def fetch(url):
    """Trả (html, info). Giải nén tay vì urllib không tự làm."""
    req = urllib.request.Request(url, headers={
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate',
        'Accept-Language': 'vi,en;q=0.8',
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read()
            enc = (r.headers.get('Content-Encoding') or '').lower()
            info = {
                'status': r.status,
                'final_url': r.geturl(),
                'content_type': r.headers.get('Content-Type', ''),
                'bytes_wire': len(raw),
                'x_robots_tag': r.headers.get('X-Robots-Tag', ''),
                'link_header': r.headers.get('Link', ''),
            }
    except urllib.error.HTTPError as e:
        raw, enc = e.read(), (e.headers.get('Content-Encoding') or '').lower()
        info = {'status': e.code, 'final_url': url,
                'content_type': e.headers.get('Content-Type', ''),
                'bytes_wire': len(raw),
                'x_robots_tag': e.headers.get('X-Robots-Tag', ''),
                'link_header': e.headers.get('Link', '')}
    except Exception as e:
        return None, {'status': 0, 'final_url': url, 'error': f'{type(e).__name__}: {e}'}

    if enc == 'gzip':
        try:
            raw = gzip.decompress(raw)
        except Exception:
            pass
    elif enc == 'deflate':
        try:
            raw = zlib.decompress(raw, -zlib.MAX_WBITS)
        except Exception:
            pass

    # Charset: header trước, rồi <meta charset>, cuối cùng đoán utf-8.
    m = re.search(r'charset=([\w-]+)', info.get('content_type', ''), re.I)
    charset = m.group(1) if m else None
    if not charset:
        m = re.search(rb'<meta[^>]+charset=["\']?([\w-]+)', raw[:4096], re.I)
        charset = m.group(1).decode('ascii', 'ignore') if m else 'utf-8'
    info['bytes_html'] = len(raw)
    try:
        return raw.decode(charset, errors='replace'), info
    except LookupError:
        return raw.decode('utf-8', errors='replace'), info

# --------------------------------------------------------- bóc text nhìn thấy
class Visible(HTMLParser):
    """Gom text người đọc thấy + đếm cấu trúc. Bỏ script/style và tách riêng
    nav/header/footer/aside để word count không bị menu và chân trang làm phồng."""

    SKIP = {'script', 'style', 'noscript', 'template', 'svg', 'iframe', 'form'}
    CHROME = {'nav', 'header', 'footer', 'aside'}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.depth_skip = 0
        self.depth_chrome = 0
        self.parts = []            # text trong phần thân
        self.chrome_parts = []     # text trong nav/header/footer/aside
        self.headings = []         # [(level, text)]
        self.cur_h = None
        self.paragraphs = []       # số từ của mỗi <p>
        self.cur_p = None
        self.lists = 0
        self.tables = 0
        self.has_main = False

    def handle_starttag(self, tag, attrs):
        if tag in self.SKIP:
            self.depth_skip += 1
            return
        if tag in self.CHROME:
            self.depth_chrome += 1
        if tag == 'main' or dict(attrs).get('role') == 'main':
            self.has_main = True
        if re.fullmatch(r'h[1-6]', tag):
            self.cur_h = [int(tag[1]), []]
        elif tag == 'p':
            self.cur_p = []
        elif tag in ('ul', 'ol'):
            self.lists += 1
        elif tag == 'table':
            self.tables += 1

    def handle_endtag(self, tag):
        if tag in self.SKIP:
            self.depth_skip = max(0, self.depth_skip - 1)
            return
        if tag in self.CHROME:
            self.depth_chrome = max(0, self.depth_chrome - 1)
        if re.fullmatch(r'h[1-6]', tag) and self.cur_h:
            txt = re.sub(r'\s+', ' ', ''.join(self.cur_h[1])).strip()
            if txt:
                self.headings.append((self.cur_h[0], txt))
            self.cur_h = None
        elif tag == 'p' and self.cur_p is not None:
            txt = re.sub(r'\s+', ' ', ''.join(self.cur_p)).strip()
            if txt:
                self.paragraphs.append(len(txt.split()))
            self.cur_p = None

    def handle_data(self, data):
        if self.depth_skip:
            return
        if self.cur_h is not None:
            self.cur_h[1].append(data)
        if self.cur_p is not None:
            self.cur_p.append(data)
        (self.chrome_parts if self.depth_chrome else self.parts).append(data)

    def body_text(self):
        return re.sub(r'\s+', ' ', ''.join(self.parts)).strip()


def words(text):
    text = unicodedata.normalize('NFC', text.lower())
    return [w for w in re.findall(r'[0-9a-zà-ỹăâêôơưđ]+', text) if len(w) > 1]


def ngrams(ws, n):
    return [' '.join(ws[i:i + n]) for i in range(len(ws) - n + 1)]

# ------------------------------------------------------------------- phân tích
def analyze(html, url, info):
    low = html.lower()
    i = low.find('</head>')
    head = html[:i] if i > 0 else html[:120000]
    out = {'url': url, 'http': info}

    def attr(pat, src=head):
        m = re.search(pat, src, re.I | re.S)
        return re.sub(r'\s+', ' ', m.group(1)).strip() if m else None

    # ---------------- meta
    title = attr(r'<title[^>]*>(.*?)</title>')
    desc = (attr(r'<meta[^>]+name=["\']?description["\']?[^>]+content=["\'](.*?)["\']')
            or attr(r'<meta[^>]+content=["\'](.*?)["\'][^>]+name=["\']?description'))
    canon = (attr(r'<link[^>]+rel=["\']?canonical["\']?[^>]+href=["\'](.*?)["\']')
             or attr(r'<link[^>]+href=["\'](.*?)["\'][^>]+rel=["\']?canonical'))
    robots = attr(r'<meta[^>]+name=["\']?robots["\']?[^>]+content=["\'](.*?)["\']')
    viewport = attr(r'<meta[^>]+name=["\']?viewport["\']?[^>]+content=["\'](.*?)["\']')
    lang = attr(r'<html[^>]+lang=["\']?([\w-]+)', html[:2000])
    final = info.get('final_url') or url

    out['meta'] = {
        'title': title, 'title_len': len(title or ''),
        'title_count': len(re.findall(r'<title[^>]*>', head, re.I)),
        'description': desc, 'desc_len': len(desc or ''),
        'canonical': canon,
        'canonical_count': len(re.findall(r'rel=["\']?canonical', head, re.I)),
        'canonical_self': bool(canon) and canon.rstrip('/') == final.rstrip('/'),
        'meta_robots': robots,
        'x_robots_tag': info.get('x_robots_tag') or None,
        'viewport': viewport, 'lang': lang,
        'charset': bool(re.search(r'<meta[^>]+charset', head, re.I)),
        'hreflang': [
            {'lang': m.group(1), 'href': m.group(2)}
            for m in re.finditer(
                r'<link[^>]+hreflang=["\']?([\w-]+)["\']?[^>]*href=["\']([^"\']+)', head, re.I)],
        'amphtml': bool(re.search(r'rel=["\']?amphtml', head, re.I)),
        'noindex': bool(re.search(
            r'noindex', (robots or '') + ' ' + (info.get('x_robots_tag') or ''), re.I)),
    }

    # ---------------- social
    og = {m.group(1).lower(): re.sub(r'\s+', ' ', m.group(2)).strip() for m in re.finditer(
        r'<meta[^>]+property=["\']og:([\w:]+)["\'][^>]+content=["\']([^"\']*)', head, re.I)}
    tw = {m.group(1).lower(): re.sub(r'\s+', ' ', m.group(2)).strip() for m in re.finditer(
        r'<meta[^>]+name=["\']twitter:([\w:]+)["\'][^>]+content=["\']([^"\']*)', head, re.I)}
    out['social'] = {
        'og': og, 'og_count': len(og),
        'og_missing': [k for k in ('title', 'description', 'image', 'url', 'type') if k not in og],
        'twitter': tw, 'twitter_count': len(tw),
        'twitter_missing': [k for k in ('card', 'title', 'description', 'image') if k not in tw],
    }

    # ---------------- structured data
    blocks, types, errors = [], Counter(), []
    for m in re.finditer(
            r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
            html, re.I | re.S):
        body = m.group(1).strip()
        # Nhiều CMS nhả HTML comment hoặc CDATA quanh JSON — dọn trước khi parse.
        body = re.sub(r'^<!--|-->$', '', body).strip()
        body = re.sub(r'^//\s*<!\[CDATA\[|\]\]>\s*$', '', body).strip()
        try:
            data = json.loads(body)
        except Exception as e:
            errors.append(f'JSON-LD sai cú pháp ({str(e)[:80]}) — Google bỏ qua cả block này')
            continue
        blocks.append(data)

        def walk(node):
            if isinstance(node, dict):
                t = node.get('@type')
                for tt in (t if isinstance(t, list) else [t]):
                    if isinstance(tt, str):
                        types[tt] += 1
                for v in node.values():
                    walk(v)
            elif isinstance(node, list):
                for v in node:
                    walk(v)
        walk(data)

    micro = Counter(re.findall(r'itemtype=["\']https?://schema\.org/(\w+)', html, re.I))
    out['schema'] = {
        'jsonld_blocks': len(re.findall(r'application/ld\+json', html, re.I)),
        'jsonld_valid': len(blocks),
        'types': dict(types.most_common()),
        'microdata': dict(micro.most_common()),
        'rdfa': len(re.findall(r'\btypeof=["\']', html, re.I)),
        'errors': errors,
        'has_breadcrumb': bool(types.get('BreadcrumbList') or micro.get('BreadcrumbList')),
        'has_faq': bool(types.get('FAQPage')),
        'has_article': bool(types.get('Article') or types.get('NewsArticle')
                            or types.get('BlogPosting')),
        'has_org': bool(types.get('Organization') or types.get('LocalBusiness')
                        or types.get('MedicalOrganization')),
        'has_person_author': 'Person' in types,
        'has_howto': bool(types.get('HowTo')),
        'has_product': bool(types.get('Product')),
        'has_qa': bool(types.get('QAPage')),
        'has_searchaction': 'SearchAction' in types,
        'has_speakable': bool(re.search(r'"speakable"', html, re.I)),
        'has_video': bool(types.get('VideoObject')),
        'has_dates': bool(re.search(r'"date(Published|Modified)"', html, re.I)),
    }

    # ---------------- nội dung
    p = Visible()
    try:
        p.feed(html)
    except Exception:
        pass
    body = p.body_text()
    ws = words(body)
    hs = p.headings
    h1s = [t for lv, t in hs if lv == 1]

    # Nhảy bậc heading (h2 → h4) làm AI parse sai quan hệ cha-con của section.
    jumps, prev = [], 0
    for lv, t in hs:
        if prev and lv > prev + 1:
            jumps.append(f'h{prev} → h{lv}: "{t[:60]}"')
        prev = lv

    freq = Counter(w for w in ws if w not in STOPWORDS)
    bi = Counter(g for g in ngrams(ws, 2) if not all(x in STOPWORDS for x in g.split()))
    tri = Counter(g for g in ngrams(ws, 3) if not all(x in STOPWORDS for x in g.split()))

    out['content'] = {
        'words': len(ws),
        'unique_words': len(set(ws)),
        'chrome_words': len(words(''.join(p.chrome_parts))),
        'text_html_ratio': round(len(body) / max(1, len(html)) * 100, 1),
        'h1': h1s, 'h1_count': len(h1s),
        'headings': [{'level': lv, 'text': t} for lv, t in hs],
        'heading_counts': {f'h{n}': sum(1 for lv, _ in hs if lv == n) for n in range(1, 7)},
        'heading_jumps': jumps,
        'empty_headings': sum(1 for lv, t in hs if len(t) < 3),
        'paragraphs': len(p.paragraphs),
        'long_paragraphs': sum(1 for n in p.paragraphs if n > 120),
        'avg_paragraph_words': round(sum(p.paragraphs) / len(p.paragraphs), 1) if p.paragraphs else 0,
        'lists': p.lists, 'tables': p.tables, 'has_main': p.has_main,
        'top_terms': freq.most_common(25),
        'top_bigrams': [g for g in bi.most_common(15) if g[1] > 1],
        'top_trigrams': [g for g in tri.most_common(15) if g[1] > 1],
        # Câu hỏi trong heading = nguyên liệu trực tiếp cho AI Overview / PAA.
        'question_headings': [t for _, t in hs if re.search(
            r'\?|^(tại sao|vì sao|làm sao|làm thế nào|thế nào|cách|có nên|là gì|bao nhiêu|'
            r'khi nào|ở đâu|nên|có thể|how|what|why|when|where|who|which|can|should|is|are|does)\b',
            t.strip(), re.I)],
        'has_toc': bool(re.search(r'(mục lục|table of contents|nội dung bài viết)', low)),
        'has_faq_text': bool(re.search(r'(câu hỏi thường gặp|hỏi đáp|faq|thắc mắc)', low)),
        'has_date_text': bool(re.search(
            r'(cập nhật|đăng ngày|ngày đăng|published|updated|last modified)', low)),
        'has_author_text': bool(re.search(
            r'(tác giả|người viết|biên tập|author|by\s+[A-ZÀ-Ỹ])', html)),
        'has_source_cite': bool(re.search(r'(nguồn|tham khảo|theo\s+\w+|reference|source:)', low)),
        # Số liệu cụ thể là thứ AI thích trích dẫn nhất.
        'numeric_facts': len(re.findall(
            r'\b\d[\d.,]*\s*(?:%|đồng|vnđ|vnd|usd|\$|triệu|tỷ|nghìn|km|kg|ml|mg|'
            r'phút|giờ|ngày|tháng|năm|lần)\b', low)),
    }

    # ---------------- link
    host = urlparse(final).netloc.lower().replace('www.', '')
    internal, external, nofollow, empty_anchor, generic_anchor = [], [], 0, 0, 0
    GENERIC = {'xem thêm', 'tại đây', 'ở đây', 'chi tiết', 'đọc thêm', 'click', 'link',
               'here', 'read more', 'more', 'xem', 'bấm vào đây'}
    for m in re.finditer(r'<a\b([^>]*)>(.*?)</a>', html, re.I | re.S):
        tag, inner = m.group(1), m.group(2)
        hm = re.search(r'href=["\']([^"\']*)', tag, re.I)
        if not hm:
            continue
        href = hm.group(1).strip()
        if not href or href.startswith(('#', 'javascript:', 'mailto:', 'tel:')):
            continue
        anchor = re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', inner)).strip()
        rm = re.search(r'rel=["\']([^"\']*)', tag, re.I)
        rel = rm.group(1).lower() if rm else ''
        if 'nofollow' in rel:
            nofollow += 1
        absu = urljoin(final, href)
        h = urlparse(absu).netloc.lower().replace('www.', '')
        rec = {'href': absu, 'anchor': anchor[:120], 'rel': rel}
        if h == host:
            internal.append(rec)
            if not anchor and not re.search(r'<img', inner, re.I):
                empty_anchor += 1
            elif anchor.lower() in GENERIC:
                generic_anchor += 1
        elif h:
            external.append(rec)

    out['links'] = {
        'internal': len(internal), 'internal_unique': len({l['href'] for l in internal}),
        'external': len(external), 'external_unique': len({l['href'] for l in external}),
        'external_domains': sorted({urlparse(l['href']).netloc for l in external})[:25],
        'nofollow': nofollow,
        'empty_anchor': empty_anchor, 'generic_anchor': generic_anchor,
        'internal_sample': internal[:40],
        'external_sample': external[:20],
        'http_links_on_https': sum(
            1 for l in internal + external if l['href'].startswith('http://')),
    }

    # ---------------- ảnh
    imgs = re.findall(r'<img\b[^>]*>', html, re.I)

    def has(t, a):
        return bool(re.search(r'\b' + a + r'\s*=', t, re.I))

    out['images'] = {
        'total': len(imgs),
        'no_alt': sum(1 for t in imgs if not has(t, 'alt')),
        'empty_alt': sum(1 for t in imgs if re.search(r'\balt\s*=\s*["\']\s*["\']', t, re.I)),
        'no_dimensions': sum(1 for t in imgs if not (has(t, 'width') and has(t, 'height'))),
        'no_lazy': sum(1 for t in imgs if not re.search(r'loading\s*=\s*["\']?lazy', t, re.I)),
        'eager': sum(1 for t in imgs if re.search(r'loading\s*=\s*["\']?eager', t, re.I)),
        'srcset': sum(1 for t in imgs if has(t, 'srcset')),
        'next_gen': sum(1 for t in imgs if re.search(r'\.(webp|avif)', t, re.I)),
        'picture_tags': len(re.findall(r'<picture\b', html, re.I)),
        'fetchpriority_high': sum(
            1 for t in imgs if re.search(r'fetchpriority\s*=\s*["\']?high', t, re.I)),
    }

    # ---------------- tài nguyên chặn render
    head_scripts = re.findall(r'<script\b[^>]*>', head, re.I)
    ext_scripts = [s for s in head_scripts if re.search(r'\bsrc\s*=', s, re.I)]
    all_ext = re.findall(r'<script\b[^>]*\bsrc=', html, re.I)
    out['perf'] = {
        'html_bytes': info.get('bytes_html'),
        'wire_bytes': info.get('bytes_wire'),
        'head_scripts_total': len(head_scripts),
        'head_scripts_external': len(ext_scripts),
        'head_scripts_blocking': sum(
            1 for s in ext_scripts if not re.search(r'\b(async|defer)\b', s, re.I)),
        'body_scripts_external': max(0, len(all_ext) - len(ext_scripts)),
        'css_links': len(re.findall(r'<link\b[^>]*rel=["\']?stylesheet', head, re.I)),
        'inline_css_bytes': sum(
            len(m) for m in re.findall(r'<style\b[^>]*>(.*?)</style>', html, re.I | re.S)),
        'inline_js_bytes': sum(len(m) for m in re.findall(
            r'<script\b(?![^>]*\bsrc)(?![^>]*ld\+json)[^>]*>(.*?)</script>', html, re.I | re.S)),
        'preload': len(re.findall(r'rel=["\']?preload', head, re.I)),
        'preconnect': len(re.findall(r'rel=["\']?preconnect', head, re.I)),
        'dns_prefetch': len(re.findall(r'rel=["\']?dns-prefetch', head, re.I)),
        'font_preload': len(re.findall(r'rel=["\']?preload[^>]+as=["\']?font', head, re.I)),
        'iframes': len(re.findall(r'<iframe\b', html, re.I)),
        'iframe_no_lazy': len(re.findall(r'<iframe\b(?![^>]*loading)', html, re.I)),
        'third_party_hosts': sorted({
            urlparse(urljoin(final, m)).netloc
            for m in re.findall(r'<script\b[^>]*src=["\']([^"\']+)', html, re.I)
            if urlparse(urljoin(final, m)).netloc
            and urlparse(urljoin(final, m)).netloc.replace('www.', '') != host})[:20],
    }

    # ---------------- cảnh báo tự sinh
    w = []
    st = info.get('status')
    m_, c_, s_, so_, li_, im_, pf_ = (out['meta'], out['content'], out['schema'],
                                      out['social'], out['links'], out['images'], out['perf'])
    if st != 200:
        w.append(f'P0 · HTTP {st} — trang không trả 200, mọi phân tích dưới đây có thể không đúng')
    ctype = (info.get('content_type') or '').lower()
    if ctype and 'html' not in ctype:
        w.append(f'· Content-Type là "{ctype.split(";")[0]}", không phải HTML — '
                 'các chỉ số on-page dưới đây không có nghĩa với loại tài liệu này')
    if m_['noindex']:
        w.append('P0 · Trang có NOINDEX (meta robots hoặc X-Robots-Tag) — Google sẽ không index')
    if not title:
        w.append('P0 · Không có <title>')
    elif m_['title_count'] > 1:
        w.append(f'P0 · Có {m_["title_count"]} thẻ <title> — Google chỉ đọc cái đầu, phần còn lại là rác')
    elif not TITLE_MIN <= m_['title_len'] <= TITLE_MAX:
        w.append(f'P1 · Title dài {m_["title_len"]} ký tự (nên {TITLE_MIN}–{TITLE_MAX}) — SERP cắt hoặc bỏ trống chỗ')
    if not desc:
        w.append('P1 · Không có meta description — Google tự bốc một đoạn bất kỳ trong trang')
    elif not DESC_MIN <= m_['desc_len'] <= DESC_MAX:
        w.append(f'P2 · Description dài {m_["desc_len"]} ký tự (nên {DESC_MIN}–{DESC_MAX})')
    if not canon:
        w.append('P1 · Không có rel=canonical — mọi biến thể URL đều có thể bị index riêng')
    elif m_['canonical_count'] > 1:
        w.append(f'P0 · Có {m_["canonical_count"]} thẻ canonical — Google bỏ qua tất cả')
    elif not m_['canonical_self']:
        w.append(f'P1 · Canonical trỏ sang URL khác ({canon}) — kiểm tra có cố ý không')
    if c_['h1_count'] == 0:
        w.append('P1 · Không có H1')
    elif c_['h1_count'] > 1:
        w.append(f'P2 · Có {c_["h1_count"]} thẻ H1 — chọn một cái làm chủ đề chính')
    if c_['words'] < 300:
        w.append(f'P1 · Chỉ {c_["words"]} từ ở thân bài — thin content, hoặc nội dung do JS render (bot lượt đầu không thấy)')
    if jumps:
        w.append(f'P2 · Heading nhảy bậc {len(jumps)} chỗ ({jumps[0]}) — AI parse sai cấu trúc section')
    if s_['jsonld_blocks'] == 0 and not micro:
        w.append('P1 · Không có structured data nào — mất rich result và mất tín hiệu thực thể cho AI')
    if s_['errors']:
        w.append('P0 · JSON-LD sai cú pháp — Google bỏ qua cả block: ' + s_['errors'][0])
    if not s_['has_breadcrumb']:
        w.append('P2 · Không có BreadcrumbList schema — mất đường dẫn hiển thị trên SERP')
    if so_['og_count'] == 0:
        w.append('P2 · Không có Open Graph — link share ra Facebook/Zalo không có ảnh và tiêu đề')
    if so_['twitter_count'] == 0:
        w.append('P3 · Không có Twitter Card')
    if im_['no_alt']:
        w.append(f'P2 · {im_["no_alt"]}/{im_["total"]} ảnh thiếu alt')
    if im_['no_dimensions']:
        w.append(f'P2 · {im_["no_dimensions"]}/{im_["total"]} ảnh thiếu width/height — gây CLS')
    if pf_['head_scripts_blocking']:
        w.append(f'P1 · {pf_["head_scripts_blocking"]} script chặn render trong <head> — thêm async/defer hoặc dời xuống cuối body')
    if pf_['inline_css_bytes'] > 50000:
        w.append(f'P2 · {pf_["inline_css_bytes"] // 1024}KB CSS nội tuyến trong HTML — không cache được, tải lại mỗi trang')
    if not viewport:
        w.append('P0 · Không có meta viewport — mobile-first index đánh giá là không thân thiện mobile')
    if not lang:
        w.append('P2 · Thẻ <html> không có lang — ảnh hưởng targeting ngôn ngữ và screen reader')
    if li_['internal'] < 5:
        w.append(f'P1 · Chỉ {li_["internal"]} internal link — trang gần như mồ côi, PageRank không chảy tới')
    if li_['http_links_on_https']:
        w.append(f'P2 · {li_["http_links_on_https"]} link còn dùng http:// — mixed content')
    if not c_['question_headings']:
        w.append('P1 · GEO: không có heading nào dạng câu hỏi — mất cửa vào AI Overview và PAA')
    if c_['numeric_facts'] < 3:
        w.append(f'P2 · GEO: chỉ {c_["numeric_facts"]} số liệu cụ thể — AI ưu tiên trích dẫn nội dung có số đo')
    if not c_['has_author_text'] and not s_['has_person_author']:
        w.append('P1 · E-E-A-T: không thấy tác giả (cả text và schema)')
    if not c_['has_date_text'] and not s_['has_dates']:
        w.append('P2 · Không có ngày đăng/cập nhật — mất tín hiệu freshness')
    out['warnings'] = w
    return out

# -------------------------------------------------------------------- in ra text
def report(d):
    def line(k, v, note=''):
        print(f'  {k:<26} {v}' + (f'   {note}' if note else ''))

    print(f'\n===== ON-PAGE: {d["url"]} =====')
    print(f'HTTP {d["http"].get("status")} · {(d["http"].get("bytes_html") or 0) // 1024}KB HTML'
          f' · final={d["http"].get("final_url")}')
    if d['http'].get('error'):
        print('LỖI TẢI TRANG:', d['http']['error'])
        return

    m, c, s, so, li, im, pf = (d['meta'], d['content'], d['schema'],
                               d['social'], d['links'], d['images'], d['perf'])

    print('\n-- META --')
    line('title', f'[{m["title_len"]}] {m["title"]}')
    line('description', f'[{m["desc_len"]}] {(m["description"] or "")[:150]}')
    line('canonical', f'{m["canonical"]}  (self={m["canonical_self"]})')
    line('meta robots', m['meta_robots'] or '—')
    line('X-Robots-Tag', m['x_robots_tag'] or '—')
    line('lang / viewport', f'{m["lang"]} / {"có" if m["viewport"] else "KHÔNG CÓ"}')
    line('hreflang', len(m['hreflang']))

    print('\n-- NỘI DUNG --')
    line('số từ (thân bài)', f'{c["words"]} (nav/footer thêm {c["chrome_words"]})')
    line('tỉ lệ text/HTML', f'{c["text_html_ratio"]}%')
    line('heading', ' '.join(f'{k}={v}' for k, v in c['heading_counts'].items() if v))
    line('H1', ' | '.join(c['h1']) or '—')
    line('nhảy bậc heading', len(c['heading_jumps']))
    line('đoạn văn', f'{c["paragraphs"]} (dài quá 120 từ: {c["long_paragraphs"]}, '
                     f'TB {c["avg_paragraph_words"]} từ)')
    line('list / table', f'{c["lists"]} / {c["tables"]}')
    line('heading câu hỏi', len(c['question_headings']))
    for q in c['question_headings'][:8]:
        print(f'      · {q[:96]}')
    line('số liệu cụ thể', c['numeric_facts'])
    line('TOC/FAQ/tác giả/ngày',
         f'{c["has_toc"]} / {c["has_faq_text"]} / {c["has_author_text"]} / {c["has_date_text"]}')
    line('top terms', ', '.join(f'{w}×{n}' for w, n in c['top_terms'][:12]))
    line('top bigram', ', '.join(f'{w}×{n}' for w, n in c['top_bigrams'][:8]) or '—')
    line('top trigram', ', '.join(f'{w}×{n}' for w, n in c['top_trigrams'][:6]) or '—')

    print('\n-- STRUCTURED DATA --')
    line('JSON-LD block', f'{s["jsonld_valid"]} hợp lệ / {s["jsonld_blocks"]} tổng')
    line('@type', ', '.join(f'{k}×{v}' for k, v in s['types'].items()) or '— KHÔNG CÓ')
    line('microdata', ', '.join(f'{k}×{v}' for k, v in s['microdata'].items()) or '—')
    line('breadcrumb/faq/article', f'{s["has_breadcrumb"]} / {s["has_faq"]} / {s["has_article"]}')
    line('org/author/speakable',
         f'{s["has_org"]} / {s["has_person_author"]} / {s["has_speakable"]}')
    for e in s['errors']:
        print(f'      LỖI: {e}')

    print('\n-- SOCIAL --')
    line('Open Graph', f'{so["og_count"]} thẻ, thiếu: {so["og_missing"] or "không thiếu gì"}')
    line('Twitter Card',
         f'{so["twitter_count"]} thẻ, thiếu: {so["twitter_missing"] or "không thiếu gì"}')

    print('\n-- LINK --')
    line('internal', f'{li["internal"]} ({li["internal_unique"]} URL khác nhau)')
    line('external',
         f'{li["external"]} ({li["external_unique"]} URL, {len(li["external_domains"])} domain)')
    line('nofollow', li['nofollow'])
    line('anchor rỗng / chung chung', f'{li["empty_anchor"]} / {li["generic_anchor"]}')
    line('link http:// trên https', li['http_links_on_https'])
    if li['external_domains']:
        line('domain ngoài', ', '.join(li['external_domains'][:10]))

    print('\n-- ẢNH --')
    line('tổng', im['total'])
    line('thiếu alt / alt rỗng', f'{im["no_alt"]} / {im["empty_alt"]}')
    line('thiếu width+height', im['no_dimensions'])
    line('không lazy / eager', f'{im["no_lazy"]} / {im["eager"]}')
    line('srcset/webp-avif/picture',
         f'{im["srcset"]} / {im["next_gen"]} / {im["picture_tags"]}')

    print('\n-- HIỆU NĂNG (tĩnh) --')
    line('script trong head', f'{pf["head_scripts_total"]} tổng, {pf["head_scripts_external"]} ngoài, '
                              f'{pf["head_scripts_blocking"]} CHẶN RENDER')
    line('script ngoài ở body', pf['body_scripts_external'])
    line('CSS link / inline', f'{pf["css_links"]} / {pf["inline_css_bytes"] // 1024}KB')
    line('inline JS', f'{pf["inline_js_bytes"] // 1024}KB')
    line('preload/preconnect/font',
         f'{pf["preload"]} / {pf["preconnect"]} / {pf["font_preload"]}')
    line('iframe (không lazy)', f'{pf["iframes"]} ({pf["iframe_no_lazy"]})')
    if pf['third_party_hosts']:
        line('host bên thứ ba', ', '.join(pf['third_party_hosts'][:8]))

    print(f'\n-- CẢNH BÁO ({len(d["warnings"])}) --')
    for x in d['warnings']:
        print('  ' + x)
    if not d['warnings']:
        print('  không có cảnh báo nào ở mức kiểm được bằng script')
    print()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('target', help='URL, hoặc đường dẫn file HTML đã tải')
    ap.add_argument('--url', help='URL gốc, dùng khi target là file')
    ap.add_argument('--json', action='store_true', help='in JSON thay vì text')
    a = ap.parse_args()

    if a.target.startswith(('http://', 'https://')):
        html, info = fetch(a.target)
        url = a.target
        if html is None:
            print(json.dumps({'url': url, 'http': info}, ensure_ascii=False) if a.json
                  else f'LỖI: không tải được {url} — {info.get("error")}')
            sys.exit(1)
    else:
        html = open(a.target, encoding='utf-8', errors='replace').read()
        url = a.url or a.target
        info = {'status': 200, 'final_url': url, 'bytes_html': len(html.encode()),
                'bytes_wire': None, 'content_type': 'text/html',
                'x_robots_tag': '', 'link_header': ''}

    d = analyze(html, url, info)
    if a.json:
        print(json.dumps(d, ensure_ascii=False, indent=2))
    else:
        report(d)


if __name__ == '__main__':
    main()
