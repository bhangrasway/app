import json
import secrets
import time
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

HOST = "127.0.0.1"
PORT = 8002
SESSION_COOKIE = "studio_session"
SESSION_TTL_SECONDS = 60 * 60 * 12
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "jindjaan"
SESSIONS = {}
ROOT_DIR = Path(__file__).resolve().parent


def _read_json(handler):
    content_length = int(handler.headers.get("Content-Length", "0") or 0)
    raw_body = handler.rfile.read(content_length) if content_length else b"{}"
    try:
        return json.loads(raw_body.decode("utf-8"))
    except json.JSONDecodeError:
        return None


def _cleanup_sessions():
    now = time.time()
    expired_ids = [session_id for session_id, session in SESSIONS.items() if session["expires_at"] <= now]
    for session_id in expired_ids:
        SESSIONS.pop(session_id, None)


def _get_session_id(handler):
    cookie_header = handler.headers.get("Cookie")
    if not cookie_header:
        return None

    cookies = SimpleCookie()
    cookies.load(cookie_header)
    morsel = cookies.get(SESSION_COOKIE)
    return morsel.value if morsel else None


def _get_session(handler):
    _cleanup_sessions()
    session_id = _get_session_id(handler)
    if not session_id:
        return None
    return SESSIONS.get(session_id)


class StudioRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT_DIR), **kwargs)

    def _send_json(self, status_code, payload, cookie_header=None):
        encoded = json.dumps(payload).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.send_header("Cache-Control", "no-store")
        if cookie_header:
            self.send_header("Set-Cookie", cookie_header)
        self.end_headers()
        self.wfile.write(encoded)

    def _create_session(self, username):
        session_id = secrets.token_urlsafe(32)
        SESSIONS[session_id] = {
            "username": username,
            "expires_at": time.time() + SESSION_TTL_SECONDS,
        }
        return session_id

    def _clear_session(self):
        session_id = _get_session_id(self)
        if session_id:
            SESSIONS.pop(session_id, None)

    def do_GET(self):
        parsed_path = urlparse(self.path)
        if parsed_path.path == "/api/session":
            session = _get_session(self)
            payload = {
                "authenticated": bool(session),
                "username": session["username"] if session else None,
            }
            self._send_json(HTTPStatus.OK, payload)
            return

        if parsed_path.path == "/":
            self.path = "/index.html"

        super().do_GET()

    def do_POST(self):
        parsed_path = urlparse(self.path)

        if parsed_path.path == "/api/login":
            body = _read_json(self)
            if body is None:
                self._send_json(HTTPStatus.BAD_REQUEST, {"authenticated": False, "error": "Invalid request body."})
                return

            username = str(body.get("username", "")).strip()
            password = str(body.get("password", ""))
            valid_username = secrets.compare_digest(username, ADMIN_USERNAME)
            valid_password = secrets.compare_digest(password, ADMIN_PASSWORD)

            if not (valid_username and valid_password):
                self._send_json(HTTPStatus.UNAUTHORIZED, {"authenticated": False, "error": "Invalid username or password."})
                return

            session_id = self._create_session(username)
            cookie_header = (
                f"{SESSION_COOKIE}={session_id}; Path=/; HttpOnly; SameSite=Lax; Max-Age={SESSION_TTL_SECONDS}"
            )
            self._send_json(HTTPStatus.OK, {"authenticated": True, "username": username}, cookie_header=cookie_header)
            return

        if parsed_path.path == "/api/logout":
            self._clear_session()
            cookie_header = f"{SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"
            self._send_json(HTTPStatus.OK, {"authenticated": False}, cookie_header=cookie_header)
            return

        self._send_json(HTTPStatus.NOT_FOUND, {"error": "Not found."})

    def log_message(self, format_string, *args):
        super().log_message(format_string, *args)


if __name__ == "__main__":
    server = ThreadingHTTPServer((HOST, PORT), StudioRequestHandler)
    print(f"Serving Bhangra Sway on http://{HOST}:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
