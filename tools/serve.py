import http.server
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
print(f'Padel Royale running at http://localhost:{port}  (Ctrl+C to stop)', flush=True)
http.server.ThreadingHTTPServer(('127.0.0.1', port), NoCacheHandler).serve_forever()
