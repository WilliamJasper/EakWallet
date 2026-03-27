import os


class Config:
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-change-me")

    # SQLite (PythonAnywhere can use local file storage without extra cost)
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    SQLITE_DB_PATH = os.getenv(
        "SQLITE_DB_PATH", os.path.join(BASE_DIR, "eakwallet.sqlite3")
    )

