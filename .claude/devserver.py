"""Statischer Entwicklungsserver ohne Caching (nur für die lokale Vorschau)."""
import http.server
import socketserver

PORT = 8123


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, fmt, *args):
        pass


if __name__ == '__main__':
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(('127.0.0.1', PORT), NoCacheHandler) as httpd:
        print(f'Evolution Arena: http://localhost:{PORT}')
        httpd.serve_forever()
