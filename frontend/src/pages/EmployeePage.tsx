import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import '../styles/pages/admin-page.css'
import '../styles/pages/employee-page.css'
import { API_BASE_URL } from '../config/api'

type Me = {
  displayName: string
  employeeCode: string
  startWorkDate: string
  appointmentDate: string
  accumulatedSavings: number
}

function getEmployeeCreds(): { employeeName: string; employeeCode: string } | null {
  const employeeName = sessionStorage.getItem('employeeName') || ''
  const employeeCode = sessionStorage.getItem('employeeCode') || ''
  if (!employeeName || !employeeCode) return null
  return { employeeName, employeeCode }
}

function SidebarUserIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 21a8 8 0 1 0-16 0" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

export default function EmployeePage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [me, setMe] = useState<Me | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const profileMenuRef = useRef<HTMLDivElement | null>(null)

  const loadMe = useCallback(async () => {
    const creds = getEmployeeCreds()
    if (!creds) {
      setError('ไม่พบข้อมูลการเข้าสู่ระบบ กรุณาเข้าสู่ระบบใหม่')
      setMe(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE_URL}/api/employee/me`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(creds),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error || 'โหลดข้อมูลไม่สำเร็จ')
        setMe(null)
        return
      }
      setMe({
        displayName: data.displayName || '—',
        employeeCode: data.employeeCode || '—',
        startWorkDate: data.startWorkDate || '—',
        appointmentDate: data.appointmentDate || '—',
        accumulatedSavings: Number(data.accumulatedSavings ?? 0),
      })
    } catch {
      setError('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้')
      setMe(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const role = localStorage.getItem('authRole') || sessionStorage.getItem('authRole')
    if (role !== 'employee') {
      navigate('/login', { replace: true })
      return
    }
    loadMe()
  }, [loadMe, navigate])

  useEffect(() => {
    if (!profileMenuOpen) return
    function onDocClick(e: MouseEvent) {
      const el = profileMenuRef.current
      if (el && !el.contains(e.target as Node)) setProfileMenuOpen(false)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [profileMenuOpen])

  function logout() {
    localStorage.removeItem('authToken')
    localStorage.removeItem('authRole')
    sessionStorage.removeItem('authToken')
    sessionStorage.removeItem('authRole')
    sessionStorage.removeItem('employeeName')
    sessionStorage.removeItem('employeeCode')
    sessionStorage.removeItem('employeeId')
    navigate('/login', { replace: true })
  }

  return (
    <div className="adminPage employeePageShell">
      <aside className={`adminSidebar ${sidebarOpen ? '' : 'adminSidebar--closed'}`}>
        <div className="adminSidebarTop">
          <div className="adminBrandRow">
            <div className="adminBrandIcon" aria-hidden="true">
              <SidebarUserIcon />
            </div>
            <div className="adminBrandText">Employee Portal</div>
            <button
              type="button"
              className="adminSidebarToggle"
              onClick={() => setSidebarOpen((v) => !v)}
              aria-label={sidebarOpen ? 'ย่อเมนู' : 'ขยายเมนู'}
            >
              {sidebarOpen ? '⟨' : '⟩'}
            </button>
          </div>

          <div className="adminSidebarRoleStrip">
            <span className="adminSidebarRoleStripLabel">สถานะ</span>
            <span className="adminSidebarRoleStripValue">Employee</span>
          </div>
        </div>

        <nav className="adminSidebarNav">
          <div className="adminSidebarSectionLabel">MENU</div>
          <button type="button" className="adminSidebarNavItem adminSidebarNavItem--active">
            <span className="adminSidebarNavIcon">
              <SidebarUserIcon />
            </span>
            <span className="adminSidebarNavLabel">ข้อมูลของฉัน</span>
          </button>
        </nav>

        <div className="adminSidebarBottom">
          <div className="adminProfileCard" ref={profileMenuRef}>
            <div className="adminAvatar" />
            <div className="adminProfileText">
              <div className="adminProfileName">{me?.displayName || 'พนักงาน'}</div>
              <div className="adminProfileEmail">{me?.employeeCode || '-'}</div>
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

      <main className="adminContent">
        <header className="employeeHero">
          <div>
            <h1 className="employeeTitle">สวัสดี, {me?.displayName || 'พนักงาน'}</h1>
            <p className="employeeSubtitle">
              ตรวจสอบข้อมูลพนักงานและสถานะของคุณได้จากหน้านี้
            </p>
          </div>
          <div className="employeeHeroCode">
            <div className="employeeHeroCodeLabel">รหัสพนักงาน</div>
            <div className="employeeHeroCodeValue">{me?.employeeCode || '—'}</div>
          </div>
        </header>

        {error ? <div className="employeeBanner employeeBannerError">{error}</div> : null}

        <div className="employeeMain">
          {loading ? <p className="employeeMuted">กำลังโหลดข้อมูล...</p> : null}

          {!loading && me ? (
            <>
              <section className="employeeStatGrid">
                <article className="employeeStatCard">
                  <div className="employeeStatLabel">ยอดเงินสะสม</div>
                  <div className="employeeStatValue">{me.accumulatedSavings.toLocaleString()} บาท</div>
                </article>
                <article className="employeeStatCard">
                  <div className="employeeStatLabel">วันเริ่มงาน</div>
                  <div className="employeeStatValue">{me.startWorkDate || '—'}</div>
                </article>
                <article className="employeeStatCard">
                  <div className="employeeStatLabel">วันบรรจุ</div>
                  <div className="employeeStatValue">{me.appointmentDate || '—'}</div>
                </article>
              </section>

              <section className="employeeCard">
                <h2 className="employeeCardTitle">ข้อมูลส่วนตัว</h2>
                <dl className="employeeDl">
                  <div className="employeeDlRow">
                    <dt>ชื่อ-สกุล</dt>
                    <dd>{me.displayName}</dd>
                  </div>
                  <div className="employeeDlRow">
                    <dt>รหัสพนักงาน</dt>
                    <dd>{me.employeeCode}</dd>
                  </div>
                  <div className="employeeDlRow">
                    <dt>วันเริ่มงาน</dt>
                    <dd>{me.startWorkDate}</dd>
                  </div>
                  <div className="employeeDlRow">
                    <dt>วันบรรจุ</dt>
                    <dd>{me.appointmentDate}</dd>
                  </div>
                  <div className="employeeDlRow">
                    <dt>ยอดเงินสะสม</dt>
                    <dd>{me.accumulatedSavings.toLocaleString()} บาท</dd>
                  </div>
                </dl>
              </section>
            </>
          ) : null}
        </div>
      </main>
    </div>
  )
}
