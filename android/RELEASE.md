# 正式签名（Release Signing）

## ⚠️ 最重要的一条

**`release.keystore` 丢了，已装过这个 App 的设备就永远无法再更新它** —— Android 只认同一把密钥签出来的包。
丢了只能让用户卸载重装。所以：

- 把它复制到**网盘 / 密码管理器 / 另一台电脑**，至少留两份；
- `android/keystore.properties` 里的密码同样备份；
- 这两样东西**都不进 Git**（见 `.gitignore`）。

## 当前交付包（2026-10-11）

`android/release/LUCIFER-v3.0.apk` —— **已切换为正式签名**（首版交付的 v3.0 是 debug 签名，已作废）。

| 项 | 值 |
|---|---|
| 文件 | `android/release/LUCIFER-v3.0.apk` |
| 大小 | 356 KB |
| 签名证书 SHA-256 | `d95b43709ef951304fb81f3b1dc299bfcc1d3c99e47dfade98213272ffcef41a`（正式密钥，与 `release.keystore` 一致） |
| 签名方案 | v1 + v2 + v3 |
| 包内应用 | `assets/index.html` md5 = `df94e87d64619186974637996ea75b58`，与 `dist/index.html` 逐字节一致 |
| APK SHA-256 | `76da45b0284c21ec1e3dd1a433a546615dea4fe1db7e7a319a666e7c2ac261bc`（见 `LUCIFER-v3.0.apk.sha256`） |

> 装过 debug 签名 v3.0 的设备**必须先卸载** `com.lucifer.app` 再安装，否则会报 `INSTALL_FAILED_UPDATE_INCOMPATIBLE`。

## 密钥信息

| 项 | 值 |
|---|---|
| 文件 | `android/release.keystore` |
| 类型 | PKCS12 |
| 别名 | `lucifer` |
| 算法 | RSA 4096 / SHA256withRSA |
| 主题 | `CN=LUCIFER, OU=LUCIFER, O=Lucifer, C=CN` |
| 有效期 | 2026-10-11 → 2056-10-03（30 年） |
| SHA-256 指纹 | `D9:5B:43:70:9E:F9:51:30:4F:B8:1F:3B:1D:C2:99:BF:CC:1D:3C:99:E4:7D:FA:DE:98:21:32:72:FF:CE:F4:1A` |
| SHA-1 指纹 | `AC:8B:3B:8A:B6:03:EC:66:DD:86:A0:98:A4:FC:42:DB:87:FA:90:1A` |

> 密码见《LUCIFER 交接文档》。这里不写，避免仓库万一转公开时泄露。

## 重建环境

把两个文件放回 `android/`：

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
