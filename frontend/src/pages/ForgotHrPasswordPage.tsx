import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import TextField from '../components/auth/TextField'
import { API_BASE_URL } from '../config/api'

export default function ForgotHrPasswordPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setMessage(null)

    const em = email.trim()
    if (!em) {
      setError('กรุณากรอกอีเมลของบัญชี HR')
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/hr/password-reset/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: em,
          clientBaseUrl: window.location.origin,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error || 'ส่งคำขอไม่สำเร็จ')
        return
      }
      setMessage(data?.message || 'ส่งลิงก์รีเซ็ตรหัสผ่านไปยังอีเมลแล้ว')
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
          <h1 className="authCardTitle">Forgot HR Password</h1>
        </div>

        <form className="loginForm" onSubmit={onSubmit}>
          <div className="formRow">
            <TextField
              label="Email (HR)"
              type="email"
              value={email}
              onChange={setEmail}
              autoComplete="email"
            />
          </div>

          {error ? <div className="formError">{error}</div> : null}
          {message ? <div className="formMessage">{message}</div> : null}

          <button className="loginButton" type="submit" disabled={loading}>
            {loading ? 'Sending...' : 'ส่งลิงก์รีเซ็ต'}
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

