#!/usr/bin/env bash
# 用法: ./selfcheck.sh https://你的项目.pages.dev
BASE="${1:?usage: ./selfcheck.sh https://your.pages.dev}"
echo "1) 函数是否部署："
echo -n "   GET  $BASE/proxy  -> "
curl -sS -m 15 -w " [%{http_code}]\n" "$BASE/proxy"
echo "2) GET 代理："
echo -n "   GET  $BASE/proxy?url=https://example.com -> "
curl -sS -m 15 -o /dev/null -w "%{http_code} %{content_type}\n" "$BASE/proxy?url=https%3A%2F%2Fexample.com"
echo "3) POST 代理（旧代码会 405）："
echo -n "   POST $BASE/proxy?url=https://httpbin.org/post -> "
curl -sS -m 15 -o /dev/null -w "%{http_code}\n" -X POST "$BASE/proxy?url=https%3A%2F%2Fhttpbin.org%2Fpost" -H 'content-type: application/json' -d '{"a":1}'
echo "4) 旧入口兼容："
echo -n "   POST $BASE/?url=... -> "
curl -sS -m 15 -o /dev/null -w "%{http_code}\n" -X POST "$BASE/?url=https%3A%2F%2Fhttpbin.org%2Fpost" -d 'a=1'
