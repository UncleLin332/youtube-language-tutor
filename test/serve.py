#!/usr/bin/env python3
"""帶 CORS 的靜態伺服器，讓模擬器可以從 youtube.com 抓本機的 content script。

Chrome 的 Private Network Access 會擋掉「公開 HTTPS 網站 → 本機位址」的請求，
所以除了一般 CORS 標頭，還要回 Access-Control-Allow-Private-Network 並處理 OPTIONS 預檢。
"""
import http.server, socketserver, sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8731

class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.send_header('Access-Control-Allow-Private-Network', 'true')
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write('%s %s\n' % (self.command, self.path))

socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(('127.0.0.1', PORT), Handler) as httpd:
    print(f'serving on http://127.0.0.1:{PORT}')
    httpd.serve_forever()
