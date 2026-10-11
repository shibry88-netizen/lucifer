package com.lucifer.app;

import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.ViewGroup;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/** LUCIFER 安卓端外壳：一个 WebView 加载本地 HTTP 服务提供的单文件应用。 */
public class MainActivity extends Activity {

    private static final int PORT = 41870;

    private WebView web;
    private LocalServer server;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);

        int port = PORT;
        try {
            server = new LocalServer(this, PORT);
            port = server.start();
        } catch (Exception e) {
            // 端口被占就交给系统分配
            try {
                server = new LocalServer(this, 0);
                port = server.start();
            } catch (Exception e2) {
                port = 0;
            }
        }

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#08090F"));

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);
        try {
            s.setAllowFileAccess(false);
            s.setAllowContentAccess(true);
        } catch (Throwable ignore) {
            // 老系统忽略
        }

        web.setWebViewClient(new WebViewClient());
        web.setWebChromeClient(new WebChromeClient());
        web.setOverScrollMode(WebView.OVER_SCROLL_NEVER);

        setContentView(web, new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        web.loadUrl("http://127.0.0.1:" + port + "/index.html");
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && web != null && web.canGoBack()) {
            web.goBack();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    protected void onDestroy() {
        if (server != null) server.stop();
        if (web != null) {
            try {
                web.destroy();
            } catch (Throwable ignore) {
                // ignore
            }
        }
        super.onDestroy();
    }
}
