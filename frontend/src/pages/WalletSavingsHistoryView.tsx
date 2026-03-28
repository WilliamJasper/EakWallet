import { useCallback, useEffect, useMemo, useState } from 'react'
import AuditLogSection, { parseStoredAuditUtc, type AuditLogEntry } from '../components/AuditLogSection'
import { API_BASE_URL } from '../config/api'

const LS_PREFIX = 'eakwallet:walletHistoryMinId:v1'

function onlyDigits(s: string): string {
  return s.replace(/\D/g, '')
}

function normalizeWalletEntries(list: unknown[]): AuditLogEntry[] {
  if (!Array.isArray(list)) return []
  return list.map((raw) => {
    const x = raw as AuditLogEntry
    return {
      ...x,
      employeeDisplayName: x.employeeDisplayName ?? '',
      employeeCode: x.employeeCode ?? '',
      nationalId: x.nationalId ?? '',
    }
  })
}

function walletEntryMatchesQuery(e: AuditLogEntry, qRaw: string): boolean {
  const q = qRaw.trim().toLowerCase()
  if (!q) return true
  const hay = [
    e.summary,
    e.actorLabel,
    e.entityId != null ? String(e.entityId) : '',
    e.employeeDisplayName ?? '',
    e.employeeCode ?? '',
    e.nationalId ?? '',
  ]
    .join(' ')
    .toLowerCase()
  if (hay.includes(q)) return true
  const qd = onlyDigits(qRaw)
  if (qd.length >= 3 && onlyDigits(e.nationalId ?? '').includes(qd)) return true
  return false
}

function getEmployeeCreds(): { employeeName: string; employeeCode: string } | null {
  const employeeName = sessionStorage.getItem('employeeName') || ''
  const employeeCode = sessionStorage.getItem('employeeCode') || ''
  if (!employeeName || !employeeCode) return null
  return { employeeName, employeeCode }
}

function getHrCreds(): { hrEmail: string; hrPassword: string } | null {
  const hrEmail = sessionStorage.getItem('hrEmail') || ''
  const hrPassword = sessionStorage.getItem('hrPassword') || ''
  if (!hrEmail || !hrPassword) return null
  return { hrEmail, hrPassword }
}

function getAdminCreds(): { adminEmail: string; adminPassword: string } | null {
  const adminEmail = sessionStorage.getItem('adminEmail') || ''
  const adminPassword = sessionStorage.getItem('adminPassword') || ''
  if (!adminEmail || !adminPassword) return null
  return { adminEmail, adminPassword }
}

function storageKeyForWalletHistory(role: 'employee' | 'hr' | 'admin'): string | null {
  if (role === 'employee') {
    const c = getEmployeeCreds()
    if (!c) return null
    return `${LS_PREFIX}:emp:${encodeURIComponent(c.employeeName)}:${encodeURIComponent(c.employeeCode)}`
  }
  if (role === 'hr') {
    const c = getHrCreds()
    if (!c) return null
    return `${LS_PREFIX}:hr:${encodeURIComponent(c.hrEmail.trim().toLowerCase())}`
  }
  const c = getAdminCreds()
  if (!c) return null
  return `${LS_PREFIX}:admin:${encodeURIComponent(c.adminEmail.trim().toLowerCase())}`
}

export default function WalletSavingsHistoryView({
  role,
  employeeAvatarUrl,
  onEmployeeAvatarClick,
}: {
  role: 'employee' | 'hr' | 'admin'
  /** หน้าพนักงาน: แสดงในการ์ดหัวข้อประวัติ */
  employeeAvatarUrl?: string | null
  onEmployeeAvatarClick?: () => void
}) {
  const [rawEntries, setRawEntries] = useState<AuditLogEntry[]>([])
  const [maxAuditId, setMaxAuditId] = useState(0)
  const [minVisibleId, setMinVisibleId] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [monthFilter, setMonthFilter] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')

  const credsKey = storageKeyForWalletHistory(role)

  useEffect(() => {
    if (!credsKey) {
      setMinVisibleId(0)
      return
    }
    const raw = localStorage.getItem(credsKey)
    setMinVisibleId(raw != null && raw !== '' ? parseInt(raw, 10) || 0 : 0)
  }, [credsKey])

  const visibleEntries = useMemo(
    () => rawEntries.filter((e) => e.id > minVisibleId),
    [rawEntries, minVisibleId],
  )

  const monthFiltered = useMemo(() => {
    if (monthFilter < 1 || monthFilter > 12) return visibleEntries
    return visibleEntries.filter((e) => {
      const d = parseStoredAuditUtc(e.createdAt)
      if (Number.isNaN(d.getTime())) return false
      return d.getMonth() + 1 === monthFilter
    })
  }, [visibleEntries, monthFilter])

  const displayEntries = useMemo(() => {
    if (role === 'employee') return monthFiltered
    if (!searchQuery.trim()) return monthFiltered
    return monthFiltered.filter((e) => walletEntryMatchesQuery(e, searchQuery))
  }, [role, monthFiltered, searchQuery])

  const load = useCallback(async () => {
    let path = ''
    let body: Record<string, unknown> = {}

    if (role === 'employee') {
      const c = getEmployeeCreds()
      if (!c) {
        setError('ไม่พบข้อมูลการเข้าสู่ระบบ')
        setRawEntries([])
        setMaxAuditId(0)
        setLoading(false)
        return
      }
      path = '/api/employee/wallet-audit-log'
      body = { ...c, limit: 120 }
    } else if (role === 'hr') {
      const c = getHrCreds()
      if (!c) {
        setError('ไม่พบข้อมูลการเข้าสู่ระบบของ HR')
        setRawEntries([])
        setMaxAuditId(0)
        setLoading(false)
        return
      }
      path = '/api/hr/wallet-audit-log'
      body = { ...c, limit: 250 }
    } else {
      const c = getAdminCreds()
      if (!c) {
        setError('ไม่พบข้อมูลการเข้าสู่ระบบของผู้ดูแล')
        setRawEntries([])
        setMaxAuditId(0)
        setLoading(false)
        return
      }
      path = '/api/admin/wallet-audit-log'
      body = { ...c, limit: 400 }
    }

    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE_URL}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error || 'โหลดประวัติไม่สำเร็จ')
        setRawEntries([])
        setMaxAuditId(0)
        return
      }
      setRawEntries(normalizeWalletEntries(Array.isArray(data?.entries) ? data.entries : []))
      const mid = data?.maxAuditId
      setMaxAuditId(typeof mid === 'number' && Number.isFinite(mid) ? mid : 0)
    } catch {
      setError('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้')
      setRawEntries([])
      setMaxAuditId(0)
    } finally {
      setLoading(false)
    }
  }, [role])

  useEffect(() => {
    void load()
  }, [load])

  const clearHistory = useCallback(() => {
    const msg =
      'ซ่อนรายการประวัติในหน้านี้เท่านั้น (ข้อมูลในฐานข้อมูลยังเก็บไว้) รายการใหม่หลังจากนี้จะแสดงตามปกติ ต้องการดำเนินการต่อหรือไม่?'
    if (!window.confirm(msg)) return
    if (!credsKey) {
      setError(
        role === 'employee'
          ? 'ไม่พบข้อมูลการเข้าสู่ระบบ'
          : role === 'hr'
            ? 'ไม่พบข้อมูลการเข้าสู่ระบบของ HR'
            : 'ไม่พบข้อมูลการเข้าสู่ระบบของผู้ดูแล',
      )
      return
    }
    setError(null)
    const cap =
      rawEntries.length > 0 ? Math.max(...rawEntries.map((e) => e.id)) : maxAuditId
    localStorage.setItem(credsKey, String(cap))
    setMinVisibleId(cap)
  }, [credsKey, rawEntries, maxAuditId, role])

  const emptyListMessage = useMemo(() => {
    if (visibleEntries.length === 0) {
      return 'ยังไม่มีประวัติการนำเข้าหรือแก้ไขยอดเงินสะสมในระบบ (หรือถูกเคลียร์การแสดงผลในหน้านี้แล้ว)'
    }
    if (monthFiltered.length === 0 && monthFilter >= 1 && monthFilter <= 12) {
      return 'ไม่มีรายการในหมวดเดือนที่เลือก (ลองเลือกเดือนอื่นหรือทุกเดือน)'
    }
    if (displayEntries.length === 0 && searchQuery.trim() && role !== 'employee') {
      return 'ไม่พบรายการที่ตรงกับคำค้น (ลองชื่อ · รหัสพนักงาน · เลขบัตรประชาชน)'
    }
    return 'ยังไม่มีประวัติการนำเข้าหรือแก้ไขยอดเงินสะสมในระบบ (หรือถูกเคลียร์การแสดงผลในหน้านี้แล้ว)'
  }, [
    visibleEntries.length,
    monthFiltered.length,
    monthFilter,
    displayEntries.length,
    searchQuery,
    role,
  ])

  return (
    <div className={role === 'employee' ? 'walletSavingsHistoryWrap walletSavingsHistoryWrap--employee' : 'walletSavingsHistoryWrap'}>
      {role === 'employee' ? (
        <header className="employeeWalletPageHero">
          <div className="employeeWalletPageHeroRow">
            <div className="employeeWalletPageHeroInner">
              <h1 className="employeeWalletPageHeroTitle">ประวัติการแก้ไขยอดเงินสะสม</h1>
              <p className="employeeWalletPageHeroDesc">
                สรุปการนำเข้า Excel การแก้ไขโดย HR และการอัปเดตยอดเงินสะสม
              </p>
              <div className="employeeWalletPageHeroBadge">
                <span className="employeeWalletPageHeroBadgeDot" aria-hidden />
                บันทึกจากระบบ
              </div>
            </div>
            {onEmployeeAvatarClick ? (
              <button
                type="button"
                className="employeeWalletPageHeroAvatar"
                style={
                  employeeAvatarUrl
                    ? {
                        backgroundImage: `url(${employeeAvatarUrl})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                      }
                    : undefined
                }
                aria-label="เปลี่ยนรูปโปรไฟล์"
                title="แตะเพื่อเปลี่ยนรูปโปรไฟล์"
                onClick={onEmployeeAvatarClick}
              />
            ) : null}
          </div>
        </header>
      ) : (
        <p className="adminMuted walletSavingsHistoryHint">
          ประวัติการเปลี่ยนแปลงยอดเงินสะสม / ข้อมูลพนักงาน (นำเข้า Excel, แก้ไข HR, ปรับยอด Admin, จัดการพนักงาน){' '}
          — <strong>เคลียร์ประวัติ</strong> ซ่อนในหน้านี้เท่านั้น (ไม่ลบฐานข้อมูล); เลือกเดือนและพิมพ์ค้นหาได้ที่หัวรายการ
        </p>
      )}
      <AuditLogSection
        title="รายการเปลี่ยนแปลง"
        entries={displayEntries}
        loading={loading}
        error={error}
        emptyText={emptyListMessage}
        onClearHistory={clearHistory}
        clearHistoryBusy={false}
        monthFilter={monthFilter}
        onMonthFilterChange={setMonthFilter}
        {...(role === 'employee'
          ? {}
          : {
              searchValue: searchQuery,
              onSearchChange: setSearchQuery,
              searchPlaceholder: 'ชื่อพนักงาน · รหัสพนักงาน · เลขบัตรประชาชน',
            })}
        listPresentation={role === 'employee' ? 'employee' : 'default'}
      />
    </div>
  )
}
