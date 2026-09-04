#!/usr/bin/env bash
# probe.sh — đo tầng HTTP/hạ tầng của một site. Mọi số in ra là số đo thật.
#
#   bash probe.sh https://example.com            # đo trang chủ
#   bash probe.sh https://example.com/bai-viet/  # đo thêm 1 URL con
#
# In ra text có nhãn để agent đọc lại. KHÔNG ghi file, KHÔNG sửa gì trên site —
# toàn bộ là GET/HEAD ẩn danh, đúng như một con bot bình thường.
set -uo pipefail

RAW="${1:-}"
[ -z "$RAW" ] && { echo "FAIL: thiếu URL. Dùng: bash probe.sh https://example.com"; exit 2; }

# Chấp cả "example.com" và "https://example.com/abc?x=1"
case "$RAW" in
  http://*|https://*) URL="$RAW" ;;
  *) URL="https://$RAW" ;;
esac
ORIGIN="$(printf '%s' "$URL" | sed -E 's#^(https?://[^/]+).*#\1#')"
HOST="$(printf '%s' "$ORIGIN" | sed -E 's#^https?://##')"

UA_HUMAN="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
# --retry 2: một lần trượt DNS/kết nối giữa lượt đo không được phép làm hỏng cả
# bảng kết quả. Không dùng `|| echo fallback` ở đâu cả — curl với -w LUÔN in ra
# chuỗi format kể cả khi lỗi (lúc đó http_code=000), nên fallback chỉ nối thêm rác
# vào dòng curl đã in.
RETRY=(--retry 2 --retry-connrefused --retry-delay 1)
CURL=(curl -sS --compressed --max-time 25 "${RETRY[@]}" -A "$UA_HUMAN")

echo "=== TARGET ==="
echo "url    $URL"
echo "origin $ORIGIN"
echo "host   $HOST"
echo "date   $(date -u '+%Y-%m-%d %H:%M UTC')"

# ---------------------------------------------------------------- DNS / TLS
echo
echo "=== DNS / TLS ==="
"${CURL[@]}" -o /dev/null -w 'ip=%{remote_ip} port=%{remote_port} tls=%{time_appconnect}s alpn=HTTP/%{http_version}\n' "$ORIGIN/" 2>&1 || echo "unreachable"
# Ngày hết hạn cert: cảnh báo sớm còn kịp gia hạn, và cert lỗi thì Google tụt trust.
if command -v openssl >/dev/null 2>&1; then
  echo | openssl s_client -servername "$HOST" -connect "$HOST:443" 2>/dev/null \
    | openssl x509 -noout -subject -issuer -dates 2>/dev/null | sed 's/^/cert  /' || echo "cert  không đọc được"
fi

# ---------------------------------------------------------------- Header
echo
echo "=== RESPONSE HEADER (trang chủ, UA người thật) ==="
"${CURL[@]}" -I "$ORIGIN/" 2>&1 | sed 's/\r$//' | head -40

# ---------------------------------------------------------------- Tốc độ
echo
echo "=== TỐC ĐỘ (3 lần đo, lấy để so cache nóng/lạnh) ==="
for u in "$ORIGIN/" "$URL"; do
  echo "-- $u"
  for i in 1 2 3; do
    "${CURL[@]}" -o /dev/null -w "  #$i dns=%{time_namelookup}s tls=%{time_appconnect}s ttfb=%{time_starttransfer}s total=%{time_total}s bytes=%{size_download} http=%{http_version} code=%{http_code}\n" "$u" 2>&1
  done
  # Nén: đo BYTE TRÊN ĐƯỜNG TRUYỀN, nên KHÔNG dùng --compressed ở hai lệnh này —
  # --compressed làm curl tự giải nén rồi %{size_download} trả về kích thước sau
  # giải nén (và trả 0 nếu bản curl này không biết giải brotli).
  RAW_B=$(curl -sS --max-time 25 -A "$UA_HUMAN" -o /dev/null -H 'Accept-Encoding: identity' -w '%{size_download}' "$u" 2>/dev/null)
  GZ_B=$(curl -sS --max-time 25 -A "$UA_HUMAN" -o /dev/null -H 'Accept-Encoding: br, gzip, deflate' -w '%{size_download}' "$u" 2>/dev/null)
  ENC=$(curl -sS --max-time 25 -A "$UA_HUMAN" -I -H 'Accept-Encoding: br, gzip, deflate' "$u" 2>/dev/null | tr -d '\r' | awk 'tolower($1)=="content-encoding:"{print $2}')
  echo "  nén: raw=${RAW_B:-?}B nén=${GZ_B:-?}B encoding=${ENC:-KHÔNG CÓ}"
  if [ "${RAW_B:-0}" -gt 0 ] 2>/dev/null && [ "${GZ_B:-0}" -gt 0 ] 2>/dev/null; then
    awk -v r="$RAW_B" -v g="$GZ_B" 'BEGIN{printf "  tiết kiệm: %.0f%%\n",(1-g/r)*100}'
  else
    echo "  (không so được tỉ lệ nén — server bỏ qua Accept-Encoding: identity, hoặc một lượt tải lỗi)"
  fi
  [ "$u" = "$URL" ] && break
  [ "$ORIGIN/" = "$URL" ] && break
done

# ---------------------------------------------------------------- Bot
echo
echo "=== STATUS THEO USER-AGENT (403/503 = bot bị chặn) ==="
printf '%-24s %-6s %-8s %-9s %s\n' "user-agent" "home" "target" "robots" "loại"
probe_ua() { # $1 nhãn  $2 UA  $3 loại
  local h t r
  # Không `|| echo ERR`: curl với -w vẫn in http_code=000 khi lỗi, nên fallback chỉ
  # nối thêm "ERR" vào sau "000". Dùng --retry để một lần trượt DNS không thành 403 giả.
  h=$(curl -sS -o /dev/null --max-time 15 "${RETRY[@]}" -A "$2" -w '%{http_code}' "$ORIGIN/" 2>/dev/null)
  t=$(curl -sS -o /dev/null --max-time 15 "${RETRY[@]}" -A "$2" -w '%{http_code}' "$URL" 2>/dev/null)
  r=$(curl -sS -o /dev/null --max-time 15 "${RETRY[@]}" -A "$2" -w '%{http_code}' "$ORIGIN/robots.txt" 2>/dev/null)
  printf '%-24s %-6s %-8s %-9s %s\n' "$1" "${h:-ERR}" "${t:-ERR}" "${r:-ERR}" "$3"
}
probe_ua Googlebot        "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" "search"
probe_ua Bingbot          "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)" "search"
probe_ua Google-Extended  "Google-Extended"                     "AI training (cờ opt-out)"
probe_ua GPTBot           "GPTBot/1.2 (+https://openai.com/gptbot)" "AI training"
probe_ua OAI-SearchBot    "OAI-SearchBot/1.0 (+https://openai.com/searchbot)" "AI search — CÓ trả link"
probe_ua ChatGPT-User     "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot" "AI đọc khi user hỏi"
probe_ua ClaudeBot        "ClaudeBot/1.0 (+claudebot@anthropic.com)" "AI training"
probe_ua Claude-User      "Mozilla/5.0 (compatible; Claude-User/1.0; +Claude-User@anthropic.com)" "AI đọc khi user hỏi"
probe_ua Claude-SearchBot "Mozilla/5.0 (compatible; Claude-SearchBot/1.0; +Claude-SearchBot@anthropic.com)" "AI search — CÓ trả link"
probe_ua PerplexityBot    "Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)" "AI search — CÓ trả link"
probe_ua Perplexity-User  "Mozilla/5.0 (compatible; Perplexity-User/1.0; +https://perplexity.ai/perplexity-user)" "AI đọc khi user hỏi"
probe_ua Applebot         "Mozilla/5.0 (compatible; Applebot/0.1; +http://www.apple.com/go/applebot)" "search + Siri"
probe_ua Applebot-Extended "Applebot-Extended"                  "AI training (cờ opt-out)"
probe_ua CCBot            "CCBot/2.0 (https://commoncrawl.org/faq/)" "Common Crawl → dataset chung"
probe_ua meta-externalagent "meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)" "Meta AI"
probe_ua Amazonbot        "Amazonbot/0.1 (+https://developer.amazon.com/support/amazonbot)" "Alexa / Rufus"
probe_ua facebookexternalhit "facebookexternalhit/1.1"          "preview khi share"
probe_ua Twitterbot       "Twitterbot/1.0"                      "preview khi share"

# ---------------------------------------------------------------- File hạ tầng
echo
echo "=== FILE HẠ TẦNG ==="
for f in /robots.txt /llms.txt /llms-full.txt /sitemap.xml /sitemap_index.xml /sitemap/sitemap.xml /ads.txt /favicon.ico /.well-known/security.txt; do
  # Ngăn cách bằng "|" chứ không phải khoảng trắng: content_type có dạng
  # "text/plain; charset=UTF-8" nên `read` sẽ cắt nó thành hai field.
  OUT=$("${CURL[@]}" -o /dev/null -L -w '%{http_code}|%{size_download}|%{content_type}|%{url_effective}' "$ORIGIN$f" 2>/dev/null)
  IFS='|' read -r code size ctype effective <<<"$OUT"
  printf '%-28s %-5s %8sB  %-22s %s\n' "$f" "${code:-ERR}" "${size:-0}" "${ctype%%;*}" \
    "$([ -n "$effective" ] && [ "$effective" != "$ORIGIN$f" ] && echo "→ $effective")"
done

echo
echo "=== robots.txt (toàn văn) ==="
"${CURL[@]}" -L "$ORIGIN/robots.txt" 2>&1 | sed 's/\r$//' | head -120

echo
echo "=== SITEMAP ==="
SM=$("${CURL[@]}" -L "$ORIGIN/robots.txt" 2>/dev/null | tr -d '\r' | awk 'tolower($1)=="sitemap:"{print $2}')
[ -z "$SM" ] && for c in "$ORIGIN/sitemap.xml" "$ORIGIN/sitemap_index.xml" "$ORIGIN/sitemap/sitemap.xml"; do
  [ "$("${CURL[@]}" -o /dev/null -L -w '%{http_code}' "$c" 2>/dev/null)" = "200" ] && SM="$c" && break
done
if [ -z "$SM" ]; then
  echo "KHÔNG tìm thấy sitemap nào (robots.txt không khai, 3 đường dẫn đoán đều không 200)"
else
  echo "$SM" | while read -r s; do
    [ -z "$s" ] && continue
    BODY=$("${CURL[@]}" -L "$s" 2>/dev/null)
    N_SM=$(printf '%s' "$BODY" | grep -o '<sitemap>' | wc -l | tr -d ' ')
    N_URL=$(printf '%s' "$BODY" | grep -o '<url>' | wc -l | tr -d ' ')
    N_LM=$(printf '%s' "$BODY" | grep -o '<lastmod>' | wc -l | tr -d ' ')
    echo "-- $s : $N_SM sitemap con, $N_URL url, $N_LM lastmod"
    # Sitemap index → liệt kê con kèm số URL, để thấy loại trang nào bị bỏ khỏi sitemap.
    if [ "$N_SM" -gt 0 ]; then
      printf '%s' "$BODY" | grep -o '<loc>[^<]*</loc>' | sed 's/<[^>]*>//g' | head -30 | while read -r child; do
        CB=$("${CURL[@]}" -L "$child" 2>/dev/null)
        printf '   %-70s %s url\n' "$child" "$(printf '%s' "$CB" | grep -o '<url>' | wc -l | tr -d ' ')"
      done
    fi
  done
fi

# ---------------------------------------------------------------- Chuẩn hoá URL
echo
echo "=== CHUẨN HOÁ URL (mỗi dòng phải là 301 về đúng 1 bản; 200 cả hai = trùng lặp) ==="
norm() { # $1 nhãn  $2 url
  local OUT code n eff
  OUT=$(curl -sS -o /dev/null -L --max-time 15 "${RETRY[@]}" -A "$UA_HUMAN" -w '%{http_code}|%{num_redirects}|%{url_effective}' "$2" 2>/dev/null)
  IFS='|' read -r code n eff <<<"$OUT"
  # Nhãn để ASCII: printf %-30s đếm byte, nên nhãn có dấu tiếng Việt sẽ làm lệch cột.
  printf '%-30s code=%-5s hops=%-3s → %s\n' "$1" "${code:-ERR}" "${n:-0}" "${eff:-—}"
}
# Giữ nguyên host, chỉ viết hoa phần đường dẫn: đổi host thành chữ hoa không kiểm
# được gì (DNS không phân biệt hoa thường), còn path viết hoa mới lộ ra trùng lặp.
PATH_PART="${URL#"$ORIGIN"}"
UPPER_PATH="$(printf '%s' "$PATH_PART" | tr '[:lower:]' '[:upper:]')"
norm "http://"            "http://$HOST/"
norm "http://www."        "http://www.$HOST/"
norm "https://www."       "https://www.$HOST/"
norm "no trailing slash"  "${URL%/}"
norm "trailing slash"     "${URL%/}/"
norm "index.html"         "$ORIGIN/index.html"
norm "UPPERCASE path"     "$ORIGIN$UPPER_PATH"
norm "?utm_source=test"   "${URL%/}/?utm_source=test"
norm "?fbclid=xyz"        "${URL%/}/?fbclid=xyz"
norm "junk param ?zz=1"   "${URL%/}/?zz=1"

echo
echo "=== 404 THẬT (soft 404 = trả 200, hoặc 301/302 về trang chủ) ==="
for p in "/trang-khong-ton-tai-$RANDOM-abc/" "/abc/def/ghi-$RANDOM/"; do
  norm "$p" "$ORIGIN$p"
done

echo
echo "=== HEADER BẢO MẬT / CACHE (thiếu không tụt hạng trực tiếp, nhưng ảnh hưởng trust + tốc độ) ==="
"${CURL[@]}" -I -L "$ORIGIN/" 2>/dev/null | tr -d '\r' | awk -F': ' '
  BEGIN{IGNORECASE=1}
  /^(strict-transport-security|content-security-policy|x-content-type-options|x-frame-options|referrer-policy|permissions-policy|cache-control|etag|last-modified|cf-cache-status|x-cache|age|vary|link|content-encoding|server|x-robots-tag):/ {print "  " $0}
'
echo "  (không thấy dòng nào ở trên = header đó KHÔNG có)"

echo
echo "=== HẾT probe.sh ==="
