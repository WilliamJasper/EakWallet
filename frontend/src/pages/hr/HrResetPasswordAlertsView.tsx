import { useState, useEffect, useCallback } from 'react'
import { API_BASE_URL } from '../../config/api'

type ResetRequestRow = {
  id: number
  employeeId: number
  role: string
  employeeCode: string
  nationalId: string
  fullName: string
  requestDate: string
}

function getHrCreds(): { hrEmail: string; hrPassword: string } | null {
  const hrEmail = sessionStorage.getItem('hrEmail') || ''
  const hrPassword = sessionStorage.getItem('hrPassword') || ''
  if (!hrEmail || !hrPassword) return null
  return { hrEmail, hrPassword }
}

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

export default function HrResetPasswordAlertsView() {
  const [data, setData] = useState<ResetRequestRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<number | null>(null)

  const loadRequests = useCallback(async () => {
    const creds = getHrCreds()
    if (!creds) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/hr/reset-password-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(creds)
      })
      const respData = await res.json()
      if (res.ok) {
        setData(respData.alerts || [])
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadRequests()
  }, [loadRequests])

  async function handleApprove(row: ResetRequestRow) {
    const creds = getHrCreds()
    if (!creds) return
    
    const ok = window.confirm(`ยืนยันการอนุมัติสิทธิ์ให้คุณ ${row.fullName} ตั้งรหัสผ่านใหม่ด้วยตนเอง?`)
    if (!ok) return

    setBusyId(row.id)
    try {
      const res = await fetch(`${API_BASE_URL}/api/hr/reset-employee-password/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...creds,
          requestId: row.id,
          employeeId: row.employeeId,
          newPassword: '__approved_only__' // Keep backend field but logic is changed to just update status
        })
      })
      if (!res.ok) {
        const respData = await res.json()
        alert(respData.error || 'เกิดข้อผิดพลาดในการอนุมัติ')
        return
      }
      
      setData(prev => prev.filter(item => item.id !== row.id))
      alert(`อนุมัติสิทธิ์ให้คุณ ${row.fullName} เรียบร้อยแล้ว พนักงานสามารถตั้งรหัสผ่านใหม่ได้ทันที`)
    } catch (e) {
      alert('ไม่สามารถเชื่อมต่อ Server ได้')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="adminSection">
      <div className="adminTableWrap hrTableModern">
        <table className="adminTable">
          <thead>
            <tr>
              <th>Role</th>
              <th className="hrTableThCode">รหัสพนักงาน</th>
              <th>เลขบัตรประชาชน</th>
              <th className="adminTableThName">ชื่อ-สกุล</th>
              <th>วันที่ขอ Reset Password</th>
              <th aria-label="การดำเนินการ" style={{ width: '120px', textAlign: 'center' }}>การดำเนินการ</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr className="hrTableEmptyRow" aria-hidden="true">
                <td colSpan={6} className="hrTableEmptyCell" style={{ textAlign: 'center', padding: '2rem' }}>กำลังโหลด...</td>
              </tr>
            ) : data.length === 0 ? (
              <tr className="hrTableEmptyRow" aria-hidden="true">
                <td colSpan={6} className="hrTableEmptyCell" style={{ textAlign: 'center', padding: '2rem' }}>ไม่มีรายการขอเปลี่ยนรหัสผ่าน</td>
              </tr>
            ) : (
              data.map((row) => (
                <tr key={row.id}>
                  <td>{row.role}</td>
                  <td className="hrTableCodeCell">{row.employeeCode}</td>
                  <td>{row.nationalId}</td>
                  <td className="adminTableTdName">{row.fullName}</td>
                  <td className="hrTableDateCell">{row.requestDate}</td>
                  <td className="adminTableActions" style={{ textAlign: 'center' }}>
                    <div className="adminRowActions hrTableRowActions" style={{ justifyContent: 'center', margin: '0 auto' }}>
                      <button
                        type="button"
                        className="adminBtn adminBtnPrimary"
                        style={{ 
                          background: '#059669', 
                          padding: '6px 16px', 
                          fontSize: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          height: '32px',
                          minWidth: '80px',
                          justifyContent: 'center'
                        }}
                        disabled={busyId === row.id}
                        onClick={() => handleApprove(row)}
                      >
                        <CheckIcon />
                        <span>{busyId === row.id ? '...' : 'อนุมัติ'}</span>
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
  )
}
