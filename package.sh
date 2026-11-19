#!/usr/bin/env bash
# 打包成可以上傳 Chrome Web Store 的 zip。
#
#   ./package.sh
#
# 只收擴充真正會用到的檔案——白名單，不是黑名單。
# 用排除法的話，哪天多一個資料夾就會默默被包進去。
set -euo pipefail

cd "$(dirname "$0")"

VERSION=$(node -p "require('./manifest.json').version")
OUT="dist/youtube-language-tutor-${VERSION}.zip"

# 先確定東西是好的，壞的不給包
node test/run.js

# 擴充實際會載入的東西，一個不多一個不少
INCLUDE=(manifest.json icons content background options shared)

for p in "${INCLUDE[@]}"; do
  [ -e "$p" ] || { echo "❌ 找不到 $p"; exit 1; }
done

mkdir -p dist
rm -f "$OUT"

# -x 排除 macOS 的隱藏檔，它們會被審核當成多餘檔案
zip -r -q "$OUT" "${INCLUDE[@]}" -x '*.DS_Store' -x '__MACOSX/*'

echo
echo "✅ $OUT"
echo
echo "包進去的檔案（$(unzip -Z1 "$OUT" | grep -vc '/$') 個）："
unzip -Z1 "$OUT" | grep -v '/$' | sed 's/^/   /'
echo
echo "大小：$(du -h "$OUT" | cut -f1)"
echo
echo "上傳前先用「載入未封裝項目」裝一次解開的 zip，確認功能正常。"
