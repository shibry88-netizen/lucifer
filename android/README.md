# LUCIFER · 安卓端

一个 WebView 外壳，把 `dist/` 里的单文件应用装成 APK。

## 为什么不用 Gradle / Capacitor

这台构建机是 **aarch64**，Android 官方 SDK 的 build-tools 只有 x86_64 二进制，跑不动；
Capacitor 还要拉一整套 npm + AndroidX 依赖。

所以这里走 **Debian 原生工具链**（`aapt` / `apksigner` / `zipalign` 都有 aarch64 版本），
只用 **javac + D8 + aapt** 三步手工出包，产物体积也小得多（约 350 KB）。

## 目录

```
android/
├─ AndroidManifest.xml        # minSdk 21 / targetSdk 33
├─ build.sh                   # 一键构建（自动下载 android.jar 与 r8.jar）
├─ debug.keystore             # debug 签名证书（口令 android）
├─ assets/                    # 由 node dist.mjs 同步，勿手改
├─ java/com/lucifer/app/
│   ├─ MainActivity.java      # WebView 外壳
│   └─ LocalServer.java       # 把 assets 通过 127.0.0.1 的 HTTP 暴露出去
└─ res/mipmap-*/ic_launcher.png
```

## 构建

```bash
apt-get install -y openjdk-17-jdk-headless aapt apksigner android-sdk-build-tools zipalign
bash android/build.sh
# → android/build/LUCIFER.apk
```

## 一个关键设计：不用 `file://`，起本地 HTTP

`file://` 源在 WebView 里是 `null` origin，会带来三个麻烦：
第三方 API 的 CORS 全被拦、Service Worker 注册失败、部分浏览器 API 降级。

所以 `LocalServer` 在 `127.0.0.1` 起了一个几十行的 HTTP 服务，页面实际从
`http://127.0.0.1:<port>/index.html` 加载——标准 http 源，上面三个问题一次解决。
请求的 API 直接走设备网络，不受影响。

## 安装

debug 签名，直接装即可（需在系统设置里允许「未知来源」）：

```bash
adb install -r android/build/LUCIFER.apk
```

## 已知限制

- 只打包了 Web 资源，**没有原生能力**（相机 / 通知 / 后台任务都没有）。要加得写 Java 桥接。
- 服务端口默认 `41870`，被占用时会退化为系统随机分配。
- 换图标/名字改 `res/values/strings.xml` 与 `AndroidManifest.xml`。
