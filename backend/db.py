from __future__ import annotations

from contextlib import contextmanager
import sqlite3

from config import Config


@contextmanager
def get_connection():
    """
    Return an auto-closed SQLite connection.
    """
    conn = sqlite3.connect(Config.SQLITE_DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


def init_db() -> None:
    """
    Create required tables if they don't exist yet.
    """
    with get_connection() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS employees (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              email TEXT NOT NULL UNIQUE,
              password_hash TEXT NOT NULL,
              display_name TEXT NOT NULL DEFAULT '',
              employee_code TEXT NOT NULL DEFAULT '',
              start_work_date TEXT NOT NULL DEFAULT '',
              appointment_date TEXT NOT NULL DEFAULT '',
              accumulated_savings INTEGER NOT NULL DEFAULT 0
            );
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS hr_users (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              email TEXT NOT NULL UNIQUE,
              password_hash TEXT NOT NULL,
              approved INTEGER NOT NULL DEFAULT 0,
              display_name TEXT NOT NULL DEFAULT ''
            );
            """
        )

        # Backward-compatible schema change for existing databases.
        cur = conn.cursor()

        # employees: add missing columns for older SQLite files
        cur.execute("PRAGMA table_info(employees);")
        emp_columns = {row["name"] for row in cur.fetchall()}
        if "display_name" not in emp_columns:
            conn.execute(
                "ALTER TABLE employees ADD COLUMN display_name TEXT NOT NULL DEFAULT '';"
            )
        if "employee_code" not in emp_columns:
            conn.execute(
                "ALTER TABLE employees ADD COLUMN employee_code TEXT NOT NULL DEFAULT '';"
            )
        if "start_work_date" not in emp_columns:
            conn.execute(
                "ALTER TABLE employees ADD COLUMN start_work_date TEXT NOT NULL DEFAULT '';"
            )
        if "appointment_date" not in emp_columns:
            conn.execute(
                "ALTER TABLE employees ADD COLUMN appointment_date TEXT NOT NULL DEFAULT '';"
            )
        if "accumulated_savings" not in emp_columns:
            conn.execute(
                "ALTER TABLE employees ADD COLUMN accumulated_savings INTEGER NOT NULL DEFAULT 0;"
            )

        # hr_users: add missing columns for older SQLite files
        cur.execute("PRAGMA table_info(hr_users);")
        columns = {row["name"] for row in cur.fetchall()}
        if "approved" not in columns:
            conn.execute(
                "ALTER TABLE hr_users ADD COLUMN approved INTEGER NOT NULL DEFAULT 0;"
            )
        if "display_name" not in columns:
            conn.execute("ALTER TABLE hr_users ADD COLUMN display_name TEXT NOT NULL DEFAULT '';")

        conn.commit()

