import re
import sqlite3
from datetime import date, datetime, timedelta

from flask import Blueprint, jsonify, request
from werkzeug.security import check_password_hash, generate_password_hash

from db import get_connection


auth_bp = Blueprint("auth", __name__)

ADMIN_EMAIL = "admin@123gmail.com"
ADMIN_PASSWORD = "WilliamJasper3"


def _norm_email(value: str) -> str:
    return str(value or "").strip().lower()


def _verify_hr_credentials(payload: dict):
    """
    Returns (hr_row, None) on success.
    On failure returns (None, (jsonify(...), http_status)).
    """
    hr_email = _norm_email(payload.get("hrEmail", ""))
    hr_password = str(payload.get("hrPassword", ""))
    if not hr_email or not hr_password:
        return None, (jsonify({"error": "hrEmail and hrPassword are required"}), 400)

    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id, email, password_hash, approved
            FROM hr_users
            WHERE lower(email)=? LIMIT 1
            """,
            (hr_email,),
        )
        hr_row = cur.fetchone()

    if not hr_row:
        return None, (jsonify({"error": "invalid credentials"}), 401)
    if not check_password_hash(hr_row["password_hash"], hr_password):
        return None, (jsonify({"error": "invalid credentials"}), 401)

    ap = int(hr_row["approved"] or 0)
    if ap == 2:
        return None, (
            jsonify(
                {
                    "error": "hr_rejected",
                    "message": "บัญชี HR ของคุณไม่ผ่านการยืนยันสิทธิ์จากผู้ดูแลระบบ",
                }
            ),
            403,
        )
    if ap != 1:
        return None, (
            jsonify(
                {
                    "error": "hr_pending",
                    "message": "บัญชี HR ยังรอการยืนยันสิทธิ์จากผู้ดูแลระบบ",
                }
            ),
            403,
        )
    return hr_row, None


def _employee_login_response(display_name: str, employee_code: str):
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id, password_hash
            FROM employees
            WHERE lower(trim(display_name)) = lower(trim(?))
            """,
            (display_name,),
        )
        rows = cur.fetchall()

    for er in rows:
        if check_password_hash(er["password_hash"], employee_code):
            token = "dev-token"
            return (
                jsonify(
                    {
                        "message": "login success",
                        "token": token,
                        "role": "employee",
                        "employeeId": int(er["id"]),
                    }
                ),
                200,
            )
    return None


@auth_bp.route("/api/login", methods=["POST"])
def login():
    payload = request.get_json(silent=True) or {}
    raw_login = str(payload.get("email", "")).strip()
    password = str(payload.get("password", ""))

    legacy_name = str(payload.get("employeeName", "")).strip()
    legacy_code = str(payload.get("employeeCode", "")).strip()
    if legacy_name and legacy_code:
        resp = _employee_login_response(legacy_name, legacy_code)
        if resp is not None:
            return resp
        return jsonify({"error": "invalid credentials"}), 401

    if not raw_login or not password:
        return jsonify({"error": "email and password are required"}), 400

    # มี @ = อีเมล (Admin / HR) + รหัสผ่านบัญชี
    if "@" in raw_login:
        email = _norm_email(raw_login)
    else:
        # ไม่มี @ = พนักงาน: ชื่อ-สกุล + รหัสพนักงาน
        resp = _employee_login_response(raw_login, password)
        if resp is not None:
            return resp
        return jsonify({"error": "invalid credentials"}), 401

    # ผู้ดูแลระบบ
    if email == _norm_email(ADMIN_EMAIL) and password == ADMIN_PASSWORD:
        token = "dev-token"
        return (
            jsonify({"message": "login success", "token": token, "role": "admin"}),
            200,
        )

    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id, email, password_hash, approved, display_name
            FROM hr_users
            WHERE lower(email)=? LIMIT 1
            """,
            (email,),
        )
        hr_row = cur.fetchone()

    if not hr_row or not check_password_hash(hr_row["password_hash"], password):
        return jsonify({"error": "invalid credentials"}), 401

    approved = int(hr_row["approved"]) if hr_row["approved"] is not None else 0
    if approved == 2:
        return (
            jsonify(
                {
                    "error": "hr_rejected",
                    "message": "บัญชี HR ของคุณไม่ผ่านการยืนยันสิทธิ์จากผู้ดูแลระบบ",
                }
            ),
            403,
        )
    if approved != 1:
        return (
            jsonify(
                {
                    "error": "hr_pending",
                    "message": "บัญชี HR ยังรอการยืนยันสิทธิ์จากผู้ดูแลระบบ",
                }
            ),
            403,
        )

    token = "dev-token"
    return (
        jsonify(
            {
                "message": "login success",
                "token": token,
                "role": "hr",
                "displayName": str(hr_row["display_name"] or "").strip(),
            }
        ),
        200,
    )


@auth_bp.route("/api/employee/me", methods=["POST"])
def employee_me():
    payload = request.get_json(silent=True) or {}
    name = str(payload.get("employeeName", "")).strip()
    code = str(payload.get("employeeCode", "")).strip()
    if not name or not code:
        return jsonify({"error": "employeeName and employeeCode are required"}), 400

    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id, display_name, employee_code, start_work_date, appointment_date,
                   accumulated_savings, password_hash
            FROM employees
            WHERE lower(trim(display_name)) = lower(trim(?))
            """,
            (name,),
        )
        rows = cur.fetchall()

    row = None
    for r in rows:
        if check_password_hash(r["password_hash"], code):
            row = r
            break

    if not row:
        return jsonify({"error": "invalid credentials"}), 401

    emp_id = int(row["id"])
    ec = (row["employee_code"] or "").strip() or f"EMP{emp_id:06d}"
    sw = (row["start_work_date"] or "").strip()
    ap = (row["appointment_date"] or "").strip()

    def fmt(v: str) -> str:
        return v if v else "-"

    return (
        jsonify(
            {
                "id": emp_id,
                "displayName": (row["display_name"] or "").strip() or "—",
                "employeeCode": ec,
                "startWorkDate": fmt(sw),
                "appointmentDate": fmt(ap),
                "accumulatedSavings": int(row["accumulated_savings"] or 0),
            }
        ),
        200,
    )


@auth_bp.route("/api/signup", methods=["POST"])
def signup():
    payload = request.get_json(silent=True) or {}
    name = str(payload.get("name", "")).strip()  # not stored in current schema yet
    email = _norm_email(payload.get("email", ""))
    password = str(payload.get("password", ""))
    role = str(payload.get("role", "hr")).strip().lower()

    if not name:
        return jsonify({"error": "name is required"}), 400
    if not email or not password:
        return jsonify({"error": "email and password are required"}), 400
    if role != "hr":
        return jsonify({"error": "signup is only available for HR"}), 400

    password_hash = generate_password_hash(password)

    try:
        with get_connection() as conn:
            cur = conn.cursor()
            cur.execute(
                "SELECT id, approved FROM hr_users WHERE lower(email)=? LIMIT 1",
                (email,),
            )
            existing_hr = cur.fetchone()
            if existing_hr is not None:
                prev = int(existing_hr["approved"] or 0)
                if prev == 2:
                    cur.execute(
                        """
                        UPDATE hr_users
                        SET password_hash=?, display_name=?, approved=0
                        WHERE id=?
                        """,
                        (password_hash, name, existing_hr["id"]),
                    )
                else:
                    conn.rollback()
                    return jsonify({"error": "email already exists"}), 409
            else:
                cur.execute(
                    """
                    INSERT INTO hr_users (email, password_hash, display_name)
                    VALUES (?, ?, ?)
                    """,
                    (email, password_hash, name),
                )
            conn.commit()
    except sqlite3.IntegrityError:
        return jsonify({"error": "email already exists"}), 409

    token = "dev-token"
    return jsonify({"message": "signup success", "token": token, "role": "hr"}), 200


@auth_bp.route("/api/admin/approve-hr", methods=["POST"])
def approve_hr():
    payload = request.get_json(silent=True) or {}
    admin_email = _norm_email(payload.get("adminEmail", ""))
    admin_password = str(payload.get("adminPassword", ""))
    hr_email = _norm_email(payload.get("hrEmail", ""))

    if not hr_email:
        return jsonify({"error": "hrEmail is required"}), 400

    if not _verify_admin(admin_email, admin_password):
        return jsonify({"error": "unauthorized"}), 401

    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            "UPDATE hr_users SET approved=1 WHERE lower(email)=?",
            (hr_email,),
        )
        conn.commit()

        if cur.rowcount == 0:
            return jsonify({"error": "hr account not found"}), 404

    return jsonify({"message": "hr approved"}), 200


@auth_bp.route("/api/admin/reject-hr", methods=["POST"])
def reject_hr():
    payload = request.get_json(silent=True) or {}
    admin_email = _norm_email(payload.get("adminEmail", ""))
    admin_password = str(payload.get("adminPassword", ""))
    hr_email = _norm_email(payload.get("hrEmail", ""))

    if not hr_email:
        return jsonify({"error": "hrEmail is required"}), 400

    if not _verify_admin(admin_email, admin_password):
        return jsonify({"error": "unauthorized"}), 401

    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            "UPDATE hr_users SET approved=2 WHERE lower(email)=? AND approved=0",
            (hr_email,),
        )
        conn.commit()

        if cur.rowcount == 0:
            return jsonify({"error": "hr account not found or already processed"}), 404

    return jsonify({"message": "hr rejected"}), 200


def _verify_admin(admin_email: str, admin_password: str) -> bool:
    return _norm_email(admin_email) == _norm_email(ADMIN_EMAIL) and admin_password == ADMIN_PASSWORD


@auth_bp.route("/api/admin/pending-hr", methods=["POST"])
def list_pending_hr():
    payload = request.get_json(silent=True) or {}
    admin_email = _norm_email(payload.get("adminEmail", ""))
    admin_password = str(payload.get("adminPassword", ""))

    if not _verify_admin(admin_email, admin_password):
        return jsonify({"error": "unauthorized"}), 401

    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id, email, display_name AS displayName
            FROM hr_users
            WHERE approved = 0
            ORDER BY id DESC
            """
        )
        rows = cur.fetchall()

    pending = [
        {"id": r["id"], "email": r["email"], "displayName": r["displayName"] or ""}
        for r in rows
    ]
    return jsonify({"pending": pending}), 200


def _parse_iso_date(value: str) -> date | None:
    val = str(value or '').strip()
    if not val:
        return None
    try:
        # Expect YYYY-MM-DD
        return datetime.fromisoformat(val).date()
    except ValueError:
        return None


def _format_age_work(from_day: date) -> str:
    today = date.today()
    # If future date, show 0 month
    if from_day > today:
        return '0 ปี 0 เดือน'

    months = (today.year - from_day.year) * 12 + (today.month - from_day.month)
    if today.day < from_day.day:
        months -= 1
    if months < 0:
        months = 0
    years = months // 12
    remaining_months = months % 12
    return f'{years} ปี {remaining_months} เดือน'


@auth_bp.route("/api/hr/employees", methods=["POST"])
def hr_list_employees():
    payload = request.get_json(silent=True) or {}
    _hr_row, err = _verify_hr_credentials(payload)
    if err:
        return err[0], err[1]
    hr_email = _norm_email(payload.get("hrEmail", ""))

    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT
              id,
              email,
              employee_code,
              display_name AS fullName,
              start_work_date,
              appointment_date,
              accumulated_savings
            FROM employees
            WHERE lower(email) != lower(?)
            ORDER BY id DESC
            """,
            (hr_email,),
        )
        rows = cur.fetchall()

    employees = []
    for r in rows:
        emp_id = r["id"]
        employee_code = (r["employee_code"] or '').strip() or f'EMP{emp_id:06d}'
        full_name = (r["fullName"] or '').strip()

        start_work_date = (r["start_work_date"] or '').strip()
        appointment_date = (r["appointment_date"] or '').strip()
        savings = r["accumulated_savings"] if r["accumulated_savings"] is not None else 0

        age_work = '-'
        age_from = _parse_iso_date(appointment_date) or _parse_iso_date(start_work_date)
        if age_from:
            age_work = _format_age_work(age_from)

        def fmt_or_dash(v: str) -> str:
            return v if v else '-'

        employees.append(
            {
                "id": emp_id,
                "role": "employee",
                "employeeCode": employee_code,
                "fullName": full_name or '—',
                "startWorkDate": fmt_or_dash(start_work_date),
                "appointmentDate": fmt_or_dash(appointment_date),
                "ageWork": age_work,
                "accumulatedSavings": int(savings),
            }
        )

    return jsonify({"employees": employees}), 200


def _hr_import_pick_email_for_code(cur: sqlite3.Cursor, code: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "", _norm_email(code).replace("@", ""))[:48]
    if not slug:
        slug = "emp"
    candidate = f"{slug}@hr-import.local"
    n = 0
    while True:
        cur.execute("SELECT 1 FROM employees WHERE lower(email)=lower(?) LIMIT 1", (candidate,))
        if not cur.fetchone():
            return candidate
        n += 1
        candidate = f"{slug}_{n}@hr-import.local"


@auth_bp.route("/api/hr/employees/import", methods=["POST"])
def hr_import_employees():
    payload = request.get_json(silent=True) or {}
    _hr_row, err = _verify_hr_credentials(payload)
    if err:
        return err[0], err[1]

    rows_in = payload.get("rows")
    if not isinstance(rows_in, list):
        return jsonify({"error": "rows must be an array"}), 400

    created = 0
    updated = 0
    skipped = 0
    messages: list[str] = []

    with get_connection() as conn:
        cur = conn.cursor()
        for i, raw in enumerate(rows_in, start=1):
            if not isinstance(raw, dict):
                skipped += 1
                messages.append(f"แถว {i}: ข้าม (รูปแบบไม่ถูกต้อง)")
                continue

            role = str(raw.get("role") or "").strip().lower()
            if role in ("hr", "admin"):
                skipped += 1
                messages.append(f"แถว {i}: ข้าม role {role}")
                continue

            name = str(raw.get("displayName") or "").strip()
            code = str(raw.get("employeeCode") or "").strip()
            if not name or not code:
                skipped += 1
                messages.append(f"แถว {i}: ต้องมีชื่อ-สกุลและรหัสพนักงาน")
                continue

            start_d = str(raw.get("startWorkDate") or "").strip()
            app_d = str(raw.get("appointmentDate") or "").strip()
            try:
                savings = int(raw.get("accumulatedSavings", 0))
            except (TypeError, ValueError):
                savings = 0
            if savings < 0:
                savings = 0

            cur.execute(
                """
                SELECT id FROM employees
                WHERE lower(trim(COALESCE(employee_code, ''))) = lower(trim(?))
                LIMIT 1
                """,
                (code,),
            )
            ex = cur.fetchone()

            if ex:
                code_secret = code.strip()
                cur.execute(
                    """
                    UPDATE employees
                    SET display_name=?, start_work_date=?, appointment_date=?, accumulated_savings=?,
                        password_hash=?
                    WHERE id=?
                    """,
                    (
                        name,
                        start_d,
                        app_d,
                        savings,
                        generate_password_hash(code_secret),
                        ex["id"],
                    ),
                )
                updated += 1
            else:
                email = _hr_import_pick_email_for_code(cur, code)
                try:
                    cur.execute(
                        """
                        INSERT INTO employees (
                          email, password_hash, display_name, employee_code,
                          start_work_date, appointment_date, accumulated_savings
                        )
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            email,
                            generate_password_hash(code.strip()),
                            name,
                            code,
                            start_d,
                            app_d,
                            savings,
                        ),
                    )
                    created += 1
                except sqlite3.IntegrityError:
                    skipped += 1
                    messages.append(f"แถว {i}: บันทึกไม่สำเร็จ (อีเมล/รหัสซ้ำ)")

        conn.commit()

    return (
        jsonify(
            {
                "created": created,
                "updated": updated,
                "skipped": skipped,
                "messages": messages[:50],
            }
        ),
        200,
    )


@auth_bp.route("/api/hr/employees/update", methods=["POST"])
def hr_employee_update():
    payload = request.get_json(silent=True) or {}
    _hr_row, err = _verify_hr_credentials(payload)
    if err:
        return err[0], err[1]

    emp_id = payload.get("id", None)
    full_name = str(payload.get("fullName", "")).strip()
    start_work_date = str(payload.get("startWorkDate", "")).strip()
    appointment_date = str(payload.get("appointmentDate", "")).strip()
    accumulated_savings_raw = payload.get("accumulatedSavings", 0)

    if emp_id is None or emp_id == "":
        return jsonify({"error": "id is required"}), 400
    if not full_name:
        return jsonify({"error": "fullName is required"}), 400

    try:
        accumulated_savings = int(accumulated_savings_raw)
    except (TypeError, ValueError):
        accumulated_savings = 0
    if accumulated_savings < 0:
        accumulated_savings = 0

    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT id FROM employees WHERE id=?", (emp_id,))
        if not cur.fetchone():
            return jsonify({"error": "not found"}), 404

        cur.execute(
            """
            UPDATE employees
            SET display_name=?, start_work_date=?, appointment_date=?, accumulated_savings=?
            WHERE id=?
            """,
            (
                full_name,
                start_work_date,
                appointment_date,
                accumulated_savings,
                emp_id,
            ),
        )
        conn.commit()

    return jsonify({"message": "updated"}), 200


@auth_bp.route("/api/hr/employees/delete", methods=["POST"])
def hr_employee_delete():
    payload = request.get_json(silent=True) or {}
    hr_email = _norm_email(payload.get("hrEmail", ""))
    _hr_row, err = _verify_hr_credentials(payload)
    if err:
        return err[0], err[1]

    emp_id = payload.get("id", None)
    if emp_id is None or emp_id == "":
        return jsonify({"error": "id is required"}), 400

    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT id, email FROM employees WHERE id=?", (emp_id,))
        row = cur.fetchone()
        if not row:
            return jsonify({"error": "not found"}), 404

        # กันลบข้อมูลแถวที่ซ้ำกับ HR account ที่ใช้ล็อกอิน
        row_email = _norm_email(row["email"] or "")
        if row_email and row_email == hr_email:
            return jsonify({"error": "cannot delete HR employee record"}), 403

        cur.execute("DELETE FROM employees WHERE id=?", (emp_id,))
        conn.commit()

    return jsonify({"message": "deleted"}), 200


@auth_bp.route("/api/admin/dashboard", methods=["POST"])
def admin_dashboard():
    payload = request.get_json(silent=True) or {}
    admin_email = _norm_email(payload.get("adminEmail", ""))
    admin_password = str(payload.get("adminPassword", ""))

    if not _verify_admin(admin_email, admin_password):
        return jsonify({"error": "unauthorized"}), 401

    with get_connection() as conn:
        cur = conn.cursor()

        cur.execute(
            "SELECT COALESCE(SUM(accumulated_savings), 0) AS totalSavings, COUNT(*) AS employeeCount FROM employees"
        )
        row = cur.fetchone() or {}
        total_savings = int(row["totalSavings"] or 0)
        employee_count = int(row["employeeCount"] or 0)

        # Latest employees (latest created by id)
        cur.execute(
            """
            SELECT
              id,
              employee_code,
              display_name AS fullName,
              accumulated_savings,
              appointment_date,
              start_work_date
            FROM employees
            ORDER BY id DESC
            LIMIT 5
            """
        )
        latest_rows = cur.fetchall()

        latest = []
        for r in latest_rows:
            emp_id = r["id"]
            employee_code = (r["employee_code"] or '').strip() or f'EMP{emp_id:06d}'
            full_name = (r["fullName"] or '').strip()
            start_work_date = (r["start_work_date"] or '').strip()
            appointment_date = (r["appointment_date"] or '').strip()
            savings = r["accumulated_savings"] if r["accumulated_savings"] is not None else 0

            age_work = '-'
            age_from = _parse_iso_date(appointment_date) or _parse_iso_date(start_work_date)
            if age_from:
                age_work = _format_age_work(age_from)

            def fmt_or_dash(v: str) -> str:
                return v if v else '-'

            latest.append(
                {
                    "id": emp_id,
                    "employeeCode": employee_code,
                    "fullName": full_name,
                    "startWorkDate": fmt_or_dash(start_work_date),
                    "appointmentDate": fmt_or_dash(appointment_date),
                    "ageWork": age_work,
                    "accumulatedSavings": int(savings),
                }
            )

        # Daily series (last 7 days) based on appointment/start date
        cur.execute(
            """
            SELECT
              strftime('%Y-%m-%d', COALESCE(NULLIF(appointment_date,''), NULLIF(start_work_date,''))) AS day,
              COALESCE(SUM(accumulated_savings), 0) AS total
            FROM employees
            WHERE COALESCE(NULLIF(appointment_date,''), NULLIF(start_work_date,'')) IS NOT NULL
              AND COALESCE(NULLIF(appointment_date,''), NULLIF(start_work_date,'')) != ''
              AND date(COALESCE(NULLIF(appointment_date,''), NULLIF(start_work_date,''))) >= date('now','-6 day')
            GROUP BY day
            ORDER BY day
            """
        )
        daily_rows = cur.fetchall()
        daily_map = {r["day"]: int(r["total"] or 0) for r in daily_rows}

        today = date.today()
        daily_labels = [
            (today - timedelta(days=days_back)).isoformat() for days_back in range(6, -1, -1)
        ]
        daily_values = [daily_map.get(lbl, 0) for lbl in daily_labels]

        # Monthly series (last 6 months) based on appointment/start date
        cur.execute(
            """
            SELECT
              strftime('%Y-%m', COALESCE(NULLIF(appointment_date,''), NULLIF(start_work_date,''))) AS month,
              COALESCE(SUM(accumulated_savings), 0) AS total
            FROM employees
            WHERE COALESCE(NULLIF(appointment_date,''), NULLIF(start_work_date,'')) IS NOT NULL
              AND COALESCE(NULLIF(appointment_date,''), NULLIF(start_work_date,'')) != ''
              AND date(COALESCE(NULLIF(appointment_date,''), NULLIF(start_work_date,''))) >= date('now','-5 months')
            GROUP BY month
            ORDER BY month
            """
        )
        monthly_rows = cur.fetchall()
        monthly_map = {r["month"]: int(r["total"] or 0) for r in monthly_rows}

        # Build month labels oldest->newest
        first_month = date(today.year, today.month, 1)
        month_labels = []
        for i in range(5, -1, -1):
            # step back i months from current month start
            m = first_month.month - i
            y = first_month.year
            while m <= 0:
                m += 12
                y -= 1
            month_labels.append(f"{y:04d}-{m:02d}")
        monthly_values = [monthly_map.get(lbl, 0) for lbl in month_labels]

    return jsonify(
        {
            "totalSavings": total_savings,
            "employeeCount": employee_count,
            "latestCount": len(latest),
            "latestEmployees": latest,
            "dailySeries": {"labels": daily_labels, "values": daily_values},
            "monthlySeries": {"labels": month_labels, "values": monthly_values},
        }
    ), 200


@auth_bp.route("/api/admin/people/list", methods=["POST"])
def admin_people_list():
    payload = request.get_json(silent=True) or {}
    admin_email = _norm_email(payload.get("adminEmail", ""))
    admin_password = str(payload.get("adminPassword", ""))
    q = str(payload.get("q", "")).strip().lower()
    role_filter = str(payload.get("role", "all")).strip().lower()

    if not _verify_admin(admin_email, admin_password):
        return jsonify({"error": "unauthorized"}), 401

    allow_employee = role_filter in ("all", "employee")
    allow_hr = role_filter in ("all", "hr")

    def fmt_or_dash(v: str) -> str:
        return v if v else '-'

    people = []
    with get_connection() as conn:
        cur = conn.cursor()

        if allow_employee:
            params = []
            where = []
            if q:
                where.append(
                    "(lower(email) LIKE ? OR lower(display_name) LIKE ? OR lower(employee_code) LIKE ?)"
                )
                like = f"%{q}%"
                params.extend([like, like, like])
            where_sql = "WHERE " + " AND ".join(where) if where else ""
            cur.execute(
                f"""
                SELECT
                  id,
                  'employee' AS role,
                  email,
                  display_name AS fullName,
                  employee_code,
                  start_work_date,
                  appointment_date,
                  accumulated_savings
                FROM employees
                {where_sql}
                ORDER BY id DESC
                """,
                params,
            )
            for r in cur.fetchall():
                start_work_date = (r["start_work_date"] or '').strip()
                appointment_date = (r["appointment_date"] or '').strip()
                age_work = '-'
                age_from = _parse_iso_date(appointment_date) or _parse_iso_date(start_work_date)
                if age_from:
                    age_work = _format_age_work(age_from)

                emp_id = r["id"]
                employee_code = (r["employee_code"] or '').strip() or f'EMP{emp_id:06d}'

                people.append(
                    {
                        "id": emp_id,
                        "role": "employee",
                        "email": r["email"],
                        "displayName": (r["fullName"] or '').strip(),
                        "employeeCode": employee_code,
                        "startWorkDate": fmt_or_dash(start_work_date),
                        "appointmentDate": fmt_or_dash(appointment_date),
                        "ageWork": age_work,
                        "accumulatedSavings": int(r["accumulated_savings"] or 0),
                    }
                )

        if allow_hr:
            params = []
            where = ["approved = 1"]
            if q:
                where.append("(lower(email) LIKE ? OR lower(display_name) LIKE ?)")
                like = f"%{q}%"
                params.extend([like, like])
            where_sql = "WHERE " + " AND ".join(where)

            cur.execute(
                f"""
                SELECT
                  id,
                  'hr' AS role,
                  email,
                  display_name AS fullName,
                  NULL AS employee_code,
                  '' AS start_work_date,
                  '' AS appointment_date,
                  0 AS accumulated_savings
                FROM hr_users
                {where_sql}
                ORDER BY id DESC
                """,
                params,
            )
            for r in cur.fetchall():
                people.append(
                    {
                        "id": r["id"],
                        "role": "hr",
                        "email": r["email"],
                        "displayName": (r["fullName"] or '').strip(),
                        "employeeCode": '-',
                        "startWorkDate": '-',
                        "appointmentDate": '-',
                        "ageWork": '-',
                        "accumulatedSavings": 0,
                    }
                )

    # Normalize order newest first by id (across both tables)
    people.sort(key=lambda x: int(x["id"]), reverse=True)
    return jsonify({"people": people}), 200


@auth_bp.route("/api/admin/people/upsert", methods=["POST"])
def admin_people_upsert():
    payload = request.get_json(silent=True) or {}
    admin_email = _norm_email(payload.get("adminEmail", ""))
    admin_password = str(payload.get("adminPassword", ""))

    if not _verify_admin(admin_email, admin_password):
        return jsonify({"error": "unauthorized"}), 401

    target_role = str(payload.get("role", "employee")).strip().lower()
    if target_role not in ("employee", "hr"):
        return jsonify({"error": "invalid role"}), 400

    existing_role = str(payload.get("existingRole", "")).strip().lower()
    existing_id = payload.get("existingId", None)

    name = str(payload.get("name", "")).strip()
    email = _norm_email(payload.get("email", ""))
    password = str(payload.get("password", ""))

    start_work_date = str(payload.get("startWorkDate", "")).strip()
    appointment_date = str(payload.get("appointmentDate", "")).strip()
    accumulated_savings_raw = payload.get("accumulatedSavings", 0)
    try:
        accumulated_savings = int(accumulated_savings_raw)
    except Exception:
        accumulated_savings = 0
    if accumulated_savings < 0:
        accumulated_savings = 0

    should_update = existing_role == target_role and existing_id is not None

    if not name:
        return jsonify({"error": "name is required"}), 400
    if not email:
        return jsonify({"error": "email is required"}), 400
    if not should_update and target_role == "hr" and not password:
        return jsonify({"error": "password is required for new HR account"}), 400

    # If changing role: delete the old row first (if identifiers provided)
    with get_connection() as conn:
        cur = conn.cursor()

        if existing_role in ("employee", "hr") and existing_id and existing_role != target_role:
            if existing_role == "employee":
                cur.execute("DELETE FROM employees WHERE id=?", (existing_id,))
            else:
                cur.execute("DELETE FROM hr_users WHERE id=?", (existing_id,))

        try:
            if target_role == "employee":
                if should_update:
                    cur.execute(
                        """
                        UPDATE employees
                        SET email=?, display_name=?, start_work_date=?, appointment_date=?, accumulated_savings=?
                        WHERE id=?
                        """,
                        (
                            email,
                            name,
                            start_work_date,
                            appointment_date,
                            accumulated_savings,
                            existing_id,
                        ),
                    )
                    if password:
                        cur.execute(
                            "UPDATE employees SET password_hash=? WHERE id=?",
                            (generate_password_hash(password), existing_id),
                        )
                    else:
                        cur.execute(
                            "SELECT employee_code FROM employees WHERE id=? LIMIT 1",
                            (existing_id,),
                        )
                        cr = cur.fetchone()
                        ec = (cr["employee_code"] or "").strip() if cr else ""
                        if ec:
                            cur.execute(
                                "UPDATE employees SET password_hash=? WHERE id=?",
                                (generate_password_hash(ec), existing_id),
                            )
                else:
                    cur.execute(
                        """
                        INSERT INTO employees (email, password_hash, display_name, start_work_date, appointment_date, accumulated_savings)
                        VALUES (?, ?, ?, ?, ?, ?)
                        """,
                        (
                            email,
                            generate_password_hash("__pending__"),
                            name,
                            start_work_date,
                            appointment_date,
                            accumulated_savings,
                        ),
                    )
                    new_id = cur.lastrowid
                    emp_code = f"EMP{new_id:06d}"
                    login_secret = password.strip() if password.strip() else emp_code
                    cur.execute(
                        """
                        UPDATE employees
                        SET employee_code=?, password_hash=?
                        WHERE id=?
                        """,
                        (emp_code, generate_password_hash(login_secret), new_id),
                    )

            else:  # hr
                if should_update:
                    cur.execute(
                        """
                        UPDATE hr_users
                        SET email=?, display_name=?, approved=1
                        WHERE id=?
                        """,
                        (email, name, existing_id),
                    )
                    if password:
                        cur.execute(
                            "UPDATE hr_users SET password_hash=? WHERE id=?",
                            (generate_password_hash(password), existing_id),
                        )
                else:
                    if not password:
                        return jsonify({"error": "password is required for new account"}), 400
                    cur.execute(
                        """
                        INSERT INTO hr_users (email, password_hash, display_name, approved)
                        VALUES (?, ?, ?, 1)
                        """,
                        (email, generate_password_hash(password), name),
                    )
        except sqlite3.IntegrityError:
            return jsonify({"error": "email already exists"}), 409

        conn.commit()

    return jsonify({"message": "ok"}), 200


@auth_bp.route("/api/admin/people/delete", methods=["POST"])
def admin_people_delete():
    payload = request.get_json(silent=True) or {}
    admin_email = _norm_email(payload.get("adminEmail", ""))
    admin_password = str(payload.get("adminPassword", ""))
    role = str(payload.get("role", "")).strip().lower()
    person_id = payload.get("id", None)

    if not _verify_admin(admin_email, admin_password):
        return jsonify({"error": "unauthorized"}), 401
    if role not in ("employee", "hr"):
        return jsonify({"error": "invalid role"}), 400
    if not person_id:
        return jsonify({"error": "id is required"}), 400

    with get_connection() as conn:
        cur = conn.cursor()
        if role == "employee":
            cur.execute("DELETE FROM employees WHERE id=?", (person_id,))
        else:
            cur.execute("DELETE FROM hr_users WHERE id=?", (person_id,))
        conn.commit()

        if cur.rowcount == 0:
            return jsonify({"error": "not found"}), 404

    return jsonify({"message": "deleted"}), 200


@auth_bp.route("/api/admin/wallet/list", methods=["POST"])
def admin_wallet_list():
    payload = request.get_json(silent=True) or {}
    admin_email = _norm_email(payload.get("adminEmail", ""))
    admin_password = str(payload.get("adminPassword", ""))
    q = str(payload.get("q", "")).strip().lower()

    if not _verify_admin(admin_email, admin_password):
        return jsonify({"error": "unauthorized"}), 401

    with get_connection() as conn:
        cur = conn.cursor()

        cur.execute(
            "SELECT COALESCE(SUM(accumulated_savings), 0) AS totalSavings, COUNT(*) AS employeeCount FROM employees"
        )
        sum_row = cur.fetchone() or {}
        total_savings = int(sum_row["totalSavings"] or 0)
        employee_count = int(sum_row["employeeCount"] or 0)

        if q:
            like = f"%{q}%"
            cur.execute(
                """
                SELECT id, employee_code, display_name, accumulated_savings
                FROM employees
                WHERE lower(email) LIKE ? OR lower(display_name) LIKE ? OR lower(employee_code) LIKE ?
                ORDER BY id DESC
                """,
                (like, like, like),
            )
        else:
            cur.execute(
                """
                SELECT id, employee_code, display_name, accumulated_savings
                FROM employees
                ORDER BY id DESC
                """
            )

        rows = cur.fetchall()
        wallet_rows = []
        for r in rows:
            emp_id = r["id"]
            employee_code = (r["employee_code"] or '').strip() or f'EMP{emp_id:06d}'
            wallet_rows.append(
                {
                    "id": emp_id,
                    "employeeCode": employee_code,
                    "fullName": (r["display_name"] or '').strip() if 'display_name' in r.keys() else '',
                    "accumulatedSavings": int(r["accumulated_savings"] or 0),
                }
            )

    return jsonify({"totalSavings": total_savings, "employeeCount": employee_count, "wallet": wallet_rows}), 200


@auth_bp.route("/api/admin/wallet/adjust", methods=["POST"])
def admin_wallet_adjust():
    payload = request.get_json(silent=True) or {}
    admin_email = _norm_email(payload.get("adminEmail", ""))
    admin_password = str(payload.get("adminPassword", ""))
    employee_id = payload.get("employeeId", None)
    delta_raw = payload.get("delta", 0)

    if not _verify_admin(admin_email, admin_password):
        return jsonify({"error": "unauthorized"}), 401
    if not employee_id:
        return jsonify({"error": "employeeId is required"}), 400
    try:
        delta = int(delta_raw)
    except Exception:
        delta = 0

    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT accumulated_savings FROM employees WHERE id=? LIMIT 1",
            (employee_id,),
        )
        row = cur.fetchone()
        if not row:
            return jsonify({"error": "employee not found"}), 404

        current = int(row["accumulated_savings"] or 0)
        new_value = current + delta
        if new_value < 0:
            new_value = 0

        cur.execute(
            "UPDATE employees SET accumulated_savings=? WHERE id=?",
            (new_value, employee_id),
        )
        conn.commit()

    return jsonify({"message": "ok", "newBalance": new_value}), 200

