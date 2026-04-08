import { useState, type FormEvent } from 'react'
import { useNavigate, useLocation, Navigate } from 'react-router-dom'
import TextField from '../components/auth/TextField'
import { API_BASE_URL } from '../config/api'

export default function ResetEmployeePasswordPage() {
  const navigate = useNavigate()
  const location = useLocation()
  
  // Safe extraction of routing state
  const state = location.state as any
  const loginData = state?.loginData
  const idTrimmed = state?.idTrimmed
  const currentPassword = state?.password

  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  if (!loginData || !idTrimmed || !currentPassword) {
    // If someone visits this page directly without routing state
    return <Navigate to="/login" replace />
  }

  async function onResetSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!newPassword || newPassword.length < 8) {
      return setError('รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 8 ตัวอักษร')
    }

    const hasUpperCase = /[A-Z]/.test(newPassword)
    const hasLowerCase = /[a-z]/.test(newPassword)
    const hasNumber = /[0-9]/.test(newPassword)
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(newPassword)

    if (!hasUpperCase || !hasLowerCase || !hasNumber || !hasSpecialChar) {
      return setError('รหัสผ่านต้องประกอบด้วยตัวอักษรพิมพ์ใหญ่ พิมพ์เล็ก ตัวเลข และตัวอักษรพิเศษ')
    }

    if (newPassword !== confirmNewPassword) return setError('รหัสผ่านไม่ตรงกัน')

    setLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/employee/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeName: idTrimmed,
          currentPassword: currentPassword,
          newPassword: newPassword,
        }),
      })

      const data = await res.json().catch(() => null)
      if (!res.ok) {
        return setError(data?.error || data?.message || 'เปลี่ยนรหัสผ่านไม่สำเร็จ')
      }

      // Proceed with the login using the original loginData
      const nextRole = loginData?.role as string
      if (loginData?.token) {
        sessionStorage.setItem('authToken', loginData.token)
        sessionStorage.setItem('authRole', nextRole)
        localStorage.removeItem('authToken')
        localStorage.removeItem('authRole')
      }

      sessionStorage.setItem('employeeName', idTrimmed)
      sessionStorage.setItem('employeeCode', newPassword)
      if (typeof loginData?.employeeId === 'number') {
        sessionStorage.setItem('employeeId', String(loginData.employeeId))
      } else {
        sessionStorage.removeItem('employeeId')
      }
      navigate('/employee', { replace: true })
    } catch {
      setError('ไม่สามารถเชื่อมต่อ Server ได้')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="authStandalone authStandalone--left">
      <div className="authCard">
        <div className="authCardHeader">
          <h1 className="authCardTitle">Reset Password</h1>
        </div>

        <form className="loginForm" onSubmit={onResetSubmit}>
          <div className="formRow">
            <div style={{ marginBottom: '1rem', color: '#d97706', fontWeight: 'bold', textAlign: 'center' }}>
              กรุณาตั้งรหัสผ่านใหม่สำหรับการเข้าสู่ระบบ
            </div>
            <TextField
              label="รหัสผ่านใหม่"
              type="password"
              value={newPassword}
              onChange={setNewPassword}
              placeholder="รหัสผ่าน 8 ตัวขึ้นไป (พิมพ์ใหญ่ เล็ก เลข พิเศษ)"
            />
          </div>
          <div className="formRow">
            <TextField
              label="ยืนยันรหัสผ่านใหม่"
              type="password"
              value={confirmNewPassword}
              onChange={setConfirmNewPassword}
              placeholder="ยืนยันรหัสผ่านใหม่อีกครั้ง"
            />
          </div>

          {error ? <div className="formError">{error}</div> : null}

          <button className="loginButton" type="submit" disabled={loading}>
            {loading ? 'Changing...' : 'เปลี่ยนรหัสผ่านและเข้าสู่ระบบ'}
          </button>
        </form>

        <div className="loginBottomText">
          กลับไปที่หน้า{' '}
          <button type="button" onClick={() => navigate('/login')}>
            Login
          </button>
        </div>
      </div>
    </div>
  )
}
