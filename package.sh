#!/usr/bin/env bash
# 打包成可以上傳 Chrome Web Store 的 zip。
#
#   ./package.sh
#
# 僅收錄擴充實際會用到的檔案——採白名單，而非黑名單。
# 若改用排除法，日後新增的資料夾會在無人察覺下被一併打包。
set -euo pipefail

cd "$(dirname "$0")"

VERSION=$(node -p "require('./manifest.json').version")
OUT="dist/youtube-language-tutor-${VERSION}.zip"

# 先確認測試全數通過，未通過則不打包
node test/run.js

# 擴充實際會載入的內容，不多不少
INCLUDE=(manifest.json icons content background options shared)

for p in "${INCLUDE[@]}"; do
  [ -e "$p" ] || { echo "❌ 找不到 $p"; exit 1; }
done

mkdir -p dist
rm -f "$OUT"

# -x 排除 macOS 的隱藏檔，審查時會被視為多餘檔案
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
