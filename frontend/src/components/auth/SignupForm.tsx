import { type FormEvent, useState } from 'react'
import { createPortal } from 'react-dom'
import TextField from './TextField'
import '../../styles/components/auth/signup-form.css'
import { useNavigate } from 'react-router-dom'
import { API_BASE_URL } from '../../config/api'

type SignupFormProps = {
  onRegistered?: () => void
}

export default function SignupForm({ onRegistered }: SignupFormProps) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [hrPendingModal, setHrPendingModal] = useState(false)

  const navigate = useNavigate()

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setMessage(null)

    if (!name.trim()) return setError('กรุณากรอกชื่อ')
    if (!email.trim()) return setError('กรุณากรอกอีเมล')
    if (!password.trim()) return setError('กรุณากรอกรหัสผ่าน')

    setLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, role: 'hr' }),
      })

      const data = await res.json().catch(() => null)
      if (!res.ok) return setError(data?.error || 'สมัครไม่สำเร็จ')

      if (data?.token) localStorage.setItem('authToken', data.token)
      localStorage.setItem('authRole', 'hr')

      setMessage(null)
      setHrPendingModal(true)
    } catch {
      setError(
        'ไม่สามารถเชื่อมต่อ Server ได้ (ยังไม่ได้เปิด Backend หรือ URL ไม่ถูกต้อง)'
      )
    } finally {
      setLoading(false)
    }
  }

  function dismissHrModalAndContinue() {
    setHrPendingModal(false)
    if (onRegistered) onRegistered()
    else navigate('/login')
  }

  return (
    <form className="signupForm" onSubmit={onSubmit}>
      <div className="formRow">
        <TextField
          label="Name"
          value={name}
          onChange={setName}
          placeholder="Your name"
          autoComplete="name"
          name="name"
        />
      </div>

      <div className="formRow">
        <TextField
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="Your email"
          autoComplete="email"
          name="email"
        />
      </div>

      <div className="formRow">
        <TextField
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          placeholder="Your password"
          autoComplete="new-password"
          name="password"
        />
      </div>

      {error ? <div className="formError">{error}</div> : null}
      {message ? <div className="formMessage">{message}</div> : null}

      <button className="signupButton" type="submit" disabled={loading}>
        {loading ? 'Registering...' : 'Register'}
      </button>

      {hrPendingModal
        ? createPortal(
            <div
              className="hrPendingOverlay"
              role="dialog"
              aria-modal="true"
              aria-labelledby="hrPendingTitle"
            >
              <div className="hrPendingDialog">
                <h2 id="hrPendingTitle" className="hrPendingTitle">
                  รอผู้ดูแลยืนยันสิทธิ์
                </h2>
                <p className="hrPendingText">
                  บัญชี HR ของคุณลงทะเบียนแล้ว แต่ยังไม่สามารถเข้าสู่ระบบได้จนกว่าผู้ดูแลระบบจะยืนยันสิทธิ์ให้
                </p>
                <button
                  type="button"
                  className="hrPendingOk"
                  onClick={dismissHrModalAndContinue}
                >
                  เข้าใจแล้ว
                </button>
              </div>
            </div>,
            document.body
          )
        : null}
    </form>
  )
}
