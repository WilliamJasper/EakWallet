import { useId } from 'react'

export type AuditLogEntry = {
  id: number
  createdAt: string
  actorRole: string
  actorLabel: string
  action: string
  entityType: string
  entityId: number | null
  summary: string
  /** จาก API wallet-audit-log (JOIN employees) — ใช้ค้นหา */
  employeeDisplayName?: string
  employeeCode?: string
  nationalId?: string
}

function actorRoleLabel(role: string): string {
  if (role === 'admin') return 'ผู้ดูแลระบบ'
  if (role === 'hr') return 'HR'
  return role || '—'
}

export function savingsHistoryActionLabel(action: string): string {
  switch (action) {
    case 'wallet_adjust':
      return 'ปรับยอด (Admin)'
    case 'excel_import':
      return 'นำเข้า Excel'
    case 'employee_update':
      return 'อัปเดตข้อมูล (HR)'
    case 'employee_upsert':
      return 'จัดการพนักงาน (Admin)'
    default:
      return action || '—'
  }
}

/** ดึงยอดก่อน/หลังจากข้อความ summary ที่ backend เขียน (เช่น 1,234 → 5,678 บาท หรือวงเล็บปรับยอด) */
export function parseWalletAuditBalances(summary: string): { prev: number | null; next: number | null } {
  const s = summary.trim()
  const parseIntTh = (chunk: string) => {
    const n = parseInt(chunk.replace(/,/g, ''), 10)
    return Number.isFinite(n) ? n : null
  }
  let m = s.match(/ยอดเงินสะสม\s+([\d,]+)\s*→\s*([\d,]+)\s*บาท/)
  if (m) {
    return { prev: parseIntTh(m[1]), next: parseIntTh(m[2]) }
  }
  m = s.match(/\(\s*([\d,]+)\s*→\s*([\d,]+)\s*\)/)
  if (m) {
    return { prev: parseIntTh(m[1]), next: parseIntTh(m[2]) }
  }
  m = s.match(/ยอดเงินสะสม\s+([\d,]+)\s*บาท/)
  if (m) {
    return { prev: null, next: parseIntTh(m[1]) }
  }
  return { prev: null, next: null }
}

export function formatWalletBaht(n: number): string {
  return `฿ ${n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function walletNewAmountTone(prev: number | null, next: number | null): 'up' | 'down' | 'same' | 'neutral' {
  if (prev === null || next === null) return 'neutral'
  if (next > prev) return 'up'
  if (next < prev) return 'down'
  return 'same'
}

function EmployeeWalletSourcePill({ entry }: { entry: AuditLogEntry }) {
  const role = (entry.actorRole || '').toLowerCase()
  const label = role === 'admin' ? 'ระบบผู้ดูแล' : role === 'hr' ? 'HR' : 'ระบบ'
  return (
    <span className="employeeWalletSourcePill">
      <svg
        className="employeeWalletSourcePillIcon"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden
      >
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
      {label}
    </span>
  )
}

/** SQLite datetime('now') / ค่าจาก backend ส่วนใหญ่เป็น UTC แต่สตริงไม่มี Z — ต้อง parse เป็น UTC แล้วค่อยแสดงตามเวลาเครื่อง (เช่น ไทย UTC+7) */
export function parseStoredAuditUtc(isoish: string): Date {
  const raw = isoish.trim()
  if (!raw) return new Date(NaN)
  let s = raw.includes('T') ? raw : raw.replace(' ', 'T')
  if (!/[zZ]$|[+-]\d{2}:?\d{2}$/.test(s)) {
    s = `${s}Z`
  }
  return new Date(s)
}

function formatWhen(isoish: string): string {
  if (!isoish) return '—'
  const d = parseStoredAuditUtc(isoish)
  if (Number.isNaN(d.getTime())) return isoish
  const datePart = d.toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
  const h = d.getHours()
  const m = d.getMinutes()
  const timePart = `${h}:${String(m).padStart(2, '0')}`
  return `${datePart} ${timePart}`
}

const THAI_MONTHS: readonly string[] = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
]

export default function AuditLogSection({
  title = 'ประวัติการแก้ไข',
  entries,
  loading,
  error,
  emptyText = 'ยังไม่มีประวัติการแก้ไข',
  className = '',
  variant = 'default',
  onClearHistory,
  clearHistoryBusy = false,
  monthFilter = 0,
  onMonthFilterChange,
  searchValue = '',
  onSearchChange,
  searchPlaceholder = 'ชื่อพนักงาน · รหัสพนักงาน · เลขบัตรประชาชน',
  listPresentation = 'default',
}: {
  title?: string
  entries: AuditLogEntry[]
  loading: boolean
  error: string | null
  emptyText?: string
  className?: string
  variant?: 'default' | 'sidebar'
  /** เคลียร์การแสดงผลในหน้านี้ (เก็บ state ในเบราว์เซอร์ ไม่ลบฐานข้อมูล) */
  onClearHistory?: () => void | Promise<void>
  clearHistoryBusy?: boolean
  /** 0 = ทุกเดือน, 1–12 = ม.ค.–ธ.ค. ตามเวลาที่เครื่องแปลงจาก createdAt */
  monthFilter?: number
  onMonthFilterChange?: (month: number) => void
  /** พิมพ์แล้วกรองทันที (ไม่มีปุ่มค้นหา) */
  searchValue?: string
  onSearchChange?: (value: string) => void
  searchPlaceholder?: string
  /** รายการแบบการ์ดสำหรับหน้าพนักงาน */
  listPresentation?: 'default' | 'employee'
}) {
  const monthLabelId = useId()
  const searchLabelId = useId()
  const isSidebar = variant === 'sidebar'
  const isEmployeeCards = listPresentation === 'employee'
  const hasHeaderTools =
    !isSidebar && (!!onClearHistory || !!onMonthFilterChange || !!onSearchChange)
  const stackMonthBelowTitle =
    isEmployeeCards && !!onMonthFilterChange && !onSearchChange
  return (
    <section
      className={[
        'auditLogSection',
        isSidebar ? 'auditLogSection--sidebar' : '',
        isEmployeeCards ? 'auditLogSection--employeeWallet' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {stackMonthBelowTitle ? (
        <div className="auditLogSectionHeader auditLogSectionHeader--employeeStack">
          <div className="auditLogSectionHeaderTopRow">
            <h2 className="auditLogSectionTitle">{title}</h2>
            {onClearHistory ? (
              <button
                type="button"
                className="auditLogClearHistoryBtn"
                onClick={() => void onClearHistory()}
                disabled={loading || clearHistoryBusy}
                aria-label="เคลียร์ประวัติ"
              >
                เคลียร์ประวัติ
              </button>
            ) : null}
          </div>
          <div className="auditLogSectionHeaderFilterRow">
            <label className="auditLogMonthFilter auditLogMonthFilter--employeeFull">
              <span className="auditLogMonthFilterLabel" id={monthLabelId}>
                เดือนที่บันทึก
              </span>
              <select
                className="auditLogMonthSelect"
                value={monthFilter}
                onChange={(e) => onMonthFilterChange!(Number(e.target.value))}
                disabled={loading}
                aria-labelledby={monthLabelId}
              >
                <option value={0}>ทุกเดือน</option>
                {THAI_MONTHS.map((name, i) => (
                  <option key={i + 1} value={i + 1}>
                    {i + 1}. {name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      ) : (
        <div
          className={[
            'auditLogSectionHeader',
            isSidebar ? 'auditLogSectionHeader--sidebar' : '',
            hasHeaderTools ? 'auditLogSectionHeader--withRefresh' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <h2 className={isSidebar ? 'auditLogSectionTitle auditLogSectionTitle--sidebar' : 'auditLogSectionTitle'}>
            {title}
          </h2>
          {hasHeaderTools ? (
            <div className="auditLogSectionHeaderTools">
              {onMonthFilterChange ? (
                <label className="auditLogMonthFilter">
                  <span className="auditLogMonthFilterLabel" id={monthLabelId}>
                    เดือนที่บันทึก
                  </span>
                  <select
                    className="auditLogMonthSelect"
                    value={monthFilter}
                    onChange={(e) => onMonthFilterChange(Number(e.target.value))}
                    disabled={loading}
                    aria-labelledby={monthLabelId}
                  >
                    <option value={0}>ทุกเดือน</option>
                    {THAI_MONTHS.map((name, i) => (
                      <option key={i + 1} value={i + 1}>
                        {i + 1}. {name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {onSearchChange ? (
                <div className="auditLogHeaderSearch">
                  <label className="auditLogHeaderSearchLabel" htmlFor={searchLabelId}>
                    ค้นหา
                  </label>
                  <input
                    id={searchLabelId}
                    type="search"
                    className="adminInput auditLogHeaderSearchInput"
                    value={searchValue}
                    onChange={(e) => onSearchChange(e.target.value)}
                    placeholder={searchPlaceholder}
                    disabled={loading}
                    autoComplete="off"
                  />
                  {searchValue.trim() ? (
                    <button
                      type="button"
                      className="adminBtn adminBtnGhost auditLogHeaderSearchClearBtn"
                      disabled={loading}
                      onClick={() => onSearchChange('')}
                    >
                      ล้างคำค้น
                    </button>
                  ) : null}
                </div>
              ) : null}
              {onClearHistory ? (
                <button
                  type="button"
                  className="auditLogClearHistoryBtn"
                  onClick={() => void onClearHistory()}
                  disabled={loading || clearHistoryBusy}
                  aria-label="เคลียร์ประวัติ"
                >
                  เคลียร์ประวัติ
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
      {error ? (
        <div
          className={`adminBanner adminBannerError auditLogBanner ${isSidebar ? 'auditLogBanner--sidebar' : ''}`.trim()}
        >
          {error}
        </div>
      ) : null}
      {loading ? (
        <p className={`adminMuted auditLogMuted ${isSidebar ? 'auditLogMuted--sidebar' : ''}`.trim()}>
          กำลังโหลดประวัติ...
        </p>
      ) : null}
      {!loading && !error && entries.length === 0 ? (
        <p className={`adminMuted auditLogMuted ${isSidebar ? 'auditLogMuted--sidebar' : ''}`.trim()}>
          {emptyText}
        </p>
      ) : null}
      {!loading && entries.length > 0 && !isEmployeeCards ? (
        <ul className={`auditLogList ${isSidebar ? 'auditLogList--sidebar' : ''}`.trim()}>
          {entries.map((e) => (
            <li key={e.id} className={`auditLogItem ${isSidebar ? 'auditLogItem--sidebar' : ''}`.trim()}>
              <div className="auditLogItemTop">
                <span className="auditLogTime">{formatWhen(e.createdAt)}</span>
                <span className="auditLogActionKind">{savingsHistoryActionLabel(e.action)}</span>
                <span className="auditLogActor">
                  {actorRoleLabel(e.actorRole)}
                  {e.actorLabel ? (
                    <span className="auditLogActorLabel"> · {e.actorLabel}</span>
                  ) : null}
                </span>
              </div>
              <div className={`auditLogSummary ${isSidebar ? 'auditLogSummary--sidebar' : ''}`.trim()}>
                {e.summary}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {!loading && entries.length > 0 && isEmployeeCards ? (
        <ul className="employeeWalletLogList">
          {entries.map((e) => {
            const { prev, next } = parseWalletAuditBalances(e.summary)
            const tone = walletNewAmountTone(prev, next)
            const toneClass =
              tone === 'up'
                ? 'employeeWalletEntryBalanceAmt--up'
                : tone === 'down'
                  ? 'employeeWalletEntryBalanceAmt--down'
                  : tone === 'same'
                    ? 'employeeWalletEntryBalanceAmt--same'
                    : 'employeeWalletEntryBalanceAmt--neutral'
            const showCompare = prev !== null && next !== null
            const showSingleAmt = !showCompare && next !== null
            return (
              <li key={e.id} className="employeeWalletEntryCard">
                <div className="employeeWalletEntryHead">
                  <span className="employeeWalletEntryTime">{formatWhen(e.createdAt)}</span>
                  <EmployeeWalletSourcePill entry={e} />
                </div>
                <div className="employeeWalletEntryTitleRow">
                  <span className="employeeWalletEntryDot" aria-hidden />
                  <span className="employeeWalletEntryTitle">{savingsHistoryActionLabel(e.action)}</span>
                </div>
                <div className="employeeWalletEntrySummaryBox">{e.summary}</div>
                {showCompare ? (
                  <div className="employeeWalletEntryBalanceRow">
                    <div className="employeeWalletEntryBalanceCol">
                      <div className="employeeWalletEntryBalanceLabel">ก่อนปรับ</div>
                      <div className="employeeWalletEntryBalanceAmt employeeWalletEntryBalanceAmt--neutral">
                        {formatWalletBaht(prev!)}
                      </div>
                    </div>
                    <div className="employeeWalletEntryArrow" aria-hidden>
                      →
                    </div>
                    <div className="employeeWalletEntryBalanceCol">
                      <div className="employeeWalletEntryBalanceLabel">หลังอัปเดต</div>
                      <div className={`employeeWalletEntryBalanceAmt ${toneClass}`}>{formatWalletBaht(next!)}</div>
                    </div>
                  </div>
                ) : null}
                {showSingleAmt ? (
                  <div className="employeeWalletEntryBalanceRow employeeWalletEntryBalanceRow--single">
                    <div className="employeeWalletEntryBalanceCol">
                      <div className="employeeWalletEntryBalanceLabel">ยอดที่บันทึก</div>
                      <div className="employeeWalletEntryBalanceAmt employeeWalletEntryBalanceAmt--up">
                        {formatWalletBaht(next!)}
                      </div>
                    </div>
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : null}
    </section>
  )
}
