import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import '../styles/pages/admin-page.css'
import AdminDashboardPanel from './admin/AdminDashboardPanel'
import AdminNotificationsPanel from './admin/AdminNotificationsPanel'
import AdminEmployeeManagementPanel from './admin/AdminEmployeeManagementPanel'
import AdminWalletPanel from './admin/AdminWalletPanel'
import { API_BASE_URL } from '../config/api'

type PendingHr = {
  id: number
  email: string
  displayName: string
}

function getAdminCreds(): { adminEmail: string; adminPassword: string } | null {
  const adminEmail = sessionStorage.getItem('adminEmail') || ''
  const adminPassword = sessionStorage.getItem('adminPassword') || ''
  if (!adminEmail || !adminPassword) return null
  return { adminEmail, adminPassword }
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
      <path d="M24 13l7 12-7 12-7-12 7-13z" fill="#ef233c" />
    </svg>
  )
}

export default function AdminPage() {
  const navigate = useNavigate()
  const [pending, setPending] = useState<PendingHr[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pendingHrActionId, setPendingHrActionId] = useState<number | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const pendingSectionRef = useRef<HTMLDivElement | null>(null)
  const [activeSection, setActiveSection] = useState<
    'dashboard' | 'notifications' | 'employee_management' | 'wallet_balance'
  >('dashboard')
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const profileMenuRef = useRef<HTMLDivElement | null>(null)

  const loadPending = useCallback(async () => {
    const creds = getAdminCreds()
    if (!creds) {
      setError('ไม่พบข้อมูลการเข้าสู่ระบบของผู้ดูแล กรุณาเข้าสู่ระบบใหม่')
      setPending([])
      setLoading(false)
      return
    }

    setError(null)
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/pending-hr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminEmail: creds.adminEmail,
          adminPassword: creds.adminPassword,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error || 'โหลดรายการไม่สำเร็จ')
        setPending([])
        return
      }
      setPending(Array.isArray(data?.pending) ? data.pending : [])
    } catch {
      setError('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้')
      setPending([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const role = localStorage.getItem('authRole') || sessionStorage.getItem('authRole')
    if (role !== 'admin') {
      navigate('/login', { replace: true })
      return
    }
    loadPending()
  }, [navigate, loadPending])

  useEffect(() => {
    if (!profileMenuOpen) return
    function onDocClick(e: MouseEvent) {
      const el = profileMenuRef.current
      if (el && !el.contains(e.target as Node)) setProfileMenuOpen(false)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [profileMenuOpen])

  async function approveOne(hrEmail: string, id: number) {
    const creds = getAdminCreds()
    if (!creds) {
      setError('ไม่พบข้อมูลการเข้าสู่ระบบของผู้ดูแล กรุณาเข้าสู่ระบบใหม่')
      return
    }

    setPendingHrActionId(id)
    setError(null)
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/approve-hr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminEmail: creds.adminEmail,
          adminPassword: creds.adminPassword,
          hrEmail,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error || 'ยืนยันไม่สำเร็จ')
        return
      }
      await loadPending()
    } catch {
      setError('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้')
    } finally {
      setPendingHrActionId(null)
    }
  }

  async function rejectOne(hrEmail: string, id: number) {
    const creds = getAdminCreds()
    if (!creds) {
      setError('ไม่พบข้อมูลการเข้าสู่ระบบของผู้ดูแล กรุณาเข้าสู่ระบบใหม่')
      return
    }

    const ok = window.confirm(
      'ปฏิเสธคำขอนี้ — ผู้สมัครจะเห็นข้อความว่าไม่ผ่านการยืนยันสิทธิ์เมื่อเข้าสู่ระบบ ต้องการดำเนินการต่อหรือไม่?'
    )
    if (!ok) return

    setPendingHrActionId(id)
    setError(null)
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/reject-hr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminEmail: creds.adminEmail,
          adminPassword: creds.adminPassword,
          hrEmail,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error || 'ยกเลิกคำขอไม่สำเร็จ')
        return
      }
      await loadPending()
    } catch {
      setError('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้')
    } finally {
      setPendingHrActionId(null)
    }
  }

  function logout() {
    localStorage.removeItem('authToken')
    localStorage.removeItem('authRole')
    sessionStorage.removeItem('authToken')
    sessionStorage.removeItem('authRole')
    sessionStorage.removeItem('adminEmail')
    sessionStorage.removeItem('adminPassword')
    navigate('/login', { replace: true })
  }

  const pendingCount = pending.length
  const adminProfile = useMemo(() => {
    const email = sessionStorage.getItem('adminEmail') || localStorage.getItem('authEmail') || ''
    const name = 'Admin'
    return { name, email }
  }, [])

  function focusPendingTable() {
    if (!pendingSectionRef.current) return
    pendingSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const headerTitle =
    activeSection === 'dashboard'
      ? 'Dashboard'
      : activeSection === 'notifications'
        ? 'ผู้ดูแลระบบ — HR รออนุมัติ'
        : activeSection === 'employee_management'
          ? 'Employee Management'
          : 'Wallet / Balance'

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
            <span className="adminSidebarRoleStripValue">Admin</span>
          </div>
        </div>

        <nav className="adminSidebarNav" aria-label="navigation">
          <div className="adminSidebarSectionLabel">MENU</div>

          <SidebarNavItem
            icon="grid"
            label="Dashboard"
            active={activeSection === 'dashboard'}
            onClick={() => setActiveSection('dashboard')}
          />
          <SidebarNavItem
            icon="users"
            label="Employee Management"
            labelClassName="adminSidebarNavLabel--singleLine"
            active={activeSection === 'employee_management'}
            onClick={() => setActiveSection('employee_management')}
          />
          <SidebarNavItem
            icon="wallet"
            label="Wallet / Balance"
            active={activeSection === 'wallet_balance'}
            onClick={() => setActiveSection('wallet_balance')}
          />

          <div className="adminSidebarDivider" />

          <div className="adminSidebarSectionLabel">ACCOUNT</div>

          <SidebarNavItem
            icon="bell"
            label="Notifications"
            rightBadge={pendingCount}
            badgeVariant="green"
            onClick={() => {
              setActiveSection('notifications')
              focusPendingTable()
              setSidebarOpen(true)
            }}
          />
          <SidebarNavItem icon="chat" label="Chat" rightBadge={8} badgeVariant="yellow" />
          <SidebarNavItem icon="settings" label="Settings" />
        </nav>

        <div className="adminSidebarBottom">
          <div className="adminProfileCard" ref={profileMenuRef}>
            <div className="adminAvatar" aria-hidden="true" />
            <div className="adminProfileText">
              <div className="adminProfileName">{adminProfile.name}</div>
              <div className="adminProfileEmail">{adminProfile.email}</div>
            </div>
            <div className="adminProfileMenuWrap">
              <button
                type="button"
                className="adminProfileKebab"
                aria-label="เมนูบัญชี"
                aria-expanded={profileMenuOpen}
                onClick={(e) => {
                  e.stopPropagation()
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
          <h1 className="adminHeaderTitle">{headerTitle}</h1>
        </header>

        {activeSection === 'notifications' && error ? (
          <div className="adminBanner adminBannerError">{error}</div>
        ) : null}

        <main className="adminMain">
          {activeSection === 'notifications' ? <div ref={pendingSectionRef} /> : null}
          {activeSection === 'dashboard' ? (
            <AdminDashboardPanel />
          ) : activeSection === 'notifications' ? (
            <AdminNotificationsPanel
              loading={loading}
              error={error}
              pending={pending}
              pendingHrActionId={pendingHrActionId}
              onRefresh={loadPending}
              onApproveOne={approveOne}
              onRejectOne={rejectOne}
            />
          ) : activeSection === 'employee_management' ? (
            <AdminEmployeeManagementPanel />
          ) : (
            <AdminWalletPanel />
          )}
        </main>
      </section>
    </div>
  )
}

function SidebarNavItem({
  icon,
  label,
  labelClassName,
  active,
  rightBadge,
  badgeVariant = 'green',
  onClick,
}: {
  icon:
    | 'grid'
    | 'box'
    | 'mail'
    | 'megaphone'
    | 'calendar'
    | 'phone'
    | 'users'
    | 'wallet'
    | 'bell'
    | 'chat'
    | 'settings'
  label: string
  labelClassName?: string
  active?: boolean
  rightBadge?: number
  badgeVariant?: 'green' | 'yellow'
  onClick?: () => void
}) {
  const hasBadge = typeof rightBadge === 'number' && rightBadge > 0
  const labelClass =
    ['adminSidebarNavLabel', labelClassName].filter(Boolean).join(' ') || 'adminSidebarNavLabel'
  return (
    <button
      type="button"
      className={`adminSidebarNavItem ${active ? 'adminSidebarNavItem--active' : ''}`}
      onClick={onClick}
    >
      <span className="adminSidebarNavIcon" aria-hidden="true">
        {renderIcon(icon)}
      </span>
      <span className={labelClass}>{label}</span>
      {hasBadge ? (
        <span className={`adminSidebarBadge adminSidebarBadge--${badgeVariant}`}>
          {rightBadge}
        </span>
      ) : null}
    </button>
  )
}

function renderIcon(
  icon:
    | 'grid'
    | 'box'
    | 'mail'
    | 'megaphone'
    | 'calendar'
    | 'phone'
    | 'users'
    | 'wallet'
    | 'bell'
    | 'chat'
    | 'settings'
) {
  // Minimal inline icons (no external deps).
  switch (icon) {
    case 'grid':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z" />
        </svg>
      )
    case 'box':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <path d="M3.3 7l8.7 5 8.7-5" />
        </svg>
      )
    case 'mail':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 4h16v16H4z" />
          <path d="M4 6l8 7 8-7" />
        </svg>
      )
    case 'megaphone':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M11 5l10 5-10 5V5z" />
          <path d="M5 10l6-5" />
          <path d="M5 14l6 5" />
        </svg>
      )
    case 'calendar':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M7 3v2M17 3v2" />
          <path d="M3 7h18" />
          <path d="M5 5h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />
        </svg>
      )
    case 'users':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      )
    case 'wallet':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 12V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5Z" />
          <path d="M21 12h-5a2 2 0 0 1 0-4h5v4Z" />
          <circle cx="16.5" cy="10" r="1" />
        </svg>
      )
    case 'phone':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.86 19.86 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.86 19.86 0 0 1 2.11 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.86.32 1.7.6 2.5a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.58-1.17a2 2 0 0 1 2.11-.45c.8.28 1.64.48 2.5.6A2 2 0 0 1 22 16.92z" />
        </svg>
      )
    case 'bell':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 7h18s-3 0-3-7" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      )
    case 'chat':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
        </svg>
      )
    case 'settings':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V22a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06A2 2 0 1 1 7.54 3.3l.06.06A1.65 1.65 0 0 0 9.42 3a1.65 1.65 0 0 0 1-1.51V2a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06A2 2 0 1 1 20.7 7.54l-.06.06A1.65 1.65 0 0 0 20.4 9.42a1.65 1.65 0 0 0 1.51 1H22a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      )
    default:
      return null
  }
}
