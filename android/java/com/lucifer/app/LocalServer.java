package com.lucifer.app;

import android.content.Context;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URLDecoder;
import java.util.HashMap;
import java.util.Map;

/**
 * 把 assets 里的单文件应用通过 127.0.0.1 的 HTTP 服务暴露出去。
 * 这样页面拿到的是标准 http 源：CORS、Service Worker、localStorage 全部正常，
 * 比 file:// 少踩一大堆坑。
 */
public class LocalServer {

    private static final Map<String, String> TYPES = new HashMap<String, String>();

    static {
        TYPES.put("html", "text/html; charset=utf-8");
        TYPES.put("js", "text/javascript; charset=utf-8");
        TYPES.put("css", "text/css; charset=utf-8");
        TYPES.put("json", "application/json; charset=utf-8");
        TYPES.put("webmanifest", "application/manifest+json; charset=utf-8");
        TYPES.put("svg", "image/svg+xml");
        TYPES.put("png", "image/png");
        TYPES.put("jpg", "image/jpeg");
        TYPES.put("ico", "image/x-icon");
        TYPES.put("txt", "text/plain; charset=utf-8");
    }

    private final Context ctx;
    private final int port;
    private ServerSocket server;
    private volatile boolean running = true;

    public LocalServer(Context c, int p) {
        this.ctx = c;
        this.port = p;
    }

    public int start() throws IOException {
        server = new ServerSocket(port, 64, InetAddress.getByName("127.0.0.1"));
        Thread t = new Thread(new Runnable() {
            public void run() {
                loop();
            }
        });
        t.setDaemon(true);
        t.start();
        return server.getLocalPort();
    }

    public void stop() {
        running = false;
        try {
            if (server != null) server.close();
        } catch (IOException e) {
            // ignore
        }
    }

    private void loop() {
        while (running) {
            try {
                final Socket s = server.accept();
                Thread th = new Thread(new Runnable() {
                    public void run() {
                        handle(s);
                    }
                });
                th.setDaemon(true);
                th.start();
            } catch (IOException e) {
                if (!running) return;
            }
        }
    }

    private void handle(Socket s) {
        try {
            s.setSoTimeout(15000);
            byte[] head = new byte[4096];
            int n = s.getInputStream().read(head);
            if (n <= 0) {
                s.close();
                return;
            }
            String first = new String(head, 0, n, "UTF-8").split("\r\n")[0];
            String[] parts = first.split(" ");
            String path = parts.length > 1 ? parts[1] : "/";

            int q = path.indexOf('?');
            if (q >= 0) path = path.substring(0, q);
            path = URLDecoder.decode(path, "UTF-8");
            if (path.length() == 0 || path.equals("/")) path = "/index.html";
            if (path.startsWith("/")) path = path.substring(1);
            if (path.contains("..")) {
                sendText(s, 403, "text/plain; charset=utf-8", "forbidden");
                return;
            }

            byte[] data = readAsset(path);
            if (data == null) {
                byte[] fallback = readAsset("index.html");
                if (fallback == null) {
                    sendText(s, 404, "text/plain; charset=utf-8", "not found");
                    return;
                }
                sendBytes(s, 200, TYPES.get("html"), fallback);
                return;
            }
            sendBytes(s, 200, typeOf(path), data);
        } catch (Exception e) {
            try {
                s.close();
            } catch (IOException x) {
                // ignore
            }
        }
    }

    private byte[] readAsset(String path) {
        InputStream is = null;
        try {
            is = ctx.getAssets().open(path);
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            byte[] buf = new byte[16384];
            int n;
            while ((n = is.read(buf)) > 0) bo.write(buf, 0, n);
            return bo.toByteArray();
        } catch (IOException e) {
            return null;
        } finally {
            if (is != null) {
                try {
                    is.close();
                } catch (IOException x) {
                    // ignore
                }
            }
        }
    }

    private String typeOf(String p) {
        int i = p.lastIndexOf('.');
        if (i < 0) return "application/octet-stream";
        String t = TYPES.get(p.substring(i + 1).toLowerCase());
        return t == null ? "application/octet-stream" : t;
    }

    private void sendText(Socket s, int code, String type, String body) throws IOException {
        sendBytes(s, code, type, body.getBytes("UTF-8"));
    }

    private void sendBytes(Socket s, int code, String type, byte[] body) throws IOException {
        OutputStream o = s.getOutputStream();
        String head = "HTTP/1.1 " + code + (code == 200 ? " OK" : " ERR") + "\r\n"
                + "Content-Type: " + type + "\r\n"
                + "Content-Length: " + body.length + "\r\n"
                + "Cache-Control: no-store\r\n"
                + "Connection: close\r\n\r\n";
        o.write(head.getBytes("UTF-8"));
        o.write(body);
        o.flush();
        s.close();
    }
}
