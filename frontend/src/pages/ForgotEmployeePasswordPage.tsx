import { useState, useEffect, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import TextField from '../components/auth/TextField'
import { API_BASE_URL } from '../config/api'

type PageView = 'form' | 'waiting' | 'approved' | 'completed'

export default function ForgotEmployeePasswordPage() {
  const [fullName, setFullName] = useState('')
  const [nationalId, setNationalId] = useState('')
  const [requestId, setRequestId] = useState<number | null>(null)
  const [view, setView] = useState<PageView>('form')
  
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Polling logic for "waiting" view
  useEffect(() => {
    let timer: number | null = null
    
    if (view === 'waiting') {
      timer = window.setInterval(async () => {
        try {
          const res = await fetch(`${API_BASE_URL}/api/employee/reset-status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fullName: fullName.trim(), nationalId: nationalId.trim() }),
          })
          const data = await res.json()
          if (res.ok) {
            if (data.status === 'approved') {
              setRequestId(data.requestId)
              setView('approved')
            } else if (data.status === 'none') {
              // Should not happen unless expired or deleted
              setView('form')
            }
          }
        } catch (e) {
          console.error('Polling failed', e)
        }
      }, 5000)
    }
    
    return () => {
      if (timer) clearInterval(timer)
    }
  }, [view, fullName, nationalId])

  async function checkStatus(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!fullName.trim() || !nationalId.trim()) {
      return setError('กรุณากรอกชื่อ-สกุล และเลขบัตรประชาชนให้ครบถ้วน')
    }

    setLoading(true)
    try {
      // First, check if there is an existing request
      const statusRes = await fetch(`${API_BASE_URL}/api/employee/reset-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName: fullName.trim(), nationalId: nationalId.trim() }),
      })
      const statusData = await statusRes.json()

      if (statusRes.ok && statusData.status !== 'none') {
        setRequestId(statusData.requestId)
        if (statusData.status === 'approved') {
          setView('approved')
        } else {
          setView('waiting')
        }
        setLoading(false)
        return
      }

      // If no existing request, create one
      const res = await fetch(`${API_BASE_URL}/api/employee/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName: fullName.trim(), nationalId: nationalId.trim() }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        return setError(data?.error || 'ส่งคำร้องไม่สำเร็จ โปรดตรวจสอบชื่อและเลขบัตรประชาชนอีกครั้ง')
      }
      setView('waiting')
    } catch {
      setError('ไม่สามารถเชื่อมต่อ Server ได้')
    } finally {
      setLoading(false)
    }
  }

  async function onCompleteReset(e: FormEvent) {
    e.preventDefault()
    setError(null)
    
    if (newPassword.length < 8 || !/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword) || !/[^a-zA-Z0-9]/.test(newPassword)) {
      return setError('รหัสผ่านต้องมี 8 ตัวอักษรขึ้นไป และประกอบด้วยตัวพิมพ์ใหญ่ พิมพ์เล็ก ตัวเลข และอักขระพิเศษ')
    }
    if (newPassword !== confirmPassword) {
      return setError('รหัสผ่านไม่ตรงกัน')
    }

    setLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/employee/reset-complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, newPassword }),
      })
      if (!res.ok) {
        const data = await res.json()
        return setError(data.error || 'บันทึกรหัสผ่านใหม่ไม่สำเร็จ')
      }
      setView('completed')
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
          <h1 className="authCardTitle" style={{ fontSize: '28px' }}>ลืมรหัสผ่านพนักงาน</h1>
        </div>

        {view === 'form' && (
          <form className="loginForm" onSubmit={checkStatus}>
            <div className="formRow">
              <TextField
                label="ชื่อ-สกุล"
                type="text"
                value={fullName}
                onChange={setFullName}
                placeholder="Ex. สมชาย ใจดี"
              />
            </div>
            <div className="formRow">
              <TextField
                label="รหัสบัตรประชาชน"
                type="text"
                value={nationalId}
                onChange={setNationalId}
                placeholder="Ex. 11042004079xx"
              />
            </div>
            {error ? <div className="formError">{error}</div> : null}
            <button className="loginButton" type="submit" disabled={loading}>
              {loading ? 'กำลังตรวจสอบ...' : 'ส่งคำร้องหรือตรวจสอบสถานะ'}
            </button>
            <div className="loginBottomText">
              <Link to="/login">กลับไปหน้า Login</Link>
            </div>
          </form>
        )}

        {view === 'waiting' && (
          <div className="loginForm" style={{ textAlign: 'center' }}>
            <div style={{ padding: '20px 0' }}>
              <div className="spinner" style={{ margin: '0 auto 20px' }}></div>
              <h2 style={{ fontSize: '18px', color: '#131325', marginBottom: '10px' }}>ส่งคำร้องขอเรียบร้อยแล้ว</h2>
              <p style={{ color: '#6b6375', fontSize: '14px', lineHeight: '1.6' }}>
                กำลังรอเจ้าหน้าที่ HR ตรวจสอบสิทธิ์...<br/>
                หน้านี้จะอัปเดตอัตโนมัติเมื่อได้รับการอนุมัติ
              </p>
            </div>
            <button 
              className="adminBtn adminBtnGhost" 
              style={{ width: '100%' }}
              onClick={() => setView('form')}
            >
              กลับไปหน้าแรก
            </button>
          </div>
        )}

        {view === 'approved' && (
          <form className="loginForm" onSubmit={onCompleteReset}>
            <div style={{ marginBottom: '20px', textAlign: 'center' }}>
              <div style={{ display: 'inline-flex', padding: '10px', background: '#d1fae5', borderRadius: '50%', marginBottom: '10px' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h2 style={{ fontSize: '18px', color: '#059669' }}>ได้รับการอนุมัติแล้ว!</h2>
              <p style={{ color: '#6b6375', fontSize: '13px' }}>กรุณาตั้งรหัสผ่านใหม่เพื่อเข้าใช้งาน</p>
            </div>

            <div className="formRow">
              <TextField
                label="รหัสผ่านใหม่"
                type="password"
                value={newPassword}
                onChange={setNewPassword}
                placeholder="ตั้งรหัสผ่านใหม่"
              />
            </div>
            <div className="formRow">
              <TextField
                label="ยืนยันรหัสผ่านใหม่"
                type="password"
                value={confirmPassword}
                onChange={setConfirmPassword}
                placeholder="กรอกรหัสผ่านใหม่อีกครั้ง"
              />
            </div>

            {error ? <div className="formError">{error}</div> : null}

            <button className="loginButton" type="submit" disabled={loading}>
              {loading ? 'กำลังบันทึก...' : 'บันทึกรหัสผ่านใหม่'}
            </button>
          </form>
        )}

        {view === 'completed' && (
          <div className="loginForm" style={{ textAlign: 'center' }}>
            <div style={{ padding: '20px 0' }}>
              <div style={{ display: 'inline-flex', padding: '15px', background: '#d1fae5', borderRadius: '50%', marginBottom: '20px' }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h2 style={{ fontSize: '20px', color: '#131325', marginBottom: '10px' }}>รีเซ็ตรหัสผ่านสำเร็จ</h2>
              <p style={{ color: '#6b6375', fontSize: '14px', marginBottom: '25px' }}>
                คุณสามารถใช้รหัสผ่านใหม่เข้าสู่ระบบได้ทันที
              </p>
              <Link to="/login" className="loginButton" style={{ display: 'block', textDecoration: 'none' }}>
                ไปหน้า Login
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
