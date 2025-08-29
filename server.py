#!/usr/bin/env python3
import http.server
import socketserver
import os

PORT = int(os.environ.get('PORT', 3000))
DIRECTORY = "."
BACKEND_URL = os.environ.get('BACKEND_URL', 'http://localhost:8080')

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()
    
    def do_GET(self):
        if self.path == '/config.js':
            # Serve dynamic config.js based on environment variable
            self.send_response(200)
            self.send_header('Content-Type', 'application/javascript')
            self.end_headers()
            config_content = f"window.BACKEND_URL = '{BACKEND_URL}';\n"
            self.wfile.write(config_content.encode())
        else:
            # Serve static files normally
            super().do_GET()

with socketserver.TCPServer(("", PORT), MyHTTPRequestHandler) as httpd:
    print(f"Server running at http://0.0.0.0:{PORT}/")
    print(f"Backend URL configured as: {BACKEND_URL}")
    httpd.serve_forever()