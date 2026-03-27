import { type FormEvent, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import TextField from '../components/auth/TextField'
import { API_BASE_URL } from '../config/api'

function useQueryToken(): string {
  const location = useLocation()
  return useMemo(() => {
    const sp = new URLSearchParams(location.search)
    return sp.get('token') || ''
  }, [location.search])
}

export default function ResetHrPasswordPage() {
  const navigate = useNavigate()
  const token = useQueryToken()

  const [newPassword, setNewPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setMessage(null)

    if (!token) {
      setError('ไม่พบ token สำหรับรีเซ็ต')
      return
    }
    if (!newPassword.trim()) {
      setError('กรุณากรอกรหัสผ่านใหม่')
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/hr/password-reset/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error || 'ตั้งรหัสผ่านไม่สำเร็จ')
        return
      }
      setMessage(data?.message || 'ตั้งรหัสผ่านสำเร็จแล้ว')
      setTimeout(() => navigate('/login', { replace: true }), 700)
    } catch {
      setError('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="authStandalone">
      <div className="authCard">
        <div className="authCardHeader">
          <h1 className="authCardTitle">Reset HR Password</h1>
        </div>

        <form className="loginForm" onSubmit={onSubmit}>
          <div className="formRow">
            <TextField
              label="New Password"
              type="password"
              value={newPassword}
              onChange={setNewPassword}
              autoComplete="new-password"
            />
          </div>

          {error ? <div className="formError">{error}</div> : null}
          {message ? <div className="formMessage">{message}</div> : null}

          <button className="loginButton" type="submit" disabled={loading}>
            {loading ? 'Confirming...' : 'ยืนยันรีเซ็ต'}
          </button>
        </form>

        <div className="loginBottomText">
          หรือกลับไปที่หน้า{' '}
          <button type="button" onClick={() => navigate('/login')}>
            Login
          </button>
        </div>
      </div>
    </div>
  )
}

