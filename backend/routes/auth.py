import re
import sqlite3
from datetime import date, datetime, timedelta

from flask import Blueprint, jsonify, request
from werkzeug.security import check_password_hash, generate_password_hash

from db import get_connection


auth_bp = Blueprint("auth", __name__)

# ประวัติยอดเงินสะสม: ปรับผ่าน Admin, นำเข้า Excel, แก้ไข HR, จัดการพนักงานโดย Admin
_WALLET_SAVINGS_HISTORY_ACTIONS: tuple[str, ...] = (
    "wallet_adjust",
    "excel_import",
    "employee_update",
    "employee_upsert",
)

ADMIN_EMAIL = "admin@123gmail.com"
ADMIN_PASSWORD = "WilliamJasper3"


def _norm_email(value: str) -> str:
    return str(value or "").strip().lower()


def _fmt_savings_th(n: int) -> str:
    return f"{int(n):,} บาท"


def _norm_national_id_digits(value: str) -> str:
    """เลขบัตรประชาชนเปรียบเทียบแบบเหลือเฉพาะตัวเลข"""
    return re.sub(r"\D", "", str(value or "").strip())


def _norm_display_name_compare(value: str) -> str:
    """ชื่อ-สกุลเปรียบเทียบ: ตัดช่องว่างซ้ำ ตัวพิมพ์เล็ก (ส่วนอังกฤษ)"""
    return " ".join(str(value or "").split()).strip().lower()


def _squeeze_excel_cell(value: object) -> str:
    """รวมข้อความที่ Excel แตกหลายบรรทัดในหนึ่งเซลล์ (เช่น วันที่) เป็นบรรทัดเดียว"""
    s = str(value or "").strip()
    if not s:
        return ""
    return "".join(s.split())


def _audit_append(
    cur: sqlite3.Cursor,
    actor_role: str,
    actor_label: str,
    action: str,
    entity_type: str,
    entity_id: int | None,
    summary: str,
    *,
    actor_hr_user_id: int | None = None,
) -> None:
    cur.execute(
        """
        INSERT INTO audit_log (actor_role, actor_label, action, entity_type, entity_id, summary, actor_hr_user_id)
        VALUES (?,?,?,?,?,?,?)
        """,
        (
            (actor_role or "")[:32],
            (actor_label or "")[:256],
            (action or "")[:80],
            (entity_type or "")[:32],
            entity_id,
            (summary or "")[:2000],
            actor_hr_user_id,
        ),
    )


def _wallet_audit_row_to_entry(r: sqlite3.Row) -> dict:
    """แนบข้อมูลพนักงานจาก employees ให้หน้าประวัติค้นชื่อ/รหัส/เลขบัตรได้"""
    return {
        "id": r["id"],
        "createdAt": r["created_at"],
        "actorRole": r["actor_role"],
        "actorLabel": r["actor_label"],
        "action": r["action"],
        "entityType": r["entity_type"],
        "entityId": r["entity_id"],
        "summary": r["summary"],
        "employeeDisplayName": str(r["emp_display_name"] or "").strip(),
        "employeeCode": str(r["emp_employee_code"] or "").strip(),
        "nationalId": str(r["emp_national_id"] or "").strip(),
    }


def _employee_id_from_login_payload(payload: dict) -> int | None:
    name = str(payload.get("employeeName", "")).strip()
    code = str(payload.get("employeeCode", "")).strip()
    if not name or not code:
        return None
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id, password_hash
            FROM employees
            WHERE lower(trim(display_name)) = lower(trim(?))
            """,
            (name,),
        )
        for r in cur.fetchall():
            if check_password_hash(r["password_hash"], code):
                return int(r["id"])
    return None


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
            SELECT id, display_name, employee_code, national_id, start_work_date, appointment_date,
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

    nid = (row["national_id"] or "").strip()

    return (
        jsonify(
            {
                "id": emp_id,
                "displayName": (row["display_name"] or "").strip() or "—",
                "employeeCode": ec,
                "nationalId": fmt(nid),
                "startWorkDate": fmt(sw),
                "appointmentDate": fmt(ap),
                "accumulatedSavings": int(row["accumulated_savings"] or 0),
            }
        ),
        200,
    )


@auth_bp.route("/api/employee/audit-log", methods=["POST"])
def employee_audit_log():
    payload = request.get_json(silent=True) or {}
    emp_id = _employee_id_from_login_payload(payload)
    if emp_id is None:
        return jsonify({"error": "invalid credentials"}), 401
    try:
        limit = int(payload.get("limit", 50))
    except (TypeError, ValueError):
        limit = 50
    limit = max(1, min(100, limit))

    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id, created_at, actor_role, actor_label, action, entity_type, entity_id, summary
            FROM audit_log
            WHERE entity_type = 'employee' AND entity_id = ?
            ORDER BY id DESC
            LIMIT ?
            """,
            (emp_id, limit),
        )
        rows = cur.fetchall()

    entries = [
        {
            "id": r["id"],
            "createdAt": r["created_at"],
            "actorRole": r["actor_role"],
            "actorLabel": r["actor_label"],
            "action": r["action"],
            "entityType": r["entity_type"],
            "entityId": r["entity_id"],
            "summary": r["summary"],
        }
        for r in rows
    ]
    return jsonify({"entries": entries}), 200


@auth_bp.route("/api/employee/wallet-audit-log", methods=["POST"])
def employee_wallet_audit_log():
    payload = request.get_json(silent=True) or {}
    emp_id = _employee_id_from_login_payload(payload)
    if emp_id is None:
        return jsonify({"error": "invalid credentials"}), 401
    try:
        limit = int(payload.get("limit", 80))
    except (TypeError, ValueError):
        limit = 80
    limit = max(1, min(200, limit))

    _ph = ",".join("?" * len(_WALLET_SAVINGS_HISTORY_ACTIONS))
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            f"""
            SELECT
              a.id,
              a.created_at,
              a.actor_role,
              a.actor_label,
              a.action,
              a.entity_type,
              a.entity_id,
              a.summary,
              COALESCE(e.display_name, '') AS emp_display_name,
              COALESCE(e.employee_code, '') AS emp_employee_code,
              COALESCE(e.national_id, '') AS emp_national_id
            FROM audit_log a
            LEFT JOIN employees e ON a.entity_type = 'employee' AND a.entity_id = e.id
            WHERE a.entity_type = 'employee' AND a.entity_id = ?
            AND a.action IN ({_ph})
            ORDER BY a.id DESC
            LIMIT ?
            """,
            (emp_id, *_WALLET_SAVINGS_HISTORY_ACTIONS, limit),
        )
        rows = cur.fetchall()
        cur.execute(
            f"""
            SELECT COALESCE(MAX(id), 0) AS m
            FROM audit_log
            WHERE entity_type = 'employee' AND entity_id = ?
            AND action IN ({_ph})
            """,
            (emp_id, *_WALLET_SAVINGS_HISTORY_ACTIONS),
        )
        max_row = cur.fetchone()
        max_audit_id = int(max_row["m"] if max_row is not None else 0)

    entries = [_wallet_audit_row_to_entry(r) for r in rows]
    return jsonify({"entries": entries, "maxAuditId": max_audit_id}), 200


@auth_bp.route("/api/employee/wallet-audit-log/clear", methods=["POST"])
def employee_wallet_audit_log_clear():
    """คง path ไว้ให้ client เก่า — การเคลียร์จริงทำฝั่ง frontend (localStorage) ไม่ลบ audit_log"""
    payload = request.get_json(silent=True) or {}
    emp_id = _employee_id_from_login_payload(payload)
    if emp_id is None:
        return jsonify({"error": "invalid credentials"}), 401
    return jsonify({"ok": True}), 200


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
            "SELECT id, display_name FROM hr_users WHERE lower(email)=? LIMIT 1",
            (hr_email,),
        )
        hrow = cur.fetchone()
        if not hrow:
            return jsonify({"error": "hr account not found"}), 404
        cur.execute(
            "UPDATE hr_users SET approved=1 WHERE lower(email)=?",
            (hr_email,),
        )
        label = (hrow["display_name"] or hr_email or "").strip()[:200]
        _audit_append(
            cur,
            "admin",
            admin_email,
            "hr_approve",
            "hr_user",
            int(hrow["id"]),
            f"อนุมัติบัญชี HR: {label}",
        )
        conn.commit()

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
            "SELECT id, display_name FROM hr_users WHERE lower(email)=? AND approved=0 LIMIT 1",
            (hr_email,),
        )
        hrow = cur.fetchone()
        if not hrow:
            return jsonify({"error": "hr account not found or already processed"}), 404
        cur.execute(
            "UPDATE hr_users SET approved=2 WHERE lower(email)=? AND approved=0",
            (hr_email,),
        )
        label = (hrow["display_name"] or hr_email or "").strip()[:200]
        _audit_append(
            cur,
            "admin",
            admin_email,
            "hr_reject",
            "hr_user",
            int(hrow["id"]),
            f"ปฏิเสธคำขอ HR: {label}",
        )
        conn.commit()

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


@auth_bp.route("/api/hr/audit-log", methods=["POST"])
def hr_audit_log():
    payload = request.get_json(silent=True) or {}
    _hr_row, err = _verify_hr_credentials(payload)
    if err:
        return err[0], err[1]
    try:
        limit = int(payload.get("limit", 150))
    except (TypeError, ValueError):
        limit = 150
    limit = max(1, min(300, limit))

    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id, created_at, actor_role, actor_label, action, entity_type, entity_id, summary
            FROM audit_log
            ORDER BY id DESC
            LIMIT ?
            """,
            (limit,),
        )
        rows = cur.fetchall()

    entries = [
        {
            "id": r["id"],
            "createdAt": r["created_at"],
            "actorRole": r["actor_role"],
            "actorLabel": r["actor_label"],
            "action": r["action"],
            "entityType": r["entity_type"],
            "entityId": r["entity_id"],
            "summary": r["summary"],
        }
        for r in rows
    ]
    return jsonify({"entries": entries}), 200


@auth_bp.route("/api/admin/audit-log", methods=["POST"])
def admin_audit_log():
    payload = request.get_json(silent=True) or {}
    admin_email = _norm_email(payload.get("adminEmail", ""))
    admin_password = str(payload.get("adminPassword", ""))

    if not _verify_admin(admin_email, admin_password):
        return jsonify({"error": "unauthorized"}), 401
    try:
        limit = int(payload.get("limit", 250))
    except (TypeError, ValueError):
        limit = 250
    limit = max(1, min(500, limit))

    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id, created_at, actor_role, actor_label, action, entity_type, entity_id, summary
            FROM audit_log
            ORDER BY id DESC
            LIMIT ?
            """,
            (limit,),
        )
        rows = cur.fetchall()

    entries = [
        {
            "id": r["id"],
            "createdAt": r["created_at"],
            "actorRole": r["actor_role"],
            "actorLabel": r["actor_label"],
            "action": r["action"],
            "entityType": r["entity_type"],
            "entityId": r["entity_id"],
            "summary": r["summary"],
        }
        for r in rows
    ]
    return jsonify({"entries": entries}), 200


@auth_bp.route("/api/hr/wallet-audit-log", methods=["POST"])
def hr_wallet_audit_log():
    payload = request.get_json(silent=True) or {}
    _hr_row, err = _verify_hr_credentials(payload)
    if err:
        return err[0], err[1]
    try:
        limit = int(payload.get("limit", 200))
    except (TypeError, ValueError):
        limit = 200
    limit = max(1, min(400, limit))

    _ph = ",".join("?" * len(_WALLET_SAVINGS_HISTORY_ACTIONS))
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            f"""
            SELECT
              a.id,
              a.created_at,
              a.actor_role,
              a.actor_label,
              a.action,
              a.entity_type,
              a.entity_id,
              a.summary,
              COALESCE(e.display_name, '') AS emp_display_name,
              COALESCE(e.employee_code, '') AS emp_employee_code,
              COALESCE(e.national_id, '') AS emp_national_id
            FROM audit_log a
            LEFT JOIN employees e ON a.entity_type = 'employee' AND a.entity_id = e.id
            WHERE a.entity_type = 'employee'
            AND a.action IN ({_ph})
            ORDER BY a.id DESC
            LIMIT ?
            """,
            (*_WALLET_SAVINGS_HISTORY_ACTIONS, limit),
        )
        rows = cur.fetchall()
        cur.execute(
            f"""
            SELECT COALESCE(MAX(id), 0) AS m
            FROM audit_log
            WHERE entity_type = 'employee'
            AND action IN ({_ph})
            """,
            (*_WALLET_SAVINGS_HISTORY_ACTIONS,),
        )
        max_row = cur.fetchone()
        max_audit_id = int(max_row["m"] if max_row is not None else 0)

    entries = [_wallet_audit_row_to_entry(r) for r in rows]
    return jsonify({"entries": entries, "maxAuditId": max_audit_id}), 200


@auth_bp.route("/api/hr/wallet-audit-log/clear", methods=["POST"])
def hr_wallet_audit_log_clear():
    """คง path ไว้ให้ client เก่า — ไม่ลบ audit_log (เคลียร์แสดงผลที่ frontend)"""
    payload = request.get_json(silent=True) or {}
    _hr_row, err = _verify_hr_credentials(payload)
    if err:
        return err[0], err[1]
    return jsonify({"ok": True}), 200


@auth_bp.route("/api/admin/wallet-audit-log", methods=["POST"])
def admin_wallet_audit_log():
    payload = request.get_json(silent=True) or {}
    admin_email = _norm_email(payload.get("adminEmail", ""))
    admin_password = str(payload.get("adminPassword", ""))

    if not _verify_admin(admin_email, admin_password):
        return jsonify({"error": "unauthorized"}), 401
    try:
        limit = int(payload.get("limit", 300))
    except (TypeError, ValueError):
        limit = 300
    limit = max(1, min(600, limit))

    _ph = ",".join("?" * len(_WALLET_SAVINGS_HISTORY_ACTIONS))
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            f"""
            SELECT
              a.id,
              a.created_at,
              a.actor_role,
              a.actor_label,
              a.action,
              a.entity_type,
              a.entity_id,
              a.summary,
              COALESCE(e.display_name, '') AS emp_display_name,
              COALESCE(e.employee_code, '') AS emp_employee_code,
              COALESCE(e.national_id, '') AS emp_national_id
            FROM audit_log a
            LEFT JOIN employees e ON a.entity_type = 'employee' AND a.entity_id = e.id
            WHERE a.entity_type = 'employee'
            AND a.action IN ({_ph})
            ORDER BY a.id DESC
            LIMIT ?
            """,
            (*_WALLET_SAVINGS_HISTORY_ACTIONS, limit),
        )
        rows = cur.fetchall()
        cur.execute(
            f"""
            SELECT COALESCE(MAX(id), 0) AS m
            FROM audit_log
            WHERE entity_type = 'employee'
            AND action IN ({_ph})
            """,
            (*_WALLET_SAVINGS_HISTORY_ACTIONS,),
        )
        max_row = cur.fetchone()
        max_audit_id = int(max_row["m"] if max_row is not None else 0)

    entries = [_wallet_audit_row_to_entry(r) for r in rows]
    return jsonify({"entries": entries, "maxAuditId": max_audit_id}), 200


@auth_bp.route("/api/admin/wallet-audit-log/clear", methods=["POST"])
def admin_wallet_audit_log_clear():
    """คง path ไว้ให้ client เก่า — ไม่ลบ audit_log (เคลียร์แสดงผลที่ frontend)"""
    payload = request.get_json(silent=True) or {}
    admin_email = _norm_email(payload.get("adminEmail", ""))
    admin_password = str(payload.get("adminPassword", ""))

    if not _verify_admin(admin_email, admin_password):
        return jsonify({"error": "unauthorized"}), 401
    return jsonify({"ok": True}), 200


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

    _ph_audit = ",".join("?" * len(_WALLET_SAVINGS_HISTORY_ACTIONS))
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            f"""
            SELECT
              e.id,
              e.email,
              e.employee_code,
              e.national_id,
              e.display_name AS fullName,
              e.start_work_date,
              e.appointment_date,
              e.accumulated_savings,
              (
                SELECT MAX(al.created_at)
                FROM audit_log al
                WHERE al.entity_type = 'employee' AND al.entity_id = e.id
                AND al.action IN ({_ph_audit})
              ) AS last_updated_at
            FROM employees e
            WHERE lower(e.email) != lower(?)
            ORDER BY e.id DESC
            """,
            (*_WALLET_SAVINGS_HISTORY_ACTIONS, hr_email),
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

        national_id = (r["national_id"] or "").strip()
        raw_lu = r["last_updated_at"]
        last_updated_at = (
            str(raw_lu).strip()
            if raw_lu is not None and str(raw_lu).strip()
            else ""
        )

        employees.append(
            {
                "id": emp_id,
                "role": "employee",
                "employeeCode": employee_code,
                "nationalId": fmt_or_dash(national_id),
                "fullName": full_name or '—',
                "startWorkDate": fmt_or_dash(start_work_date),
                "appointmentDate": fmt_or_dash(appointment_date),
                "ageWork": age_work,
                "accumulatedSavings": int(savings),
                "lastUpdatedAt": last_updated_at,
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

    hr_email = _norm_email(str(_hr_row["email"] or ""))
    hr_user_id = int(_hr_row["id"])
    if not hr_email:
        return jsonify({"error": "invalid account"}), 400

    rows_in = payload.get("rows")
    if not isinstance(rows_in, list):
        return jsonify({"error": "rows must be an array"}), 400

    created = 0
    updated = 0
    skipped = 0
    messages: list[str] = []

    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id, accumulated_savings, display_name, national_id, employee_code
            FROM employees
            """
        )
        by_nid_name: dict[tuple[str, str], dict] = {}
        for er in cur.fetchall():
            nk = _norm_national_id_digits(er["national_id"] or "")
            mk = _norm_display_name_compare(er["display_name"] or "")
            if nk and mk:
                by_nid_name[(nk, mk)] = {
                    "id": int(er["id"]),
                    "accumulated_savings": int(er["accumulated_savings"] or 0),
                    "display_name": str(er["display_name"] or ""),
                    "national_id": str(er["national_id"] or ""),
                    "employee_code": str(er["employee_code"] or ""),
                }

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
            national_id = str(raw.get("nationalId") or "").strip()
            nid_key = _norm_national_id_digits(national_id)
            name_key = _norm_display_name_compare(name)

            if not name:
                skipped += 1
                messages.append(f"แถว {i}: ต้องมีชื่อ-สกุล")
                continue
            if not code and not nid_key:
                skipped += 1
                messages.append(
                    f"แถว {i}: ต้องมีรหัสพนักงาน หรือเลขบัตรประชาชน (ใช้คู่กับชื่อจับคู่แก้ไขยอดแบบนำเข้า)"
                )
                continue

            start_d = _squeeze_excel_cell(raw.get("startWorkDate"))
            app_d = _squeeze_excel_cell(raw.get("appointmentDate"))
            try:
                savings = int(raw.get("accumulatedSavings", 0))
            except (TypeError, ValueError):
                savings = 0
            if savings < 0:
                savings = 0

            matched_nid = (
                by_nid_name.get((nid_key, name_key))
                if nid_key and name_key
                else None
            )
            if matched_nid is not None:
                cur_sav = int(matched_nid["accumulated_savings"])
                if cur_sav == savings:
                    skipped += 1
                    messages.append(
                        f"แถว {i}: ตรงเลขบัตรประชาชนและชื่อ-สกุลแล้ว แต่ยอดเงินสะสมไม่เปลี่ยน — ไม่อัปเดต"
                    )
                    continue

                ec_out = code.strip() if code.strip() else (matched_nid.get("employee_code") or "").strip()
                if not ec_out:
                    skipped += 1
                    messages.append(
                        f"แถว {i}: จับคู่ตามเลขบัตร+ชื่อได้ แต่ไม่มีรหัสพนักงานในไฟล์และในฐานข้อมูล — ใส่รหัสใน Excel หรือให้มีรหัสในฐานข้อมูลก่อน"
                    )
                    continue

                eid = int(matched_nid["id"])
                cur.execute(
                    """
                    UPDATE employees
                    SET display_name=?, national_id=?, start_work_date=?, appointment_date=?, accumulated_savings=?,
                        password_hash=?, employee_code=?
                    WHERE id=?
                    """,
                    (
                        name,
                        national_id,
                        start_d,
                        app_d,
                        savings,
                        generate_password_hash(ec_out.strip()),
                        ec_out.strip(),
                        eid,
                    ),
                )
                updated += 1
                _audit_append(
                    cur,
                    "hr",
                    hr_email,
                    "excel_import",
                    "employee",
                    eid,
                    f"อัปเดตจาก Excel (จับคู่เลขบัตร+ชื่อ): {name[:100]} ({ec_out.strip()}) · ยอดเงินสะสม {_fmt_savings_th(savings)}",
                    actor_hr_user_id=hr_user_id,
                )
                by_nid_name.pop((nid_key, name_key), None)
                nk2 = _norm_national_id_digits(national_id)
                mk2 = _norm_display_name_compare(name)
                by_nid_name[(nk2, mk2)] = {
                    "id": eid,
                    "accumulated_savings": savings,
                    "display_name": name,
                    "national_id": national_id,
                    "employee_code": ec_out.strip(),
                }
                continue

            if not code:
                skipped += 1
                messages.append(
                    f"แถว {i}: ไม่พบพนักงานที่ตรงเลขบัตรประชาชนและชื่อ-สกุล — ตรวจสอบข้อมูล หรือใส่รหัสพนักงานเพื่อจับคู่แบบเดิม"
                )
                continue

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
                    SET display_name=?, national_id=?, start_work_date=?, appointment_date=?, accumulated_savings=?,
                        password_hash=?
                    WHERE id=?
                    """,
                    (
                        name,
                        national_id,
                        start_d,
                        app_d,
                        savings,
                        generate_password_hash(code_secret),
                        ex["id"],
                    ),
                )
                updated += 1
                _audit_append(
                    cur,
                    "hr",
                    hr_email,
                    "excel_import",
                    "employee",
                    int(ex["id"]),
                    f"อัปเดตจาก Excel: {name[:120]} ({code}) · ยอดเงินสะสม {_fmt_savings_th(savings)}",
                    actor_hr_user_id=hr_user_id,
                )
                erow = cur.execute(
                    "SELECT id, accumulated_savings, display_name, national_id, employee_code FROM employees WHERE id=?",
                    (int(ex["id"]),),
                ).fetchone()
                if erow:
                    nk = _norm_national_id_digits(erow["national_id"] or "")
                    mk = _norm_display_name_compare(erow["display_name"] or "")
                    if nk and mk:
                        by_nid_name[(nk, mk)] = {
                            "id": int(erow["id"]),
                            "accumulated_savings": int(erow["accumulated_savings"] or 0),
                            "display_name": str(erow["display_name"] or ""),
                            "national_id": str(erow["national_id"] or ""),
                            "employee_code": str(erow["employee_code"] or ""),
                        }
            else:
                email = _hr_import_pick_email_for_code(cur, code)
                try:
                    cur.execute(
                        """
                        INSERT INTO employees (
                          email, password_hash, display_name, employee_code, national_id,
                          start_work_date, appointment_date, accumulated_savings
                        )
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            email,
                            generate_password_hash(code.strip()),
                            name,
                            code,
                            national_id,
                            start_d,
                            app_d,
                            savings,
                        ),
                    )
                    created += 1
                    new_eid = int(cur.lastrowid)
                    _audit_append(
                        cur,
                        "hr",
                        hr_email,
                        "excel_import",
                        "employee",
                        new_eid,
                        f"สร้างจาก Excel: {name[:120]} ({code}) · ยอดเงินสะสม {_fmt_savings_th(savings)}",
                    )
                    nk = _norm_national_id_digits(national_id)
                    mk = _norm_display_name_compare(name)
                    if nk and mk:
                        by_nid_name[(nk, mk)] = {
                            "id": new_eid,
                            "accumulated_savings": savings,
                            "display_name": name,
                            "national_id": national_id,
                            "employee_code": code.strip(),
                        }
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

    hr_email = _norm_email(str(_hr_row["email"] or ""))
    hr_user_id = int(_hr_row["id"])
    if not hr_email:
        return jsonify({"error": "invalid account"}), 400

    emp_id = payload.get("id", None)
    full_name = str(payload.get("fullName", "")).strip()
    national_id = str(payload.get("nationalId", "")).strip()
    start_work_date = _squeeze_excel_cell(payload.get("startWorkDate"))
    appointment_date = _squeeze_excel_cell(payload.get("appointmentDate"))
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
        cur.execute(
            "SELECT id, accumulated_savings FROM employees WHERE id=?",
            (emp_id,),
        )
        prev_row = cur.fetchone()
        if not prev_row:
            return jsonify({"error": "not found"}), 404
        prev_sav = int(prev_row["accumulated_savings"] or 0)

        cur.execute(
            """
            UPDATE employees
            SET display_name=?, national_id=?, start_work_date=?, appointment_date=?, accumulated_savings=?
            WHERE id=?
            """,
            (
                full_name,
                national_id,
                start_work_date,
                appointment_date,
                accumulated_savings,
                emp_id,
            ),
        )
        _audit_append(
            cur,
            "hr",
            hr_email,
            "employee_update",
            "employee",
            int(emp_id),
            f"แก้ไขข้อมูลพนักงาน: {full_name[:140]} · ยอดเงินสะสม {prev_sav:,} → {accumulated_savings:,} บาท",
            actor_hr_user_id=hr_user_id,
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
        cur.execute("SELECT id, email, display_name FROM employees WHERE id=?", (emp_id,))
        row = cur.fetchone()
        if not row:
            return jsonify({"error": "not found"}), 404

        # กันลบข้อมูลแถวที่ซ้ำกับ HR account ที่ใช้ล็อกอิน
        row_email = _norm_email(row["email"] or "")
        if row_email and row_email == hr_email:
            return jsonify({"error": "cannot delete HR employee record"}), 403

        dname = str(row["display_name"] or "").strip()[:180]
        _audit_append(
            cur,
            "hr",
            hr_email,
            "employee_delete",
            "employee",
            int(emp_id),
            f"ลบพนักงาน: {dname or emp_id}",
        )
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
              national_id,
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
            national_id = (r["national_id"] or "").strip()

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
                    "nationalId": fmt_or_dash(national_id),
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
                    "(lower(email) LIKE ? OR lower(display_name) LIKE ? OR lower(employee_code) LIKE ? OR lower(national_id) LIKE ?)"
                )
                like = f"%{q}%"
                params.extend([like, like, like, like])
            where_sql = "WHERE " + " AND ".join(where) if where else ""
            cur.execute(
                f"""
                SELECT
                  id,
                  'employee' AS role,
                  email,
                  display_name AS fullName,
                  employee_code,
                  national_id,
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
                national_id = (r["national_id"] or "").strip()

                people.append(
                    {
                        "id": emp_id,
                        "role": "employee",
                        "email": r["email"],
                        "displayName": (r["fullName"] or '').strip(),
                        "employeeCode": employee_code,
                        "nationalId": fmt_or_dash(national_id),
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
                  '' AS national_id,
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
                        "nationalId": '-',
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

    start_work_date = _squeeze_excel_cell(payload.get("startWorkDate"))
    appointment_date = _squeeze_excel_cell(payload.get("appointmentDate"))
    national_id = str(payload.get("nationalId", "")).strip()
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
                        "SELECT accumulated_savings FROM employees WHERE id=?",
                        (existing_id,),
                    )
                    prev_emp = cur.fetchone()
                    prev_sav = int(prev_emp["accumulated_savings"] or 0) if prev_emp else 0
                    cur.execute(
                        """
                        UPDATE employees
                        SET email=?, display_name=?, national_id=?, start_work_date=?, appointment_date=?, accumulated_savings=?
                        WHERE id=?
                        """,
                        (
                            email,
                            name,
                            national_id,
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
                    _audit_append(
                        cur,
                        "admin",
                        admin_email,
                        "employee_upsert",
                        "employee",
                        int(existing_id),
                        f"อัปเดตพนักงาน: {name[:130]} ({email}) · ยอดเงินสะสม {prev_sav:,} → {accumulated_savings:,} บาท",
                    )
                else:
                    cur.execute(
                        """
                        INSERT INTO employees (email, password_hash, display_name, national_id, start_work_date, appointment_date, accumulated_savings)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            email,
                            generate_password_hash("__pending__"),
                            name,
                            national_id,
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
                    _audit_append(
                        cur,
                        "admin",
                        admin_email,
                        "employee_upsert",
                        "employee",
                        int(new_id),
                        f"เพิ่มพนักงาน: {name[:130]} ({email}) รหัส {emp_code} · ยอดเงินสะสม {_fmt_savings_th(accumulated_savings)}",
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
                    _audit_append(
                        cur,
                        "admin",
                        admin_email,
                        "hr_upsert",
                        "hr_user",
                        int(existing_id),
                        f"อัปเดตบัญชี HR: {name[:160]} ({email})",
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
                    new_hr_id = int(cur.lastrowid)
                    _audit_append(
                        cur,
                        "admin",
                        admin_email,
                        "hr_upsert",
                        "hr_user",
                        new_hr_id,
                        f"เพิ่มบัญชี HR: {name[:160]} ({email})",
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
            cur.execute(
                "SELECT display_name, email FROM employees WHERE id=? LIMIT 1",
                (person_id,),
            )
        else:
            cur.execute(
                "SELECT display_name, email FROM hr_users WHERE id=? LIMIT 1",
                (person_id,),
            )
        prow = cur.fetchone()
        if not prow:
            return jsonify({"error": "not found"}), 404
        label = str(prow["display_name"] or prow["email"] or "").strip()[:180]
        etype = "employee" if role == "employee" else "hr_user"
        _audit_append(
            cur,
            "admin",
            admin_email,
            "people_delete",
            etype,
            int(person_id),
            f"ลบ{'พนักงาน' if role == 'employee' else 'HR'}: {label}",
        )
        if role == "employee":
            cur.execute("DELETE FROM employees WHERE id=?", (person_id,))
        else:
            cur.execute("DELETE FROM hr_users WHERE id=?", (person_id,))
        conn.commit()

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
            "SELECT accumulated_savings, display_name, employee_code FROM employees WHERE id=? LIMIT 1",
            (employee_id,),
        )
        row = cur.fetchone()
        if not row:
            return jsonify({"error": "employee not found"}), 404

        current = int(row["accumulated_savings"] or 0)
        new_value = current + delta
        if new_value < 0:
            new_value = 0

        dname = str(row["display_name"] or "").strip()[:120]
        ecode = str(row["employee_code"] or "").strip()

        cur.execute(
            "UPDATE employees SET accumulated_savings=? WHERE id=?",
            (new_value, employee_id),
        )
        _audit_append(
            cur,
            "admin",
            admin_email,
            "wallet_adjust",
            "employee",
            int(employee_id),
            f"ปรับยอดเงินสะสม {delta:+,} บาท ({current:,} → {new_value:,}) — {dname or ecode or employee_id}",
        )
        conn.commit()

    return jsonify({"message": "ok", "newBalance": new_value}), 200

