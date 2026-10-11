# 正式签名（Release Signing）

## ⚠️ 最重要的一条

**`release.keystore` 丢了，已装过这个 App 的设备就永远无法再更新它** —— Android 只认同一把密钥签出来的包。
丢了只能让用户卸载重装。所以：

- 把它复制到**网盘 / 密码管理器 / 另一台电脑**，至少留两份；
- `android/keystore.properties` 里的密码同样备份；
- 这两样东西**都不进 Git**（见 `.gitignore`）。

## 当前交付包（2026-10-11 · v4 UI）

`android/release/LUCIFER-v3.0.apk` —— 正式签名。本版为**视觉重构 v4** 之后的包
（设计令牌重写 / 右上角「工具」二级菜单 / 柔和动效 / 全屏适配 / 浅色脏块修复）。

| 项 | 值 |
|---|---|
| 文件 | `android/release/LUCIFER-v3.0.apk` |
| 大小 | 365736 字节（357.2 KB） |
| 签名证书 SHA-256 | `d95b43709ef951304fb81f3b1dc299bfcc1d3c99e47dfade98213272ffcef41a` |
| 签名方案 | v1 + v2 + v3 |
| 包内应用 | `assets/index.html` md5 = `b523a7a998b4e9177d7fd4180c85bf1f`，与 `dist/index.html` 逐字节一致 |
| APK SHA-256 | `c993ceeee47f839b8df7125c15f5b13956b364942351934a216682c419100be4`（见 `LUCIFER-v3.0.apk.sha256`） |

> 首版交付的 v3.0 是 **debug 签名**，与正式签名不兼容：装过旧包的设备必须先卸载
> `com.lucifer.app` 再安装，否则报 `INSTALL_FAILED_UPDATE_INCOMPATIBLE`。
> 之后所有版本只要都用同一把密钥，即可正常覆盖升级。

## 加密存放（仓库里只有密文）

**仓库内不再放明文 keystore**。密钥以 AES-256 加密后存放：

```
android/release.keystore.enc     ← 入库的密文
```

加密参数（解密时必须完全一致）：

```bash
openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -md sha256 \
  -in android/release.keystore.enc \
  -out android/release.keystore \
  -pass env:KS_PASS
```

或加密（复原入库文件）：

```bash
KS_PASS='<口令>' openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -md sha256 -salt \
  -in android/release.keystore -out android/release.keystore.enc -pass env:KS_PASS
```

> **口令不在仓库里。** 见 LobeHub 文档《晨星 · Lucifer 交接文档》的
> 「安卓签名密钥（LUCIFER / 晨星）解密说明」一节 —— 那一节同时注明了密文对应哪个应用。

`android/release.keystore`（明文）与 `android/keystore.properties`（口令）都在 `.gitignore` 里，
只在本地存在，供 `build.sh` 使用。

## 重建环境

先解密出明文，再把两个文件放回 `android/`：

```
android/release.keystore      ← 密钥本体
android/keystore.properties   ← 密码（内容见下）
```

`keystore.properties` 格式：

```properties
storeFile=release.keystore
storePassword=<密码>
keyAlias=lucifer
keyPassword=<密码>
```

## 构建

```bash
bash android/build.sh
# → android/build/LUCIFER-release.apk
```

脚本会自动判断：有 `keystore.properties` 就用正式签名，没有则退回 debug 证书（并在日志里说明）。

也可以用环境变量免去 properties 文件：

```bash
LUCIFER_KS_PASS='<密码>' bash android/build.sh
```

## 校验

```bash
apksigner verify --print-certs android/build/LUCIFER-release.apk
# 期望：Signer #1 certificate DN: CN=LUCIFER, OU=LUCIFER, O=Lucifer, C=CN
#       SHA-256 digest: d95b43709ef951304fb81f3b1dc299bfcc1d3c99e47dfade98213272ffcef41a
```

## ⚠️ 从 debug 版升级会失败

debug 包和正式包的签名不同，Android **不允许覆盖安装**。
如果之前装过 `LUCIFER-v3.0.apk`（debug 签名），必须先卸载再装正式包：

```bash
adb uninstall com.lucifer.app
adb install -r android/build/LUCIFER-release.apk
```

之后所有更新只要一直用同一把密钥，就能正常增量安装。
