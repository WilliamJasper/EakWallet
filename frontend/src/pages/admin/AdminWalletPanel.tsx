import { useCallback, useEffect, useState } from 'react'

type WalletRow = {
  id: number
  employeeCode: string
  fullName: string
  accumulatedSavings: number
}

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.toString() || 'http://localhost:5000'

function getAdminCreds(): { adminEmail: string; adminPassword: string } | null {
  const adminEmail = sessionStorage.getItem('adminEmail') || ''
  const adminPassword = sessionStorage.getItem('adminPassword') || ''
  if (!adminEmail || !adminPassword) return null
  return { adminEmail, adminPassword }
}

export default function AdminWalletPanel() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [totalSavings, setTotalSavings] = useState(0)
  const [employeeCount, setEmployeeCount] = useState(0)
  const [wallet, setWallet] = useState<WalletRow[]>([])
  const [delta, setDelta] = useState<Record<number, number>>({})

  const load = useCallback(async () => {
    const creds = getAdminCreds()
    if (!creds) {
      setError('ไม่พบข้อมูลการเข้าสู่ระบบของผู้ดูแล กรุณาเข้าสู่ระบบใหม่')
      setWallet([])
      setLoading(false)
      return
    }

    setError(null)
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/wallet/list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(creds),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error || 'โหลดข้อมูลไม่สำเร็จ')
        setWallet([])
        return
      }

      setTotalSavings(Number(data?.totalSavings || 0))
      setEmployeeCount(Number(data?.employeeCount || 0))
      setWallet(Array.isArray(data?.wallet) ? data.wallet : [])
    } catch {
      setError('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้')
      setWallet([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function adjust(employeeId: number) {
    const creds = getAdminCreds()
    if (!creds) return

    const d = Number(delta[employeeId] ?? 0)
    if (!d && d !== 0) return

    setError(null)
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/wallet/adjust`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...creds,
          employeeId,
          delta: d,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error || 'ปรับยอดไม่สำเร็จ')
        return
      }
      // refresh
      await load()
      setDelta((s) => ({ ...s, [employeeId]: 0 }))
    } catch {
      setError('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="adminSection">
      {error ? <div className="adminBanner adminBannerError">{error}</div> : null}

      {loading ? (
        <p className="adminMuted">กำลังโหลด...</p>
      ) : (
        <>
          <div className="adminDashGrid">
            <div className="adminDashCard">
              <div className="adminDashLabel">ยอดเงินรวม</div>
              <div className="adminDashValue">{totalSavings.toLocaleString()}</div>
            </div>
            <div className="adminDashCard">
              <div className="adminDashLabel">จำนวนพนักงาน</div>
              <div className="adminDashValue">{employeeCount.toLocaleString()}</div>
            </div>
            <div className="adminDashCard">
              <div className="adminDashLabel">จำนวนรายการ</div>
              <div className="adminDashValue">{wallet.length.toLocaleString()}</div>
            </div>
          </div>

          <div className="adminTableWrap" style={{ marginTop: 16 }}>
            <table className="adminTable">
              <thead>
                <tr>
                  <th>รหัสพนักงาน</th>
                  <th>ชื่อ-สกุล</th>
                  <th>ยอดเงินสะสม</th>
                  <th>ปรับยอด (+ / -)</th>
                  <th aria-label="actions" />
                </tr>
              </thead>
              <tbody>
                {wallet.map((row) => (
                  <tr key={row.id}>
                    <td>{row.employeeCode}</td>
                    <td>{row.fullName || '-'}</td>
                    <td>{row.accumulatedSavings.toLocaleString()}</td>
                    <td style={{ width: 220 }}>
                      <input
                        className="adminInput"
                        type="number"
                        value={delta[row.id] ?? 0}
                        onChange={(e) =>
                          setDelta((s) => ({
                            ...s,
                            [row.id]: Number(e.target.value),
                          }))
                        }
                      />
                    </td>
                    <td className="adminTableActions">
                      <button
                        type="button"
                        className="adminBtn adminBtnPrimary"
                        onClick={() => adjust(row.id)}
                      >
                        ปรับ
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

