import { type FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import TextField from './TextField'
import '../../styles/components/auth/login-form.css'
import { API_BASE_URL } from '../../config/api'

export default function LoginForm() {
  const navigate = useNavigate()
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const [rememberMe, setRememberMe] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setMessage(null)

    if (!loginId.trim()) return setError('Please enter email (HR/Admin) or ชื่อ-สกุล (employee)')
    if (!password.trim()) return setError('Please enter password or รหัสพนักงาน')

    const idTrim = loginId.trim()

    setLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: idTrim, password }),
      })

      const data = await res.json().catch(() => null)
      if (!res.ok) {
        const text =
          (typeof data?.message === 'string' && data.message.trim()) ||
          (typeof data?.error === 'string' && data.error) ||
          'เข้าสู่ระบบไม่สำเร็จ'
        return setError(text)
      }

      const nextRole = data?.role as string
      if (data?.token) {
        if (rememberMe) {
          localStorage.setItem('authToken', data.token)
          localStorage.setItem('authRole', nextRole)
          sessionStorage.removeItem('authToken')
          sessionStorage.removeItem('authRole')
        } else {
          sessionStorage.setItem('authToken', data.token)
          sessionStorage.setItem('authRole', nextRole)
          localStorage.removeItem('authToken')
          localStorage.removeItem('authRole')
        }
      }

      if (nextRole === 'admin') {
        sessionStorage.setItem('adminEmail', idTrim.toLowerCase())
        sessionStorage.setItem('adminPassword', password)
        navigate('/admin', { replace: true })
        return
      }

      if (nextRole === 'hr') {
        sessionStorage.setItem('hrEmail', idTrim.toLowerCase())
        sessionStorage.setItem('hrPassword', password)
        sessionStorage.setItem(
          'hrDisplayName',
          (typeof data?.displayName === 'string' && data.displayName.trim()) ||
            idTrim.split('@')[0] ||
            'HR'
        )
        navigate('/hr', { replace: true })
        return
      }

      if (nextRole === 'employee') {
        sessionStorage.setItem('employeeName', idTrim)
        sessionStorage.setItem('employeeCode', password)
        if (typeof data?.employeeId === 'number') {
          sessionStorage.setItem('employeeId', String(data.employeeId))
        } else {
          sessionStorage.removeItem('employeeId')
        }
        navigate('/employee', { replace: true })
        return
      }

      setMessage(data?.message || 'เข้าสู่ระบบสำเร็จ')
    } catch {
      setError('ไม่สามารถเชื่อมต่อ Server ได้ (ยังไม่ได้เปิด Backend หรือ URL ไม่ถูกต้อง)')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form className="loginForm" onSubmit={onSubmit}>
      <div className="formRow">
        <TextField
          label="Email"
          type="text"
          value={loginId}
          onChange={setLoginId}
          autoComplete="username"
          placeholder="Your email"
        />
      </div>

      <div className="formRow">
        <label className="tf">
          <div className="tfLabel">Password</div>
          <div className="tfPasswordWrap">
            <input
              className="tfInput"
              type={showPassword ? 'text' : 'password'}
              value={password}
              name="password"
              autoComplete="current-password"
              placeholder="Your password"
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              className="tfPasswordToggle"
              aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
              onClick={() => setShowPassword((v) => !v)}
            >
              {showPassword ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 3l18 18" />
                  <path d="M10.58 10.58a2 2 0 0 0 2.83 2.83" />
                  <path d="M9.53 9.53A5 5 0 0 1 12 9a5 5 0 0 1 4.9 4" />
                  <path d="M14.12 14.12A5 5 0 0 1 12 15a5 5 0 0 1-4.9-4" />
                  <path d="M7.63 7.63C4.73 9.07 3 12 3 12s1.73 2.93 4.63 4.37" />
                  <path d="M16.37 16.37C19.27 14.93 21 12 21 12s-1.73-2.93-4.63-4.37" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>
        </label>
      </div>

      <div className="loginMetaRow">
        <label className="rememberLabel">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
          />
          <span>Remember me</span>
        </label>
        <a
          className="forgotLink"
          href="#"
          onClick={(e) => {
            e.preventDefault()
            setError(null)
            setMessage('ยังไม่ได้ทำระบบลืมรหัสผ่านในตอนนี้')
          }}
        >
          Forgot password?
        </a>
      </div>

      {error ? <div className="formError">{error}</div> : null}
      {message ? <div className="formMessage">{message}</div> : null}

      <button className="loginButton" type="submit" disabled={loading}>
        {loading ? 'Checking...' : 'Log In'}
      </button>
    </form>
  )
}
