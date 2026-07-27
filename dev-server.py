#!/usr/bin/env python3
"""Servidor de desarrollo con cabeceras no-store.

Igual que `python3 -m http.server` pero desactivando la caché HTTP del
navegador, para que cada recarga sirva siempre los archivos actuales
(sin necesidad de cambiar de puerto ni hard-reloads).

Uso: python3 dev-server.py [puerto]   (por defecto 8123)
"""
import os
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler

# Servir siempre la carpeta del proyecto (donde vive este script),
# independientemente de desde dónde se lance.
os.chdir(os.path.dirname(os.path.abspath(__file__)))


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Expires", "0")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8123
    print(f"Sirviendo en http://localhost:{port} (sin caché)")
    HTTPServer(("", port), NoCacheHandler).serve_forever()
