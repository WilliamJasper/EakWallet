import { useCallback, useEffect, useMemo, useState } from 'react'
import { API_BASE_URL } from '../../config/api'

type PersonRow = {
  id: number
  role: 'employee' | 'hr'
  email: string
  displayName: string
  employeeCode: string
  startWorkDate: string
  appointmentDate: string
  ageWork: string
  accumulatedSavings: number
}

type AdminCreds = { adminEmail: string; adminPassword: string }

function getAdminCreds(): AdminCreds | null {
  const adminEmail = sessionStorage.getItem('adminEmail') || ''
  const adminPassword = sessionStorage.getItem('adminPassword') || ''
  if (!adminEmail || !adminPassword) return null
  return { adminEmail, adminPassword }
}

function emptyForm() {
  return {
    role: 'employee' as 'employee' | 'hr',
    name: '',
    email: '',
    password: '',
    startWorkDate: '',
    appointmentDate: '',
    accumulatedSavings: 0,
  }
}

export default function AdminEmployeeManagementPanel() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [people, setPeople] = useState<PersonRow[]>([])

  const [q, setQ] = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | 'employee' | 'hr'>('all')

  const [formOpen, setFormOpen] = useState(false)
  const [formMode, setFormMode] = useState<'add' | 'edit'>('add')
  const [existingRole, setExistingRole] = useState<'employee' | 'hr'>('employee')
  const [existingId, setExistingId] = useState<number | null>(null)
  const [form, setForm] = useState(() => emptyForm())

  const loadPeople = useCallback(async () => {
    const creds = getAdminCreds()
    if (!creds) {
      setError('ไม่พบข้อมูลการเข้าสู่ระบบของผู้ดูแล กรุณาเข้าสู่ระบบใหม่')
      setPeople([])
      setLoading(false)
      return
    }

    setError(null)
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/people/list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminEmail: creds.adminEmail,
          adminPassword: creds.adminPassword,
          q,
          role: roleFilter,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error || 'โหลดข้อมูลไม่สำเร็จ')
        setPeople([])
        return
      }
      setPeople(Array.isArray(data?.people) ? data.people : [])
    } catch {
      setError('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้')
      setPeople([])
    } finally {
      setLoading(false)
    }
  }, [q, roleFilter])

  useEffect(() => {
    loadPeople()
  }, [loadPeople])

  function openAdd() {
    setFormMode('add')
    setExistingRole('employee')
    setExistingId(null)
    setForm(emptyForm())
    setFormOpen(true)
  }

  function openEdit(row: PersonRow) {
    setFormMode('edit')
    setExistingRole(row.role)
    setExistingId(row.id)
    setForm({
      role: row.role,
      name: row.displayName || '',
      email: row.email || '',
      password: '',
      startWorkDate: row.startWorkDate === '-' ? '' : row.startWorkDate,
      appointmentDate: row.appointmentDate === '-' ? '' : row.appointmentDate,
      accumulatedSavings: row.accumulatedSavings || 0,
    })
    setFormOpen(true)
  }

  async function submit() {
    const creds = getAdminCreds()
    if (!creds) return

    const payload: any = {
      adminEmail: creds.adminEmail,
      adminPassword: creds.adminPassword,
      role: form.role,
      existingRole: existingId && formMode === 'edit' ? existingRole : '',
      existingId: existingId && formMode === 'edit' ? existingId : null,
      name: form.name,
      email: form.email,
      password: form.password,
      startWorkDate: form.startWorkDate,
      appointmentDate: form.appointmentDate,
      accumulatedSavings: form.accumulatedSavings,
    }

    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/people/upsert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error || 'บันทึกไม่สำเร็จ')
        return
      }
      setFormOpen(false)
      await loadPeople()
    } catch {
      setError('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้')
    } finally {
      setLoading(false)
    }
  }

  async function deletePerson(row: PersonRow) {
    const creds = getAdminCreds()
    if (!creds) return
    const ok = window.confirm(`ต้องการลบ ${row.email} ใช่ไหม?`)
    if (!ok) return

    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/people/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminEmail: creds.adminEmail,
          adminPassword: creds.adminPassword,
          role: row.role,
          id: row.id,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error || 'ลบไม่สำเร็จ')
        return
      }
      await loadPeople()
    } catch {
      setError('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้')
    } finally {
      setLoading(false)
    }
  }

  const badgeText = useMemo(() => {
    const total = people.length
    return `${total} รายการ`
  }, [people.length])

  return (
    <div className="adminSection">
      {error ? <div className="adminBanner adminBannerError">{error}</div> : null}

      <div className="adminPanelTopBar">
        <div className="adminPanelTopLeft">
          <div className="adminPanelTitle">จัดการพนักงาน</div>
          <div className="adminMuted">{badgeText}</div>
        </div>
        <div className="adminPanelTopRight">
          <input
            className="adminInput"
            placeholder="ค้นหา email / ชื่อ / รหัสพนักงาน"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select
            className="adminSelect"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as any)}
          >
            <option value="all">ทั้งหมด</option>
            <option value="employee">employee</option>
            <option value="hr">hr</option>
          </select>
          <button type="button" className="adminBtn adminBtnPrimary" onClick={openAdd}>
            เพิ่มพนักงาน
          </button>
        </div>
      </div>

      {loading ? (
        <p className="adminMuted">กำลังโหลด...</p>
      ) : (
        <div className="adminTableWrap">
          <table className="adminTable">
            <thead>
              <tr>
                <th>Role</th>
                <th className="adminTableThEmail">อีเมล</th>
                <th className="adminTableThName">ชื่อ-สกุล</th>
                <th>รหัสพนักงาน</th>
                <th>วันเริ่มงาน</th>
                <th>วันบรรจุ</th>
                <th>ยอดเงินสะสม</th>
                <th aria-label="actions" />
              </tr>
            </thead>
            <tbody>
              {people.map((row) => (
                <tr key={`${row.role}-${row.id}`}>
                  <td>{row.role}</td>
                  <td className="adminTableTdEmail" title={row.email}>
                    {row.email}
                  </td>
                  <td
                    className="adminTableTdName"
                    title={row.displayName?.trim() ? row.displayName : undefined}
                  >
                    {row.displayName || '-'}
                  </td>
                  <td>{row.employeeCode || '-'}</td>
                  <td>{row.startWorkDate || '-'}</td>
                  <td>{row.appointmentDate || '-'}</td>
                  <td>{row.accumulatedSavings.toLocaleString()}</td>
                  <td className="adminTableActions">
                    <div className="adminRowActions">
                      <button
                        type="button"
                        className="adminBtn adminBtnGhost"
                        onClick={() => openEdit(row)}
                      >
                        แก้ไข
                      </button>
                      <button
                        type="button"
                        className="adminBtn adminBtnGhost"
                        onClick={() => deletePerson(row)}
                      >
                        ลบ
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {formOpen ? (
        <div className="adminModalOverlay" role="dialog" aria-modal="true">
          <div className="adminModal">
            <div className="adminModalHeader">
              <div className="adminModalTitle">
                {formMode === 'add' ? 'เพิ่มพนักงาน' : 'แก้ไขพนักงาน'}
              </div>
              <button type="button" className="adminModalClose" onClick={() => setFormOpen(false)}>
                ปิด
              </button>
            </div>

            <div className="adminFormGrid">
              <label className="adminField">
                <div className="adminFieldLabel">Role</div>
                <select
                  className="adminSelect"
                  value={form.role}
                  onChange={(e) => setForm((s) => ({ ...s, role: e.target.value as any }))}
                >
                  <option value="employee">employee</option>
                  <option value="hr">hr</option>
                </select>
              </label>

              <label className="adminField">
                <div className="adminFieldLabel">Name</div>
                <input
                  className="adminInput"
                  value={form.name}
                  onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
                />
              </label>

              <label className="adminField">
                <div className="adminFieldLabel">Email</div>
                <input
                  className="adminInput"
                  value={form.email}
                  onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))}
                />
              </label>

              <label className="adminField">
                <div className="adminFieldLabel">
                  Password{' '}
                  {form.role === 'employee'
                    ? formMode === 'add'
                      ? '(เว้นว่างได้ — ใช้รหัสพนักงานหลังสร้างเป็นหัวผ่านเข้าระบบ)'
                      : '(เว้นว่างได้ — คงใช้รหัสพนักงานเป็นหัวผ่าน)'
                    : formMode === 'add'
                      ? '(จำเป็น)'
                      : '(เว้นว่างได้)'}
                </div>
                <input
                  className="adminInput"
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((s) => ({ ...s, password: e.target.value }))}
                  placeholder={formMode === 'edit' ? 'ไม่ต้องใส่ถ้าไม่เปลี่ยน' : 'ใส่รหัสผ่าน'}
                />
              </label>

              <label className="adminField">
                <div className="adminFieldLabel">วันเริ่มงาน (YYYY-MM-DD)</div>
                <input
                  className="adminInput"
                  value={form.startWorkDate}
                  onChange={(e) => setForm((s) => ({ ...s, startWorkDate: e.target.value }))}
                />
              </label>

              <label className="adminField">
                <div className="adminFieldLabel">วันบรรจุ (YYYY-MM-DD)</div>
                <input
                  className="adminInput"
                  value={form.appointmentDate}
                  onChange={(e) => setForm((s) => ({ ...s, appointmentDate: e.target.value }))}
                />
              </label>

              <label className="adminField">
                <div className="adminFieldLabel">ยอดเงินสะสม</div>
                <input
                  className="adminInput"
                  type="number"
                  value={form.accumulatedSavings}
                  onChange={(e) => setForm((s) => ({ ...s, accumulatedSavings: Number(e.target.value) }))}
                />
              </label>
            </div>

            <div className="adminModalFooter">
              <button type="button" className="adminBtn adminBtnGhost" onClick={() => setFormOpen(false)}>
                ยกเลิก
              </button>
              <button type="button" className="adminBtn adminBtnPrimary" onClick={submit}>
                บันทึก
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

