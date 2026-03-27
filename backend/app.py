import os

from flask import Flask, abort, request, send_from_directory
from flask_cors import CORS

from routes.auth import auth_bp
from db import init_db


def create_app() -> Flask:
    app = Flask(__name__)

    # For development. Restrict origins later for production.
    CORS(app, resources={r"/api/*": {"origins": "*"}})

    init_db()
    app.register_blueprint(auth_bp)

    # --- SPA static serving (PythonAnywhere single domain) ---
    # Serve `frontend/dist` and fallback to `index.html` for any non-/api route.
    base_dir = os.path.dirname(os.path.abspath(__file__))
    frontend_dist = os.path.normpath(os.path.join(base_dir, "..", "frontend", "dist"))
    index_file = os.path.join(frontend_dist, "index.html")
    if os.path.exists(index_file):
        app.config["FRONTEND_DIST"] = frontend_dist

        @app.route("/", defaults={"path": ""})
        @app.route("/<path:path>")
        def spa_catch_all(path: str):
            # Let API routes be handled by their own Flask rules.
            if request.path.startswith("/api"):
                abort(404)

            dist = app.config.get("FRONTEND_DIST")
            if not dist:
                abort(404)

            # If the requested file exists in dist (e.g. /assets/...),
            # serve it directly; otherwise return index.html (SPA fallback).
            if path:
                file_path = os.path.join(dist, path)
                if os.path.isfile(file_path):
                    return send_from_directory(dist, path)

            return send_from_directory(dist, "index.html")

    return app


app = create_app()


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)

