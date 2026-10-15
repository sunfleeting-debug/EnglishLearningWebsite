"""Run the static site and persistent development API on localhost."""
from functools import partial
from http.server import ThreadingHTTPServer
from pathlib import Path
import socket
import threading

import mock_api
import serve

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "tools" / ".cache"


def main():
    for port in (5173, 8791):
        with socket.socket() as probe:
            probe.settimeout(0.3)
            if probe.connect_ex(("127.0.0.1", port)) == 0:
                raise SystemExit(f"Port {port} is already in use. Stop that server first.")
    CACHE.mkdir(parents=True, exist_ok=True)
    db = mock_api.DB(str(CACHE / "local.sqlite"))
    app = mock_api.App(db, ["admin@test.local"])
    with ThreadingHTTPServer(("127.0.0.1", 8791), mock_api.make_handler(app)) as api:
        with serve.ThreadingServer(
            ("127.0.0.1", 5173), partial(serve.RangeHandler, directory=str(ROOT))
        ) as site:
            thread = threading.Thread(target=api.serve_forever, daemon=True)
            thread.start()
            print("Website: http://127.0.0.1:5173/", flush=True)
            print("Development API: http://127.0.0.1:8791/api/health", flush=True)
            print(f"Development database: {CACHE / 'local.sqlite'}", flush=True)
            try:
                site.serve_forever()
            except KeyboardInterrupt:
                pass
            finally:
                api.shutdown()
                db.conn.close()


if __name__ == "__main__":
    main()
