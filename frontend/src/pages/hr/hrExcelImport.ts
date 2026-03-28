import * as XLSX from 'xlsx'

export type HrImportPayloadRow = {
  role: string
  displayName: string
  employeeCode: string
  nationalId: string
  startWorkDate: string
  appointmentDate: string
  accumulatedSavings: number
}

export type HrImportParseResult =
  | { ok: true; rows: HrImportPayloadRow[] }
  | { ok: false; message: string }

function normalizeHeaderCell(val: unknown): string {
  return String(val ?? '')
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function cellString(val: unknown): string {
  if (val == null || val === '') return ''
  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    return val.toISOString().slice(0, 10)
  }
  return String(val).replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim()
}

/** แมปหัวคอลัมน์ (หลัง normalize) ไปฟิลด์ — เรียงจากเฉพาะเจาะจงไปทั่วไป */
function mapHeaderToField(headerNorm: string): keyof HrImportPayloadRow | null {
  const h = headerNorm

  if (h.includes('เลขบัตรประชาชน') || h.includes('เลขประชาชน')) return 'nationalId'
  if (h.includes('national') && h.includes('id')) return 'nationalId'
  if (h.includes('citizen')) return 'nationalId'
  if (h.includes('ปปช')) return 'nationalId'
  if (h === 'เลขบัตร') return 'nationalId'

  if (h.includes('รหัสพนักงาน') || h.includes('employee code') || h.includes('emp code')) return 'employeeCode'

  if (h.includes('ชื่อ-สกุล') || h.includes('ชื่อสกุล')) return 'displayName'
  if (h.includes('full name') || h.includes('display name')) return 'displayName'
  if (h === 'name' || h === 'ชื่อ') return 'displayName'

  if (h.includes('วันบรรจุ')) return 'appointmentDate'
  if (h.includes('appointment') && !h.includes('start')) return 'appointmentDate'

  if (h.includes('วันเริ่มงาน') || h.includes('start work')) return 'startWorkDate'
  if (h.includes('วันเริ่ม')) return 'startWorkDate'

  if (h.includes('ยอดเงินสะสม') || h.includes('เงินสะสม')) return 'accumulatedSavings'
  if (h.includes('accumulated')) return 'accumulatedSavings'
  if (h.includes('savings') && !h.includes('rate')) return 'accumulatedSavings'

  if (h === 'role' || h.includes('บทบาท')) return 'role'

  return null
}

function buildColumnMap(headerRow: unknown[]): Partial<Record<keyof HrImportPayloadRow, number>> {
  const map: Partial<Record<keyof HrImportPayloadRow, number>> = {}
  for (let c = 0; c < headerRow.length; c++) {
    const field = mapHeaderToField(normalizeHeaderCell(headerRow[c]))
    if (field != null && map[field] === undefined) {
      map[field] = c
    }
  }
  return map
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
  const s = String(val).replace(/\r?\n/g, '').replace(/\s+/g, ' ').trim()
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/)
  if (m) return m[1]
  const d2 = new Date(s)
  if (!Number.isNaN(d2.getTime())) return d2.toISOString().slice(0, 10)
  return s
}

function parseSavings(val: unknown): number {
  if (val == null || val === '') return 0
  if (typeof val === 'number' && !Number.isNaN(val)) return Math.max(0, Math.round(val))
  const s = String(val).replace(/\r?\n/g, '').replace(/,/g, '').trim()
  const n = Number.parseFloat(s)
  if (Number.isNaN(n)) return 0
  return Math.max(0, Math.round(n))
}

function pickCell(
  row: (string | number | boolean | Date | null | undefined)[],
  map: Partial<Record<keyof HrImportPayloadRow, number>>,
  useFixed: boolean,
  key: keyof HrImportPayloadRow,
  fixedIndex: number
): unknown {
  if (useFixed) return row[fixedIndex]
  const i = map[key]
  return i !== undefined ? row[i] : undefined
}

function readDataRow(
  row: (string | number | boolean | Date | null | undefined)[],
  map: Partial<Record<keyof HrImportPayloadRow, number>>,
  useFixed: boolean
): HrImportPayloadRow | null {
  const displayName = cellString(pickCell(row, map, useFixed, 'displayName', 1))
  const employeeCode = cellString(pickCell(row, map, useFixed, 'employeeCode', 2))
  const roleRaw = pickCell(row, map, useFixed, 'role', 0)
  const nationalRaw = pickCell(row, map, useFixed, 'nationalId', 6)
  const nationalIdEarly = cellString(nationalRaw)
  /** ต้องมีชื่อ และ (รหัสพนักงาน หรือเลขบัตร — เลขบัตร+ชื่อใช้จับคู่อัปเดตยอดแบบ bulk) */
  if (!displayName || (!employeeCode.trim() && !nationalIdEarly.replace(/\D/g, '').trim())) return null

  const startRaw = pickCell(row, map, useFixed, 'startWorkDate', 3)
  const appRaw = pickCell(row, map, useFixed, 'appointmentDate', 4)
  const savRaw = pickCell(row, map, useFixed, 'accumulatedSavings', 5)

  const roleStr = cellString(roleRaw)
  return {
    role: roleStr || 'employee',
    displayName,
    employeeCode,
    nationalId: nationalIdEarly,
    startWorkDate: normalizeDate(startRaw),
    appointmentDate: normalizeDate(appRaw),
    accumulatedSavings: parseSavings(savRaw),
  }
}

/**
 * แถวที่ 1 = หัวคอลัมน์ (ชื่อฟิลด์), แถวที่ 2 เป็นต้นไป = ข้อมูลพนักงาน
 * แมปคอลัมน์ตามชื่อหัว (ไทย/อังกฤษ) — ถ้าไม่พบหัวที่จับคู่ได้ จะ fallback เป็นลำดับคอลัมน์เดิม A=role … G=เลขบัตร
 */
export async function parseHrEmployeeWorkbook(file: File): Promise<HrImportParseResult> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', cellDates: true })
  const sheetName = wb.SheetNames[0]
  if (!sheetName) {
    return { ok: false, message: 'ไม่พบชีตในไฟล์' }
  }
  const sheet = wb.Sheets[sheetName]
  const matrix = XLSX.utils.sheet_to_json<(string | number | boolean | Date | null | undefined)[]>(
    sheet,
    { header: 1, defval: '', raw: true }
  )

  if (matrix.length < 2) {
    return {
      ok: false,
      message: 'ไฟล์ต้องมีแถวหัวคอลัมน์ (แถวที่ 1) และข้อมูลพนักงานอย่างน้อย 1 แถว (เริ่มแถวที่ 2)',
    }
  }

  const headerRow = matrix[0]
  if (!Array.isArray(headerRow)) {
    return { ok: false, message: 'รูปแบบไฟล์ไม่ถูกต้อง' }
  }

  const colMap = buildColumnMap(headerRow)
  const hasHeaderMapping =
    colMap.displayName !== undefined &&
    (colMap.employeeCode !== undefined || colMap.nationalId !== undefined)
  const useFixed = !hasHeaderMapping

  const out: HrImportPayloadRow[] = []
  for (let r = 1; r < matrix.length; r++) {
    const row = matrix[r]
    if (!Array.isArray(row)) continue
    const meaningful = row.some((c) => String(c ?? '').replace(/\r?\n/g, '').trim() !== '')
    if (!meaningful) continue

    const rec = readDataRow(row, colMap, useFixed)
    if (rec) out.push(rec)
  }

  if (out.length === 0) {
    if (!hasHeaderMapping) {
      return {
        ok: false,
        message:
          'ไม่พบข้อมูลพนักงาน — แถวแรกควรเป็นหัวคอลัมน์ที่มีอย่างน้อย "ชื่อ-สกุล" และ ("รหัสพนักงาน" หรือ "เลขบัตรประชาชน") หรือใช้ลำดับคอลัมน์แบบเดิม (A–G) โดยข้อมูลเริ่มแถวที่ 2',
      }
    }
    return {
      ok: false,
      message:
        'ไม่พบแถวข้อมูลที่มีชื่อ-สกุล และรหัสพนักงานหรือเลขบัตรประชาชน (อย่างใดอย่างหนึ่ง)',
    }
  }

  return { ok: true, rows: out }
}
