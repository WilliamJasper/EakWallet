import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, Route, Routes, useNavigate } from 'react-router-dom'
import '../styles/pages/admin-page.css'
import '../styles/pages/hr-page.css'
import { parseHrEmployeeWorkbook } from './hr/hrExcelImport'
import { API_BASE_URL } from '../config/api'
import WalletSavingsHistoryView from './WalletSavingsHistoryView'
import HrResetPasswordAlertsView from './hr/HrResetPasswordAlertsView'

type HrEmployeeRow = {
  id: number
  role: string
  employeeCode: string
  nationalId: string
  fullName: string
  startWorkDate: string
  appointmentDate: string
  accumulatedSavings: number
  status: 'Active' | 'Inactive'
  lastUpdatedAt?: string
}

function getHrCreds(): { hrEmail: string; hrPassword: string } | null {
  const hrEmail = sessionStorage.getItem('hrEmail') || ''
  const hrPassword = sessionStorage.getItem('hrPassword') || ''
  if (!hrEmail || !hrPassword) return null
  return { hrEmail, hrPassword }
}

function UsersIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

function HistoryMenuIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  )
}

function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}

function FilterIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" strokeLinejoin="round" />
    </svg>
  )
}

function HrPencilIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path
        d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function HrTrashIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M3 6h18" strokeLinecap="round" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z" strokeLinejoin="round" />
      <path d="M10 11v6M14 11v6" strokeLinecap="round" />
    </svg>
  )
}

/** ค่า created_at จาก SQLite — ต่อ Z ให้ parse เป็น UTC แล้วแสดงตามเวลาเครื่อง */
function parseStoredAuditUtc(isoish: string): Date {
  const raw = isoish.trim()
  if (!raw) return new Date(NaN)
  let s = raw.includes('T') ? raw : raw.replace(' ', 'T')
  if (!/[zZ]$|[+-]\d{2}:?\d{2}$/.test(s)) {
    s = `${s}Z`
  }
  return new Date(s)
}

function formatLastUpdatedAt(isoish: string | undefined): string {
  if (!isoish?.trim()) return '—'
  const d = parseStoredAuditUtc(isoish)
  if (Number.isNaN(d.getTime())) return '—'
  const datePart = d.toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
  const h = d.getHours()
  const m = d.getMinutes()
  const sec = d.getSeconds()
  const timePart = `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${datePart} ${timePart}`
}

function EakWalletLogo() {
  return (
    <svg width="22" height="22" viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path
        d="M10 7c-2 3-3 7-3 11 0 5 2 9 5 13l8 10c2 3 3 6 3 10 0 0-12-7-15-20-2-8-1-17 2-24z"
        fill="#0b0b0d"
      />
      <path
        d="M38 7c2 3 3 7 3 11 0 5-2 9-5 13l-8 10c-2 3-3 6-3 10 0 0 12-7 15-20 2-8 1-17-2-24z"
        fill="#0b0b0d"
      />
      <path d="M24 13l7 12-7 12-7-12 7-12z" fill="#ef233c" />
    </svg>
  )
}

export default function HrPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [employees, setEmployees] = useState<HrEmployeeRow[]>([])
  const [q, setQ] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const profileMenuRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [actionBusyId, setActionBusyId] = useState<number | null>(null)
  const [resetRequestsCount, setResetRequestsCount] = useState(0)

  const [editOpen, setEditOpen] = useState(false)
  const [editRowId, setEditRowId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<{
    fullName: string
    nationalId: string
    startWorkDate: string
    appointmentDate: string
    accumulatedSavings: number
    status: 'Active' | 'Inactive'
  }>({
    fullName: '',
    nationalId: '',
    startWorkDate: '',
    appointmentDate: '',
    accumulatedSavings: 0,
    status: 'Active',
  })

  const loadEmployees = useCallback(async () => {
    const creds = getHrCreds()
    if (!creds) {
      setError('ไม่พบข้อมูลการเข้าสู่ระบบของ HR กรุณาเข้าสู่ระบบใหม่')
      setEmployees([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE_URL}/api/hr/employees`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(creds),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(
          (typeof data?.message === 'string' && data.message) ||
            data?.error ||
            'โหลดข้อมูลไม่สำเร็จ'
        )
        setEmployees([])
        return
      }

      setEmployees(Array.isArray(data?.employees) ? data.employees : [])
    } catch {
      setError('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้')
      setEmployees([])
    } finally {
      setLoading(false)
    }
  }, [])

  const loadResetRequestsCount = useCallback(async () => {
    const creds = getHrCreds()
    if (!creds) return
    try {
      const res = await fetch(`${API_BASE_URL}/api/hr/reset-password-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(creds),
      })
      const data = await res.json().catch(() => null)
      if (res.ok && Array.isArray(data?.alerts)) {
        setResetRequestsCount(data.alerts.length)
      }
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    const role = localStorage.getItem('authRole') || sessionStorage.getItem('authRole')
    if (role !== 'hr') {
      navigate('/login', { replace: true })
      return
    }
    loadEmployees()
    loadResetRequestsCount()
  }, [loadEmployees, loadResetRequestsCount, navigate])

  // Polling for notification badge count
  useEffect(() => {
    const timer = setInterval(() => {
      loadResetRequestsCount()
    }, 30000)
    return () => clearInterval(timer)
  }, [loadResetRequestsCount])

  useEffect(() => {
    if (!profileMenuOpen) return
    function onDocClick(e: MouseEvent) {
      const el = profileMenuRef.current
      if (el && !el.contains(e.target as Node)) setProfileMenuOpen(false)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [profileMenuOpen])

  const hrProfile = useMemo(() => {
    const email = sessionStorage.getItem('hrEmail') || ''
    const displayName = sessionStorage.getItem('hrDisplayName') || ''
    const name = displayName.trim() || (email ? email.split('@')[0] : 'HR')
    return { name, email }
  }, [])

  function logout() {
    localStorage.removeItem('authToken')
    localStorage.removeItem('authRole')
    sessionStorage.removeItem('authToken')
    sessionStorage.removeItem('authRole')
    sessionStorage.removeItem('hrEmail')
    sessionStorage.removeItem('hrPassword')
    sessionStorage.removeItem('hrDisplayName')
    navigate('/login', { replace: true })
  }

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return employees
    return employees.filter((row) => {
      const hay = [
        row.role,
        row.fullName,
        row.employeeCode,
        row.nationalId,
        row.startWorkDate,
        row.appointmentDate,
        String(row.accumulatedSavings),
      ]
        .join(' ')
        .toLowerCase()
      return hay.includes(s)
    })
  }, [employees, q])

  const badgeText = useMemo(() => `${filtered.length} รายการ`, [filtered.length])
  const totalEmployees = useMemo(() => employees.length, [employees.length])
  const totalSavings = useMemo(
    () => employees.reduce((sum, row) => sum + Number(row.accumulatedSavings || 0), 0),
    [employees]
  )

  async function onExcelSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    const creds = getHrCreds()
    if (!creds) {
      setError('ไม่พบข้อมูลการเข้าสู่ระบบของ HR กรุณาเข้าสู่ระบบใหม่')
      return
    }

    setInfo(null)
    setError(null)
    setImporting(true)
    try {
      const parsed = await parseHrEmployeeWorkbook(file)
      if (!parsed.ok) {
        setError(parsed.message)
        return
      }
      const rows = parsed.rows
      console.log('📦 Excel Parsed rows:', rows.length, rows)

      const res = await fetch(`${API_BASE_URL}/api/hr/employees/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...creds, rows }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error || 'นำเข้าไม่สำเร็จ')
        return
      }

      console.log('✅ Import Success:', data)
      const parts = [
        `นำเข้าสำเร็จ (รวมข้อมูลในไฟล์: ${rows.length})`,
        `เพิ่มใหม่: ${data?.created ?? 0}`,
        `อัปเดต: ${data?.updated ?? 0}`,
      ]
      if (data?.skipped > 0) parts.push(`ข้าม: ${data.skipped}`)
      setInfo(parts.join(' · '))

      const msgs = Array.isArray(data?.messages) ? data.messages : []
      if (msgs.length > 0) {
        console.warn('⚠️ Import skip details:', msgs)
        setInfo((prev) => [prev, ...msgs.slice(0, 3)].filter(Boolean).join(' | '))
      }
      await loadEmployees()
    } catch (err) {
      console.error('❌ Import error:', err)
      setError('อ่านไฟล์หรือนำเข้าไม่สำเร็จ')
    } finally {
      setImporting(false)
    }
  }

  function openEdit(row: HrEmployeeRow) {
    setEditRowId(row.id)
    setEditForm({
      fullName: row.fullName === '—' ? '' : row.fullName,
      nationalId:
        row.nationalId === '—' || row.nationalId === '-' ? '' : row.nationalId,
      startWorkDate:
        row.startWorkDate === '—' || row.startWorkDate === '-' ? '' : row.startWorkDate,
      appointmentDate:
        row.appointmentDate === '—' || row.appointmentDate === '-' ? '' : row.appointmentDate,
      accumulatedSavings: Number(row.accumulatedSavings ?? 0),
      status: (row.status as any) || 'Active',
    })
    setEditOpen(true)
  }

  async function submitEdit() {
    const creds = getHrCreds()
    if (!creds || !editRowId) return

    if (!editForm.fullName.trim()) {
      setError('กรุณากรอกชื่อ-สกุล')
      return
    }

    setActionBusyId(editRowId)
    setError(null)
    setInfo(null)

    try {
      const res = await fetch(`${API_BASE_URL}/api/hr/employees/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...creds,
          id: editRowId,
          fullName: editForm.fullName.trim(),
          nationalId: editForm.nationalId.trim(),
          startWorkDate: editForm.startWorkDate.trim(),
          appointmentDate: editForm.appointmentDate.trim(),
          accumulatedSavings: editForm.accumulatedSavings,
          status: editForm.status,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error || 'แก้ไขไม่สำเร็จ')
        return
      }

      setEditOpen(false)
      setEditRowId(null)
      await loadEmployees()
    } catch {
      setError('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้')
    } finally {
      setActionBusyId(null)
    }
  }

  async function deleteOne(row: HrEmployeeRow) {
    const creds = getHrCreds()
    if (!creds) return

    const ok = window.confirm(`ต้องการลบพนักงาน ${row.fullName || ''} ใช่ไหม?`)
    if (!ok) return

    setActionBusyId(row.id)
    setError(null)
    setInfo(null)

    try {
      const res = await fetch(`${API_BASE_URL}/api/hr/employees/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...creds,
          id: row.id,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error || 'ลบไม่สำเร็จ')
        return
      }

      await loadEmployees()
    } catch {
      setError('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้')
    } finally {
      setActionBusyId(null)
    }
  }

  async function clearAllEmployees() {
    const creds = getHrCreds()
    if (!creds) return

    const ok = window.confirm('ต้องการลบข้อมูลพนักงานทั้งหมดใช่ไหม? การกระทำนี้ไม่สามารถย้อนกลับได้!')
    if (!ok) return

    setLoading(true)
    setError(null)
    setInfo(null)

    try {
      const res = await fetch(`${API_BASE_URL}/api/hr/employees/clear-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(creds),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error || 'ล้างข้อมูลไม่สำเร็จ')
        return
      }

      setInfo('ล้างข้อมูลพนักงานทั้งหมดแล้ว')
      await loadEmployees()
    } catch {
      setError('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="adminPage">
      <aside className={`adminSidebar ${sidebarOpen ? 'adminSidebar--open' : 'adminSidebar--closed'}`}>
        <div className="adminSidebarTop">
          <div className="adminBrandRow">
            <div className="adminBrandIcon" aria-hidden="true">
              <EakWalletLogo />
            </div>
            <div className="adminBrandText">EakWallet</div>
            <button
              type="button"
              className="adminSidebarToggle"
              onClick={() => setSidebarOpen((v) => !v)}
              aria-label="toggle sidebar"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                {sidebarOpen ? <path d="M15 18l-6-6 6-6" /> : <path d="M9 6l6 6-6 6" />}
              </svg>
            </button>
          </div>

          <div className="adminSidebarRoleStrip" aria-label="สถานะบัญชี">
            <span className="adminSidebarRoleStripLabel">สถานะ</span>
            <span className="adminSidebarRoleStripValue">HR</span>
          </div>
        </div>

        <nav className="adminSidebarNav" aria-label="navigation">
          <div className="adminSidebarSectionLabel">MENU</div>
          <NavLink
            to="/hr"
            end
            className={({ isActive }) =>
              `adminSidebarNavItem ${isActive ? 'adminSidebarNavItem--active' : ''}`
            }
          >
            <span className="adminSidebarNavIcon" aria-hidden="true">
              <UsersIcon />
            </span>
            <span className="adminSidebarNavLabel adminSidebarNavLabel--singleLine">จัดการพนักงาน</span>
          </NavLink>
          <NavLink
            to="/hr/reset-password-alerts"
            className={({ isActive }) =>
              `adminSidebarNavItem ${isActive ? 'adminSidebarNavItem--active' : ''}`
            }
          >
            <span className="adminSidebarNavIcon" aria-hidden="true">
              <BellIcon />
            </span>
            <span className="adminSidebarNavLabel adminSidebarNavLabel--singleLine">แจ้งเตือนResetPassword</span>
            {resetRequestsCount > 0 && (
              <span className="adminSidebarBadge adminSidebarBadge--red">
                {resetRequestsCount}
              </span>
            )}
          </NavLink>
          <NavLink
            to="/hr/wallet-history"
            className={({ isActive }) =>
              `adminSidebarNavItem ${isActive ? 'adminSidebarNavItem--active' : ''}`
            }
          >
            <span className="adminSidebarNavIcon" aria-hidden="true">
              <HistoryMenuIcon />
            </span>
            <span className="adminSidebarNavLabel adminSidebarNavLabel--singleLine">
              ประวัติการแก้ไขยอดเงินสะสม
            </span>
          </NavLink>
        </nav>

        <div className="adminSidebarBottom">
          <div className="adminProfileCard" ref={profileMenuRef}>
            <div className="adminAvatar" aria-hidden="true" />
            <div className="adminProfileText">
              <div className="adminProfileName">{hrProfile.name}</div>
              <div className="adminProfileEmail">{hrProfile.email || '—'}</div>
            </div>
            <div className="adminProfileMenuWrap">
              <button
                type="button"
                className="adminProfileKebab"
                aria-label="เมนูบัญชี"
                aria-expanded={profileMenuOpen}
                onClick={(ev) => {
                  ev.stopPropagation()
                  setProfileMenuOpen((v) => !v)
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="5" r="1.5" />
                  <circle cx="12" cy="12" r="1.5" />
                  <circle cx="12" cy="19" r="1.5" />
                </svg>
              </button>
              {profileMenuOpen ? (
                <div className="adminProfileDropdown" role="menu">
                  <button
                    type="button"
                    className="adminProfileDropdownItem"
                    role="menuitem"
                    onClick={() => {
                      setProfileMenuOpen(false)
                      logout()
                    }}
                  >
                    ออกจากระบบ
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </aside>

      <section className="adminContent">
        <Routes>
          <Route
            index
            element={
              <>
                <header className="adminHeader">
                  <div className="hrPageHeaderWrap">
                    <h1 className="adminHeaderTitle">จัดการพนักงาน</h1>
                    <p className="hrPageSubtle">
                      Manage corporate profiles, roles, and provident fund contributions.
                    </p>
                  </div>
                </header>

                {error ? <div className="adminBanner adminBannerError">{error}</div> : null}
                {info ? <div className="hrInfoBanner">{info}</div> : null}

                <main className="adminMain">
                  <section className="hrHeroStats">
                    <article className="hrHeroCard hrHeroCardLight">
                      <div className="hrHeroLabel">TOTAL EMPLOYEES</div>
                      <div className="hrHeroTitle">จำนวนพนักงานทั้งหมด</div>
                      <div className="hrHeroValue">{totalEmployees.toLocaleString()}</div>
                    </article>
                    <article className="hrHeroCard hrHeroCardDark">
                      <div className="hrHeroLabel">TOTAL ACCUMULATED FUNDS</div>
                      <div className="hrHeroTitle hrHeroTitleDark">ยอดเงินสะสมพนักงานทั้งหมด</div>
                      <div className="hrHeroValueDark">฿{totalSavings.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                    </article>
                  </section>

                  <div className="adminSection">
                    <div className="hrTableMeta">
                      <div className="hrTableMetaPrimary">
                        <span className="hrTableMetaHeading">Employee List</span>
                        <span className="adminMuted hrTableMetaCount">{badgeText}</span>
                        <span className="hrTableMetaDot" aria-hidden="true">
                          ·
                        </span>
                        <span>
                          แสดงผล {filtered.length.toLocaleString()} จาก {employees.length.toLocaleString()} รายการ
                        </span>
                      </div>
                      <div className="hrTableMetaTools">
                        <div className="hrSearchWrap">
                          <svg
                            className="hrSearchIcon"
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <circle cx="11" cy="11" r="7" />
                            <path d="M21 21l-4.35-4.35" />
                          </svg>
                          <input
                            className="adminInput hrSearchInput"
                            placeholder="ค้นหา role / ชื่อ / รหัสพนักงาน / เลขบัตรประชาชน / วันที่"
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                          />
                        </div>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".xlsx,.xls"
                          className="hrFileInputHidden"
                          aria-hidden="true"
                          tabIndex={-1}
                          onChange={onExcelSelected}
                        />
                        <button
                          type="button"
                          className="adminBtn adminBtnPrimary hrImportBtn"
                          disabled={importing}
                          onClick={() => fileInputRef.current?.click()}
                        >
                          {importing ? 'กำลังนำเข้า...' : 'นำเข้า Excel'}
                        </button>
                        <button
                          type="button"
                          className="adminBtn adminBtnGhost hrFilterIconBtn"
                          aria-label="ตัวกรอง"
                          title="ตัวกรอง"
                        >
                          <FilterIcon />
                        </button>
                      </div>
                    </div>

                    <div className="adminTableWrap hrTableModern">
                      <table className="adminTable">
                        <thead>
                          <tr>
                            <th>ลำดับ</th>
                            <th>Role</th>
                            <th className="hrTableThCode">รหัสพนักงาน</th>
                            <th>เลขบัตรประชาชน</th>
                            <th className="adminTableThName">ชื่อ-สกุล</th>
                            <th>ยอดเงินสะสม</th>
                            <th>สถานะ</th>
                            <th className="hrTableThLastUpdated">
                              <div className="hrTableThLastUpdatedInner">
                                <span>อัพเดทล่าสุด</span>
                                <button
                                  type="button"
                                  className="hrTableClearAllBtn"
                                  onClick={clearAllEmployees}
                                  disabled={loading || employees.length === 0}
                                >
                                  เคลียข้อมูลทั้งหมด
                                </button>
                              </div>
                            </th>
                            <th aria-label="การดำเนินการ" />
                          </tr>
                        </thead>
                        <tbody>
                          {loading ? (
                            <tr>
                              <td colSpan={9} className="hrTableStatusCell">
                                กำลังโหลด...
                              </td>
                            </tr>
                          ) : filtered.length === 0 ? (
                            <tr className="hrTableEmptyRow" aria-hidden="true">
                              <td colSpan={9} className="hrTableEmptyCell" />
                            </tr>
                          ) : (
                            filtered.map((row, idx) => (
                              <tr key={row.id}>
                                <td>{idx + 1}</td>
                                <td>{row.role}</td>
                                <td className="hrTableCodeCell">{row.employeeCode || '—'}</td>
                                <td>{row.nationalId || '—'}</td>
                                <td
                                  className="adminTableTdName"
                                  title={row.fullName?.trim() ? row.fullName : undefined}
                                >
                                  {row.fullName || '—'}
                                </td>
                                <td>{row.accumulatedSavings.toLocaleString()}</td>
                                <td>
                                  <span className={`hrStatusBadge ${row.status === 'Inactive' ? 'hrStatusBadge--inactive' : 'hrStatusBadge--active'}`}>
                                    {row.status === 'Inactive' ? 'Inactive' : 'Active'}
                                  </span>
                                </td>
                                <td
                                  className="hrTableLastUpdatedCell"
                                  title={row.lastUpdatedAt?.trim() ? formatLastUpdatedAt(row.lastUpdatedAt) : undefined}
                                >
                                  {formatLastUpdatedAt(row.lastUpdatedAt)}
                                </td>
                                <td className="adminTableActions">
                                  <div className="adminRowActions hrTableRowActions">
                                    <button
                                      type="button"
                                      className="hrTableIconBtn hrTableIconBtn--edit"
                                      disabled={actionBusyId === row.id}
                                      aria-label={`แก้ไข ${row.fullName || row.employeeCode || 'พนักงาน'}`}
                                      title="แก้ไข"
                                      onClick={() => openEdit(row)}
                                    >
                                      <HrPencilIcon />
                                    </button>
                                    <button
                                      type="button"
                                      className="hrTableIconBtn hrTableIconBtn--delete"
                                      disabled={actionBusyId === row.id}
                                      aria-label={
                                        actionBusyId === row.id
                                          ? 'กำลังลบ'
                                          : `ลบ ${row.fullName || row.employeeCode || 'พนักงาน'}`
                                      }
                                      title={actionBusyId === row.id ? 'กำลังลบ...' : 'ลบ'}
                                      onClick={() => deleteOne(row)}
                                    >
                                      <HrTrashIcon />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </main>
              </>
            }
          />
          <Route
            path="reset-password-alerts"
            element={
              <>
                <header className="adminHeader">
                  <div className="hrPageHeaderWrap">
                    <h1 className="adminHeaderTitle">แจ้งเตือน Reset Password</h1>
                    <p className="hrPageSubtle">
                      หน้านี้สร้างเตรียมไว้สำหรับรับการแจ้งเตือนพนักงานที่ต้องการรีเซ็ตรหัสผ่าน
                    </p>
                  </div>
                </header>
                <main className="adminMain">
                  <HrResetPasswordAlertsView />
                </main>
              </>
            }
          />
          <Route
            path="wallet-history"
            element={
              <>
                <header className="adminHeader">
                  <div className="hrPageHeaderWrap">
                    <h1 className="adminHeaderTitle">ประวัติการแก้ไขยอดเงินสะสม</h1>
                    <p className="hrPageSubtle">
                      ตั้งแต่นำเข้า Excel แก้ไขในระบบ HR จนถึงการปรับยอดโดยผู้ดูแลระบบ — แสดงวันที่และเวลาของแต่ละรายการ
                    </p>
                  </div>
                </header>
                <main className="adminMain">
                  <WalletSavingsHistoryView role="hr" />
                </main>
              </>
            }
          />
        </Routes>
      </section>

      {editOpen ? (
        <div className="adminModalOverlay hrEditModalOverlay" role="dialog" aria-modal="true">
          <div className="adminModal">
            <div className="adminModalHeader">
              <div className="adminModalTitle">แก้ไขพนักงาน</div>
              <button
                type="button"
                className="adminModalClose"
                onClick={() => {
                  setEditOpen(false)
                  setEditRowId(null)
                }}
              >
                ปิด
              </button>
            </div>

            <div className="adminFormGrid">
              <label className="adminField">
                <div className="adminFieldLabel">ชื่อ-สกุล</div>
                <input
                  className="adminInput"
                  value={editForm.fullName}
                  onChange={(e) => setEditForm((s) => ({ ...s, fullName: e.target.value }))}
                />
              </label>

              <label className="adminField">
                <div className="adminFieldLabel">เลขบัตรประชาชน</div>
                <input
                  className="adminInput"
                  value={editForm.nationalId}
                  onChange={(e) => setEditForm((s) => ({ ...s, nationalId: e.target.value }))}
                  inputMode="numeric"
                  autoComplete="off"
                />
              </label>

              <label className="adminField">
                <div className="adminFieldLabel">ยอดเงินสะสม</div>
                <input
                  className="adminInput"
                  type="number"
                  value={editForm.accumulatedSavings}
                  onChange={(e) =>
                    setEditForm((s) => ({
                      ...s,
                      accumulatedSavings: Number(e.target.value || 0),
                    }))
                  }
                />
              </label>

              <label className="adminField">
                <div className="adminFieldLabel">วันเริ่มงาน (YYYY-MM-DD)</div>
                <input
                  className="adminInput"
                  type="date"
                  value={editForm.startWorkDate}
                  onChange={(e) =>
                    setEditForm((s) => ({ ...s, startWorkDate: e.target.value }))
                  }
                />
              </label>

              <label className="adminField">
                <div className="adminFieldLabel">วันบรรจุ (YYYY-MM-DD)</div>
                <input
                  className="adminInput"
                  type="date"
                  value={editForm.appointmentDate}
                  onChange={(e) =>
                    setEditForm((s) => ({ ...s, appointmentDate: e.target.value }))
                  }
                />
              </label>

              <label className="adminField">
                <div className="adminFieldLabel">สถานะ</div>
                <select
                  className="adminSelect"
                  value={editForm.status}
                  onChange={(e) =>
                    setEditForm((s) => ({ ...s, status: e.target.value as any }))
                  }
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </label>
            </div>

            <div className="adminModalFooter">
              <button
                type="button"
                className="adminBtn adminBtnGhost"
                onClick={() => {
                  setEditOpen(false)
                  setEditRowId(null)
                }}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                className="adminBtn adminBtnPrimary"
                disabled={!editRowId || actionBusyId === editRowId}
                onClick={submitEdit}
              >
                {actionBusyId === editRowId ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
