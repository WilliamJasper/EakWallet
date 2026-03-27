import * as XLSX from 'xlsx'

export type HrImportPayloadRow = {
  role: string
  displayName: string
  employeeCode: string
  startWorkDate: string
  appointmentDate: string
  accumulatedSavings: number
}

function normalizeDate(val: unknown): string {
  if (val == null || val === '') return ''
  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    return val.toISOString().slice(0, 10)
  }
  if (typeof val === 'number') {
    if (val > 59 && val < 600000) {
      const utc = (val - 25569) * 86400 * 1000
      const d = new Date(utc)
      if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10)
    }
  }
  const s = String(val).trim()
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/)
  if (m) return m[1]
  const d2 = new Date(s)
  if (!Number.isNaN(d2.getTime())) return d2.toISOString().slice(0, 10)
  return s
}

function parseSavings(val: unknown): number {
  if (val == null || val === '') return 0
  if (typeof val === 'number' && !Number.isNaN(val)) return Math.max(0, Math.round(val))
  const s = String(val).replace(/,/g, '').trim()
  const n = Number.parseFloat(s)
  if (Number.isNaN(n)) return 0
  return Math.max(0, Math.round(n))
}

/** แถวที่ 1 ในไฟล์ = หัวตาราง, อ่านข้อมูลคอลัมน์ A–F ตั้งแต่แถวที่ 2 */
export async function parseHrEmployeeWorkbook(file: File): Promise<HrImportPayloadRow[]> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', cellDates: true })
  const sheetName = wb.SheetNames[0]
  if (!sheetName) return []
  const sheet = wb.Sheets[sheetName]
  const matrix = XLSX.utils.sheet_to_json<(string | number | boolean | Date | null | undefined)[]>(
    sheet,
    { header: 1, defval: '', raw: true }
  )

  const out: HrImportPayloadRow[] = []
  for (let r = 1; r < matrix.length; r++) {
    const row = matrix[r]
    if (!Array.isArray(row)) continue
    const cells = [0, 1, 2, 3, 4, 5].map((i) => row[i])
    if (cells.every((c) => String(c ?? '').trim() === '')) continue

    out.push({
      role: String(cells[0] ?? '').trim(),
      displayName: String(cells[1] ?? '').trim(),
      employeeCode: String(cells[2] ?? '').trim(),
      startWorkDate: normalizeDate(cells[3]),
      appointmentDate: normalizeDate(cells[4]),
      accumulatedSavings: parseSavings(cells[5]),
    })
  }
  return out
}
