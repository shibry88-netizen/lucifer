#!/usr/bin/env bash
# =====================================================================
# LUCIFER 安卓端一键构建（不依赖 Gradle / Android Studio）
#
# 原理：把 dist/ 里的单文件应用塞进 assets/，用 aapt 打包资源、
#       javac + D8 编译 Java、apksigner 做 debug 签名。
#
# 依赖（Debian/Ubuntu）：
#   apt-get install -y openjdk-17-jdk-headless aapt apksigner \
#                      android-sdk-build-tools zipalign
#   另外需要：android.jar（SDK platform）与 r8.jar（提供 D8）
#   脚本会自动下载这两个到 .toolchain/（首次运行需要联网）
#
# 用法：bash android/build.sh
# 产物：android/build/LUCIFER.apk
# =====================================================================
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
TC="$HERE/.toolchain"
BUILD="$HERE/build"
API="${API:-33}"
PLATFORM_ZIP="platform-${API}_r02.zip"

mkdir -p "$TC" "$BUILD"

# ---------- 1. 工具链 ----------
if [ ! -f "$TC/android.jar" ]; then
  echo "→ 下载 android.jar (API $API)…"
  curl -sL -o "$TC/platform.zip" "https://dl.google.com/android/repository/$PLATFORM_ZIP"
  unzip -o -q "$TC/platform.zip" -d "$TC/platform"
  cp "$(find "$TC/platform" -name android.jar | head -1)" "$TC/android.jar"
fi
if [ ! -f "$TC/r8.jar" ]; then
  echo "→ 下载 R8 (D8)…"
  META=$(curl -s https://dl.google.com/dl/android/maven2/com/android/tools/r8/maven-metadata.xml)
  V=$(echo "$META" | grep -oE "<version>[0-9]+\.[0-9]+\.[0-9]+</version>" | tail -1 | sed 's/<[^>]*>//g')
  curl -sL -o "$TC/r8.jar" "https://dl.google.com/dl/android/maven2/com/android/tools/r8/$V/r8-$V.jar"
fi
AJ="$TC/android.jar"

# ---------- 2. 同步前端产物 ----------
echo "→ 构建前端并同步到 assets…"
( cd "$ROOT" && node dist.mjs >/dev/null )
rm -rf "$HERE/assets"; mkdir -p "$HERE/assets"
cp "$ROOT"/dist/* "$HERE/assets/"

# ---------- 3. 图标 ----------
if [ ! -f "$HERE/res/mipmap-mdpi/ic_launcher.png" ]; then
  echo "→ 生成启动图标…"
  python3 - "$ROOT/icon-512.png" "$HERE" <<'PY'
import sys, os
from PIL import Image
src = Image.open(sys.argv[1]).convert('RGBA')
base = sys.argv[2]
for d, px in [('mdpi',48),('hdpi',72),('xhdpi',96),('xxhdpi',144),('xxxhdpi',192)]:
    os.makedirs(os.path.join(base,'res','mipmap-'+d), exist_ok=True)
    src.resize((px,px), Image.LANCZOS).save(os.path.join(base,'res','mipmap-'+d,'ic_launcher.png'),'PNG',optimize=True)
PY
fi

# ---------- 4. 编译 ----------
cd "$HERE"
rm -rf gen obj dex; mkdir -p gen obj dex

echo "→ aapt: 资源 + R.java"
aapt package -f -m -J gen -M AndroidManifest.xml -S res -I "$AJ" -A assets

echo "→ javac"
javac -nowarn -source 8 -target 8 -encoding UTF-8 -cp "$AJ" -d obj \
  $(find gen java -name '*.java') 2>&1 | grep -vE "^(warning|Note)" || true

echo "→ D8: classes.dex"
java -cp "$TC/r8.jar" com.android.tools.r8.D8 --release --min-api 21 --lib "$AJ" \
  --output dex $(find obj -name '*.class')

echo "→ aapt: 打包 APK"
aapt package -f -M AndroidManifest.xml -S res -I "$AJ" -A assets -F "$BUILD/app-unsigned.apk"

python3 - "$BUILD/app-unsigned.apk" <<'PY'
import sys, zipfile
apk = sys.argv[1]
z = zipfile.ZipFile(apk, 'a', zipfile.ZIP_DEFLATED)
z.write('dex/classes.dex', 'classes.dex')
z.close()
PY

# ---------- 5. 对齐 + 签名 ----------
echo "→ zipalign"
zipalign -f 4 "$BUILD/app-unsigned.apk" "$BUILD/app-aligned.apk"

if [ ! -f "$HERE/debug.keystore" ]; then
  echo "→ 生成 debug 证书"
  keytool -genkeypair -keystore "$HERE/debug.keystore" \
    -storepass android -keypass android -alias androiddebugkey \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -dname "CN=Android Debug,O=Android,C=US"
fi

echo "→ apksigner"
apksigner sign --ks "$HERE/debug.keystore" --ks-pass pass:android --key-pass pass:android \
  --ks-key-alias androiddebugkey --min-sdk-version 21 \
  --out "$BUILD/LUCIFER.apk" "$BUILD/app-aligned.apk"

apksigner verify --verbose "$BUILD/LUCIFER.apk" | head -6
echo
echo "✅ 产物：$BUILD/LUCIFER.apk  ($(du -h "$BUILD/LUCIFER.apk" | cut -f1))"
