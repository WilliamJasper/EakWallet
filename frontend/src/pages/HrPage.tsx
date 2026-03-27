import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import '../styles/pages/admin-page.css'
import '../styles/pages/hr-page.css'
import { parseHrEmployeeWorkbook } from './hr/hrExcelImport'

type HrEmployeeRow = {
  id: number
  role: string
  employeeCode: string
  fullName: string
  startWorkDate: string
  appointmentDate: string
  accumulatedSavings: number
}

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.toString() || 'http://localhost:5000'

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

  const [editOpen, setEditOpen] = useState(false)
  const [editRowId, setEditRowId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<{
    fullName: string
    startWorkDate: string
    appointmentDate: string
    accumulatedSavings: number
  }>({
    fullName: '',
    startWorkDate: '',
    appointmentDate: '',
    accumulatedSavings: 0,
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

  useEffect(() => {
    const role = localStorage.getItem('authRole') || sessionStorage.getItem('authRole')
    if (role !== 'hr') {
      navigate('/login', { replace: true })
      return
    }
    loadEmployees()
  }, [loadEmployees, navigate])

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
      const rows = await parseHrEmployeeWorkbook(file)
      if (rows.length === 0) {
        setError('ไม่พบข้อมูลในไฟล์ (ต้องมีอย่างน้อย 1 แถวข้อมูลตั้งแต่แถวที่ 2 และคอลัมน์ A–F)')
        return
      }

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

      const parts = [
        `เพิ่ม ${data?.created ?? 0} รายการ`,
        `อัปเดต ${data?.updated ?? 0} รายการ`,
      ]
      if (data?.skipped > 0) parts.push(`ข้าม ${data.skipped} แถว`)
      setInfo(parts.join(' · '))
      const msgs = Array.isArray(data?.messages) ? data.messages : []
      if (msgs.length > 0) {
        setInfo((prev) => [prev, ...msgs.slice(0, 5)].filter(Boolean).join(' | '))
      }
      await loadEmployees()
    } catch {
      setError('อ่านไฟล์หรือนำเข้าไม่สำเร็จ')
    } finally {
      setImporting(false)
    }
  }

  function openEdit(row: HrEmployeeRow) {
    setEditRowId(row.id)
    setEditForm({
      fullName: row.fullName === '—' ? '' : row.fullName,
      startWorkDate:
        row.startWorkDate === '—' || row.startWorkDate === '-' ? '' : row.startWorkDate,
      appointmentDate:
        row.appointmentDate === '—' || row.appointmentDate === '-' ? '' : row.appointmentDate,
      accumulatedSavings: Number(row.accumulatedSavings ?? 0),
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
          startWorkDate: editForm.startWorkDate.trim(),
          appointmentDate: editForm.appointmentDate.trim(),
          accumulatedSavings: editForm.accumulatedSavings,
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
          <button type="button" className="adminSidebarNavItem adminSidebarNavItem--active">
            <span className="adminSidebarNavIcon" aria-hidden="true">
              <UsersIcon />
            </span>
            <span className="adminSidebarNavLabel adminSidebarNavLabel--singleLine">จัดการพนักงาน</span>
          </button>
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
        <header className="adminHeader">
          <h1 className="adminHeaderTitle">Employee Management</h1>
        </header>

        {error ? <div className="adminBanner adminBannerError">{error}</div> : null}
        {info ? <div className="hrInfoBanner">{info}</div> : null}

        <main className="adminMain">
          <div className="adminSection">
            <div className="adminPanelTopBar">
              <div className="adminPanelTopLeft">
                <div className="adminPanelTitle">จัดการพนักงาน</div>
                <div className="adminMuted">{badgeText}</div>
              </div>
              <div className="adminPanelTopRight">
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
                    placeholder="ค้นหา role / ชื่อ / รหัสพนักงาน / วันที่"
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
              </div>
            </div>

            <div className="adminTableWrap hrTableModern">
              <table className="adminTable">
                <thead>
                  <tr>
                    <th>Role</th>
                    <th className="adminTableThName">ชื่อ-สกุล</th>
                    <th>รหัสพนักงาน</th>
                    <th>วันเริ่มงาน</th>
                    <th>วันบรรจุ</th>
                    <th>ยอดเงินสะสม</th>
                    <th aria-label="actions" />
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="hrTableStatusCell">
                        กำลังโหลด...
                      </td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr className="hrTableEmptyRow" aria-hidden="true">
                      <td colSpan={7} className="hrTableEmptyCell" />
                    </tr>
                  ) : (
                    filtered.map((row) => (
                      <tr key={row.id}>
                        <td>{row.role}</td>
                        <td
                          className="adminTableTdName"
                          title={row.fullName?.trim() ? row.fullName : undefined}
                        >
                          {row.fullName || '—'}
                        </td>
                        <td>{row.employeeCode || '—'}</td>
                        <td>{row.startWorkDate || '—'}</td>
                        <td>{row.appointmentDate || '—'}</td>
                        <td>{row.accumulatedSavings.toLocaleString()}</td>
                        <td className="adminTableActions">
                          <div className="adminRowActions">
                            <button
                              type="button"
                              className="adminBtn adminBtnGhost"
                              disabled={actionBusyId === row.id}
                              onClick={() => openEdit(row)}
                            >
                              แก้ไข
                            </button>
                            <button
                              type="button"
                              className="adminBtn adminBtnGhost"
                              disabled={actionBusyId === row.id}
                              onClick={() => deleteOne(row)}
                            >
                              {actionBusyId === row.id ? 'กำลังลบ...' : 'ลบ'}
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
      </section>

      {editOpen ? (
        <div className="adminModalOverlay" role="dialog" aria-modal="true">
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
                  value={editForm.appointmentDate}
                  onChange={(e) =>
                    setEditForm((s) => ({ ...s, appointmentDate: e.target.value }))
                  }
                />
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
