import { useCallback, useEffect, useMemo, useState } from 'react'

type DashboardResponse = {
  totalSavings: number
  employeeCount: number
  latestCount: number
  latestEmployees: Array<{
    id: number
    employeeCode: string
    fullName: string
    startWorkDate: string
    appointmentDate: string
    ageWork: string
    accumulatedSavings: number
  }>
  dailySeries: { labels: string[]; values: number[] }
  monthlySeries: { labels: string[]; values: number[] }
}

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.toString() || 'http://localhost:5000'

function getAdminCreds(): { adminEmail: string; adminPassword: string } | null {
  const adminEmail = sessionStorage.getItem('adminEmail') || ''
  const adminPassword = sessionStorage.getItem('adminPassword') || ''
  if (!adminEmail || !adminPassword) return null
  return { adminEmail, adminPassword }
}

function formatNumber(n: number) {
  try {
    return n.toLocaleString()
  } catch {
    return String(n)
  }
}

function Chart({
  labels,
  values,
}: {
  labels: string[]
  values: number[]
}) {
  const w = 720
  const h = 220
  const padX = 22
  const padY = 20

  const maxVal = Math.max(1, ...values)
  const n = Math.max(1, values.length)
  const stepX = n === 1 ? 0 : (w - padX * 2) / (n - 1)
  const points = values.map((v, idx) => {
    const x = padX + idx * stepX
    const y = h - padY - (v / maxVal) * (h - padY * 2)
    return `${x.toFixed(2)},${y.toFixed(2)}`
  })

  return (
    <div className="adminChartWrap">
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="220" role="img" aria-label="balance chart">
        <defs>
          <linearGradient id="adminChartFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(170,59,255,0.35)" />
            <stop offset="100%" stopColor="rgba(170,59,255,0)" />
          </linearGradient>
        </defs>

        {/* baseline */}
        <line
          x1={padX}
          y1={h - padY}
          x2={w - padX}
          y2={h - padY}
          stroke="rgba(229, 228, 231, 1)"
          strokeWidth="1"
        />

        {/* fill */}
        <polygon
          points={`${points.join(' ')} ${w - padX},${h - padY} ${padX},${h - padY}`}
          fill="url(#adminChartFill)"
        />

        {/* line */}
        <polyline
          points={points.join(' ')}
          fill="none"
          stroke="rgba(170,59,255,1)"
          strokeWidth="3"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
      <div className="adminChartLabels">
        <span>{labels[0] || '-'}</span>
        <span>{labels[labels.length - 1] || '-'}</span>
      </div>
    </div>
  )
}

export default function AdminDashboardPanel() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<DashboardResponse | null>(null)

  const [range, setRange] = useState<'daily' | 'monthly'>('daily')

  const load = useCallback(async () => {
    const creds = getAdminCreds()
    if (!creds) {
      setError('ไม่พบข้อมูลการเข้าสู่ระบบของผู้ดูแล กรุณาเข้าสู่ระบบใหม่')
      setData(null)
      setLoading(false)
      return
    }

    setError(null)
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/dashboard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(creds),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setError(json?.error || 'โหลดข้อมูลไม่สำเร็จ')
        setData(null)
        return
      }
      setData(json as DashboardResponse)
    } catch {
      setError('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const chart = useMemo(() => {
    if (!data) return { labels: [], values: [] as number[] }
    return range === 'daily'
      ? data.dailySeries
      : data.monthlySeries
  }, [data, range])

  return (
    <div className="adminSection">
      {error ? <div className="adminBanner adminBannerError">{error}</div> : null}

      {loading || !data ? (
        <p className="adminMuted">กำลังโหลด...</p>
      ) : (
        <>
          <div className="adminDashGrid">
            <div className="adminDashCard">
              <div className="adminDashLabel">ยอดเงินรวมทั้งระบบ</div>
              <div className="adminDashValue">{formatNumber(data.totalSavings)}</div>
            </div>
            <div className="adminDashCard">
              <div className="adminDashLabel">จำนวนพนักงาน</div>
              <div className="adminDashValue">{formatNumber(data.employeeCount)}</div>
            </div>
            <div className="adminDashCard">
              <div className="adminDashLabel">จำนวนรายการล่าสุด</div>
              <div className="adminDashValue">{formatNumber(data.latestCount)}</div>
            </div>
          </div>

          <div className="adminCard">
            <div className="adminCardHeaderRow">
              <div className="adminCardTitle">กราฟยอดเงินสะสม</div>
              <div className="adminTabs">
                <button
                  type="button"
                  className={`adminTabBtn ${range === 'daily' ? 'adminTabBtn--active' : ''}`}
                  onClick={() => setRange('daily')}
                >
                  รายวัน
                </button>
                <button
                  type="button"
                  className={`adminTabBtn ${range === 'monthly' ? 'adminTabBtn--active' : ''}`}
                  onClick={() => setRange('monthly')}
                >
                  รายเดือน
                </button>
              </div>
            </div>
            <Chart labels={chart.labels} values={chart.values} />
          </div>

          <div className="adminCard">
            <div className="adminCardHeaderRow">
              <div className="adminCardTitle">รายการล่าสุด</div>
            </div>
            {data.latestEmployees.length === 0 ? (
              <p className="adminMuted">ไม่มีรายการล่าสุด</p>
            ) : (
              <div className="adminTableWrap">
                <table className="adminTable">
                  <thead>
                    <tr>
                      <th>รหัสพนักงาน</th>
                      <th>ชื่อ-สกุล</th>
                      <th>ยอดเงินสะสม</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.latestEmployees.map((r) => (
                      <tr key={r.id}>
                        <td>{r.employeeCode}</td>
                        <td>{r.fullName || '-'}</td>
                        <td>{formatNumber(r.accumulatedSavings)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

