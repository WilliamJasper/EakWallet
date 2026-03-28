import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import '../styles/pages/admin-page.css'
import '../styles/pages/employee-page.css'
import { API_BASE_URL } from '../config/api'
import EmployeeAvatarCropModal from '../components/EmployeeAvatarCropModal'
import WalletSavingsHistoryView from './WalletSavingsHistoryView'

type Me = {
  displayName: string
  employeeCode: string
  nationalId: string
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

function HistoryMenuIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  )
}

function MenuHamburgerIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
    </svg>
  )
}

const AVATAR_LS_PREFIX = 'eakwallet:employeeAvatar:v1:'
const AVATAR_MAX_FILE_BYTES = 1.5 * 1024 * 1024

function avatarStorageKey(employeeCode: string): string {
  return `${AVATAR_LS_PREFIX}${encodeURIComponent(employeeCode.trim())}`
}

function IdCardMiniIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M7 10h.01M7 14h6" />
      <circle cx="17" cy="10" r="1" />
    </svg>
  )
}

function MobPersonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 21a8 8 0 1 0-16 0" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

function MobFingerprintIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 10v2M9 8.5v5M15 8.5v5M6 10v3a6 6 0 0 0 12 0v-3" />
      <path d="M6 14a6 6 0 0 0 12 0" />
    </svg>
  )
}

function MobCalendarIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  )
}

function MobSealIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12l2.5 2.5L16 10" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function MobWalletIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="6" width="20" height="14" rx="2" />
      <path d="M2 10h20M16 14h.01" />
    </svg>
  )
}

export default function EmployeePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const isWalletHistory = location.pathname.includes('wallet-history')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [me, setMe] = useState<Me | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [cropModalOpen, setCropModalOpen] = useState(false)
  const [cropObjectUrl, setCropObjectUrl] = useState<string | null>(null)
  const profileMenuRef = useRef<HTMLDivElement | null>(null)
  const mobileMenuRef = useRef<HTMLDivElement | null>(null)
  const avatarFileInputRef = useRef<HTMLInputElement | null>(null)

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
        nationalId: data.nationalId || '—',
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

  useEffect(() => {
    if (!mobileMenuOpen) return
    function onDocClick(e: MouseEvent) {
      const el = mobileMenuRef.current
      if (el && !el.contains(e.target as Node)) setMobileMenuOpen(false)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [mobileMenuOpen])

  useEffect(() => {
    const creds = getEmployeeCreds()
    const code = (me?.employeeCode && me.employeeCode !== '—' ? me.employeeCode : null) || creds?.employeeCode || ''
    if (!code) {
      setAvatarUrl(null)
      return
    }
    try {
      const v = localStorage.getItem(avatarStorageKey(code))
      setAvatarUrl(v && v.startsWith('data:') ? v : null)
    } catch {
      setAvatarUrl(null)
    }
  }, [me?.employeeCode])

  useEffect(() => {
    return () => {
      setCropObjectUrl((u) => {
        if (u) URL.revokeObjectURL(u)
        return null
      })
    }
  }, [])

  function closeAvatarCropModal() {
    setCropObjectUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    setCropModalOpen(false)
  }

  function onAvatarFileSelected(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    const code = me?.employeeCode && me.employeeCode !== '—' ? me.employeeCode : getEmployeeCreds()?.employeeCode
    if (!f || !code) return
    if (!f.type.startsWith('image/')) {
      setError('กรุณาเลือกไฟล์รูปภาพ (JPEG, PNG หรือ WebP)')
      return
    }
    if (f.size > AVATAR_MAX_FILE_BYTES) {
      setError('รูปใหญ่เกิน 1.5 MB กรุณาเลือกไฟล์ที่เล็กลง')
      return
    }
    setError(null)
    setCropObjectUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return URL.createObjectURL(f)
    })
    setCropModalOpen(true)
  }

  function applyCroppedAvatar(dataUrl: string) {
    const code = me?.employeeCode && me.employeeCode !== '—' ? me.employeeCode : getEmployeeCreds()?.employeeCode
    if (!code) return
    try {
      localStorage.setItem(avatarStorageKey(code), dataUrl)
      setAvatarUrl(dataUrl)
      setError(null)
    } catch {
      setError('บันทึกรูปในเบราว์เซอร์ไม่สำเร็จ (พื้นที่เต็มหรือรูปใหญ่เกินไป)')
    }
  }

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

  const mobileMenuEnd = (
    <div className="employeeMobileTopBarPad" ref={mobileMenuRef}>
      <button
        type="button"
        className="employeeMobileMenuBtn"
        aria-label="เปิดเมนู"
        aria-expanded={mobileMenuOpen}
        onClick={(e) => {
          e.stopPropagation()
          setMobileMenuOpen((v) => !v)
        }}
      >
        <MenuHamburgerIcon />
      </button>
      {mobileMenuOpen ? (
        <div className="employeeMobileMenuDropdown" role="menu">
          <NavLink
            to="/employee"
            end
            className={({ isActive }) =>
              `employeeMobileMenuItem${isActive ? ' employeeMobileMenuItem--active' : ''}`
            }
            role="menuitem"
            onClick={() => setMobileMenuOpen(false)}
          >
            ข้อมูลส่วนตัว
          </NavLink>
          <NavLink
            to="/employee/wallet-history"
            className={({ isActive }) =>
              `employeeMobileMenuItem${isActive ? ' employeeMobileMenuItem--active' : ''}`
            }
            role="menuitem"
            onClick={() => setMobileMenuOpen(false)}
          >
            ประวัติการแก้ไขยอดเงินสะสม
          </NavLink>
          <button
            type="button"
            className="employeeMobileMenuItem"
            role="menuitem"
            onClick={() => {
              setMobileMenuOpen(false)
              logout()
            }}
          >
            ออกจากระบบ
          </button>
        </div>
      ) : null}
    </div>
  )

  return (
    <div className="adminPage employeePageShell">
      <aside className={`adminSidebar employeeSidebarDesktop ${sidebarOpen ? '' : 'adminSidebar--closed'}`}>
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
          <NavLink
            to="/employee"
            end
            className={({ isActive }) =>
              `adminSidebarNavItem ${isActive ? 'adminSidebarNavItem--active' : ''}`
            }
          >
            <span className="adminSidebarNavIcon">
              <SidebarUserIcon />
            </span>
            <span className="adminSidebarNavLabel">ข้อมูลส่วนตัว</span>
          </NavLink>
          <NavLink
            to="/employee/wallet-history"
            className={({ isActive }) =>
              `adminSidebarNavItem ${isActive ? 'adminSidebarNavItem--active' : ''}`
            }
          >
            <span className="adminSidebarNavIcon">
              <HistoryMenuIcon />
            </span>
            <span className="adminSidebarNavLabel adminSidebarNavLabel--singleLine">
              ประวัติการแก้ไขยอดเงินสะสม
            </span>
          </NavLink>
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

      <section className="adminContent employeeAdminContent">
        <input
          ref={avatarFileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="employeeAvatarFileInput"
          aria-hidden="true"
          tabIndex={-1}
          onChange={onAvatarFileSelected}
        />
        <header className="employeeMobileTopBar">
          <span className="employeeMobileTopBarSpacer" aria-hidden="true" />
          <span
            className={`employeeMobileTopBarTitle${isWalletHistory ? ' employeeMobileTopBarTitle--history' : ''}`}
          >
            {isWalletHistory ? 'ประวัติยอดเงินสะสม' : 'Employee Portal'}
          </span>
          {mobileMenuEnd}
        </header>

        <Routes>
          <Route
            index
            element={
              <>
                <header className="employeeHero employeeDesktopDash">
                  <div>
                    <h1 className="employeeTitle">สวัสดี, {me?.displayName || 'พนักงาน'}</h1>
                    <p className="employeeSubtitle">
                      ตรวจสอบข้อมูลพนักงานและสถานะของคุณได้จากหน้านี้
                    </p>
                  </div>
                  <div className="employeeHeroCodes">
                    <div className="employeeHeroCode">
                      <div className="employeeHeroCodeLabel">รหัสพนักงาน</div>
                      <div className="employeeHeroCodeValue">{me?.employeeCode || '—'}</div>
                    </div>
                    <div className="employeeHeroCode">
                      <div className="employeeHeroCodeLabel">เลขบัตรประชาชน</div>
                      <div className="employeeHeroCodeValue">{me?.nationalId || '—'}</div>
                    </div>
                  </div>
                </header>

                {error ? <div className="employeeBanner employeeBannerError">{error}</div> : null}

                <div className="employeeMain">
                  {loading ? (
                    <p className="employeeMuted employeeMobileLoadingLine">กำลังโหลดข้อมูล...</p>
                  ) : null}

                  {!loading && me ? (
                    <>
                      <div className="employeeMobileDash" aria-label="มุมมองมือถือ">
                        <section className="employeeMobHero">
                          <div className="employeeMobHeroRow">
                            <div className="employeeMobHeroText">
                              <span className="employeeMobHeroKicker">DASHBOARD OVERVIEW</span>
                              <h1 className="employeeMobHeroGreet">สวัสดี, {me.displayName}</h1>
                              <div className="employeeMobHeroIdRow">
                                <IdCardMiniIcon />
                                <span>
                                  Employee ID: <strong>{me.employeeCode}</strong>
                                </span>
                              </div>
                              <div className="employeeMobHeroBadge">
                                <span className="employeeMobHeroDot" aria-hidden="true" />
                                ACTIVE EMPLOYEE
                              </div>
                            </div>
                            <button
                              type="button"
                              className="employeeMobHeroAvatar"
                              style={
                                avatarUrl
                                  ? {
                                      backgroundImage: `url(${avatarUrl})`,
                                      backgroundSize: 'cover',
                                      backgroundPosition: 'center',
                                    }
                                  : undefined
                              }
                              aria-label="เปลี่ยนรูปโปรไฟล์"
                              title="แตะเพื่อเปลี่ยนรูปโปรไฟล์"
                              onClick={() => avatarFileInputRef.current?.click()}
                            />
                          </div>
                          <div className="employeeMobHeroWatermark" aria-hidden="true">
                            VERIFIED SYSTEM ACCESS
                          </div>
                        </section>

                        <section className="employeeMobSavingsCard">
                          <div className="employeeMobSavingsHead">
                            <span className="employeeMobSavingsTitle">ยอดเงินสะสม</span>
                            <span className="employeeMobSavingsTrend" title="สรุปภาพรวมยอดสะสม">
                              📈 สรุปยอด
                            </span>
                          </div>
                          <div className="employeeMobSavingsAmount">
                            <span className="employeeMobSavingsNum">
                              {me.accumulatedSavings.toLocaleString()}
                            </span>
                            <span className="employeeMobSavingsUnit">บาท</span>
                          </div>
                          <div className="employeeMobBars" aria-hidden="true">
                            {[32, 48, 40, 55, 44, 38, 72].map((h, i) => (
                              <div
                                key={i}
                                className={`employeeMobBar ${i === 6 ? 'employeeMobBar--active' : ''}`}
                                style={{ height: `${h}%` }}
                              />
                            ))}
                          </div>
                        </section>

                        <div className="employeeMobDateGrid">
                          <article className="employeeMobDateCard">
                            <div className="employeeMobDateIcon employeeMobDateIcon--navy" aria-hidden="true">
                              <MobCalendarIcon />
                            </div>
                            <div className="employeeMobDateLabel">วันเริ่มงาน</div>
                            <div className="employeeMobDateValue">{me.startWorkDate || '—'}</div>
                          </article>
                          <article className="employeeMobDateCard">
                            <div className="employeeMobDateIcon employeeMobDateIcon--teal" aria-hidden="true">
                              <MobSealIcon />
                            </div>
                            <div className="employeeMobDateLabel">วันบรรจุ</div>
                            <div className="employeeMobDateValue">{me.appointmentDate || '—'}</div>
                          </article>
                        </div>

                        <section className="employeeMobProfileCard">
                          <div className="employeeMobProfileHead">
                            <h2 className="employeeMobProfileTitle">ข้อมูลส่วนตัว</h2>
                          </div>
                          <ul className="employeeMobProfileList">
                            <li className="employeeMobProfileRow">
                              <span className="employeeMobIconCircle">
                                <MobPersonIcon />
                              </span>
                              <div className="employeeMobProfileBody">
                                <span className="employeeMobProfileLabel">ชื่อ-นามสกุล</span>
                                <span className="employeeMobProfileValue employeeMobProfileValue--name">
                                  {me.displayName}
                                </span>
                              </div>
                            </li>
                            <li className="employeeMobProfileRow">
                              <span className="employeeMobIconCircle">
                                <IdCardMiniIcon />
                              </span>
                              <div className="employeeMobProfileBody">
                                <span className="employeeMobProfileLabel">รหัสพนักงาน</span>
                                <span className="employeeMobProfileValue">{me.employeeCode}</span>
                              </div>
                            </li>
                            <li className="employeeMobProfileRow">
                              <span className="employeeMobIconCircle">
                                <MobFingerprintIcon />
                              </span>
                              <div className="employeeMobProfileBody">
                                <span className="employeeMobProfileLabel">เลขบัตรประชาชน</span>
                                <span className="employeeMobProfileValue">{me.nationalId}</span>
                              </div>
                            </li>
                            <li className="employeeMobProfileRow">
                              <span className="employeeMobIconCircle">
                                <MobCalendarIcon />
                              </span>
                              <div className="employeeMobProfileBody">
                                <span className="employeeMobProfileLabel">วันเริ่มงาน</span>
                                <span className="employeeMobProfileValue">{me.startWorkDate}</span>
                              </div>
                            </li>
                            <li className="employeeMobProfileRow">
                              <span className="employeeMobIconCircle">
                                <MobSealIcon />
                              </span>
                              <div className="employeeMobProfileBody">
                                <span className="employeeMobProfileLabel">วันบรรจุ</span>
                                <span className="employeeMobProfileValue">{me.appointmentDate}</span>
                              </div>
                            </li>
                            <li className="employeeMobProfileRow">
                              <span className="employeeMobIconCircle">
                                <MobWalletIcon />
                              </span>
                              <div className="employeeMobProfileBody">
                                <span className="employeeMobProfileLabel">ยอดเงินสะสม</span>
                                <span className="employeeMobProfileValue employeeMobProfileValue--money">
                                  <strong>{me.accumulatedSavings.toLocaleString()}</strong>
                                  <span className="employeeMobThb"> THB</span>
                                </span>
                              </div>
                            </li>
                          </ul>
                        </section>
                      </div>

                      <section className="employeeStatGrid employeeDesktopDash">
                        <article className="employeeStatCard">
                          <div className="employeeStatLabel">ยอดเงินสะสม</div>
                          <div className="employeeStatValue">
                            {me.accumulatedSavings.toLocaleString()} บาท
                          </div>
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

                      <section className="employeeCard employeeDesktopDash">
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
                            <dt>เลขบัตรประชาชน</dt>
                            <dd>{me.nationalId}</dd>
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
              </>
            }
          />
          <Route
            path="wallet-history"
            element={
              <div className="employeeMain employeeMain--walletMobile">
                <WalletSavingsHistoryView
                  role="employee"
                  employeeAvatarUrl={avatarUrl}
                  onEmployeeAvatarClick={() => {
                    avatarFileInputRef.current?.click()
                  }}
                />
              </div>
            }
          />
        </Routes>
      </section>

      <EmployeeAvatarCropModal
        open={cropModalOpen}
        imageSrc={cropObjectUrl || ''}
        onClose={closeAvatarCropModal}
        onApply={applyCroppedAvatar}
        onError={(msg) => setError(msg)}
      />
    </div>
  )
}
