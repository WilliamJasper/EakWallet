type PendingHr = {
  id: number
  email: string
  displayName: string
}

export default function AdminNotificationsPanel({
  loading,
  error,
  pending,
  pendingHrActionId,
  onRefresh,
  onApproveOne,
  onRejectOne,
}: {
  loading: boolean
  error: string | null
  pending: PendingHr[]
  pendingHrActionId: number | null
  onRefresh: () => void
  onApproveOne: (hrEmail: string, id: number) => void
  onRejectOne: (hrEmail: string, id: number) => void
}) {
  return (
    <div className="adminSection">
      <div className="adminCardHeaderRow">
        <div className="adminCardTitle">HR รออนุมัติ</div>
        <button type="button" className="adminBtn adminBtnGhost" onClick={onRefresh}>
          รีเฟรช
        </button>
      </div>

      {error ? <div className="adminBanner adminBannerError">{error}</div> : null}

      {loading ? (
        <p className="adminMuted">กำลังโหลด...</p>
      ) : pending.length === 0 ? (
        <p className="adminMuted">ไม่มีบัญชี HR ที่รอการยืนยันสิทธิ์</p>
      ) : (
        <div className="adminTableWrap">
          <table className="adminTable">
            <thead>
              <tr>
                <th>อีเมล</th>
                <th className="adminTableThName">ชื่อ (Username)</th>
                <th aria-label="actions" />
              </tr>
            </thead>
            <tbody>
              {pending.map((row) => (
                <tr key={row.id}>
                  <td>{row.email}</td>
                  <td
                    className="adminTableTdName"
                    title={row.displayName?.trim() ? row.displayName : undefined}
                  >
                    {row.displayName || '—'}
                  </td>
                  <td className="adminTableActions">
                    <div className="adminRowActions">
                      <button
                        type="button"
                        className="adminBtn adminBtnPrimary"
                        disabled={pendingHrActionId === row.id}
                        onClick={() => onApproveOne(row.email, row.id)}
                      >
                        {pendingHrActionId === row.id ? 'กำลังดำเนินการ...' : 'ยืนยันสิทธิ์'}
                      </button>
                      <button
                        type="button"
                        className="adminBtn adminBtnGhost"
                        disabled={pendingHrActionId === row.id}
                        onClick={() => onRejectOne(row.email, row.id)}
                      >
                        ยกเลิก
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

