from http.server import SimpleHTTPRequestHandler, HTTPServer


class RequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs, directory=".")

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, must-revalidate")
        super().end_headers()


def run():
    addr = ("", 8080)
    server = HTTPServer(addr, RequestHandler)
    print("Serving on localhost:8080")
    server.serve_forever()


if __name__ == "__main__":
    run()
