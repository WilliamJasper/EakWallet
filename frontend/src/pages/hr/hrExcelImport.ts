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

  if (h.includes('รหัสพนักงาน') || h === 'รหัส' || h.includes('employee code') || h.includes('emp code')) return 'employeeCode'

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
    // Excel date (serial number)
    if (val > 59 && val < 600000) {
      const utc = (val - 25569) * 86400 * 1000
      const d = new Date(utc)
      if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10)
    }
    return val.toLocaleString('fullwide', { useGrouping: false })
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
  const nationalRaw = pickCell(row, map, useFixed, 'nationalId', 3) // Column D
  const nationalIdEarly = cellString(nationalRaw)

  /** ต้องมีชื่อ และ (รหัสพนักงาน หรือเลขบัตร — เลขบัตร+ชื่อใช้จับคู่อัปเดตยอดแบบ bulk) */
  if (
    !displayName ||
    (!employeeCode.trim() && !nationalIdEarly.replace(/\D/g, '').trim())
  ) {
    return null
  }

  const startRaw = pickCell(row, map, useFixed, 'startWorkDate', 5) // Fallback for other formats
  const appRaw = pickCell(row, map, useFixed, 'appointmentDate', 6)
  const savRaw = pickCell(row, map, useFixed, 'accumulatedSavings', 4) // Column E

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
 * แมปคอลัมน์ตามชื่อหัว (ไทย/อังกฤษ) — ถ้าไม่พบหัวที่จับคู่ได้ จะ fallback เป็นลำดับคอลัมน์เดิม
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

  if (matrix.length < 1) {
    return {
      ok: false,
      message: 'ไฟล์ไม่มีข้อมูล',
    }
  }

  // ปรับปรุงการหาจุดเริ่มต้นข้อมูล: หาแถวที่มีคำว่า "ชื่อสกุล" หรือ "รหัส" ใน 5 แถวแรก
  let headerIndex = -1
  for (let i = 0; i < Math.min(matrix.length, 6); i++) {
    const r = matrix[i]
    if (!Array.isArray(r)) continue
    const rStr = r.map(c => String(c ?? '').trim()).join(' ')
    if (rStr.includes('ชื่อสกุล') || rStr.includes('รหัส')) {
      headerIndex = i
      break
    }
  }

  let dataStartIndex = 1
  if (headerIndex !== -1) {
    dataStartIndex = headerIndex + 1
  } else {
    headerIndex = 0 // Fallback
  }

  const headerRow = matrix[headerIndex]
  const colMap = buildColumnMap(Array.isArray(headerRow) ? headerRow : [])
  const hasHeaderMapping =
    colMap.displayName !== undefined &&
    (colMap.employeeCode !== undefined || colMap.nationalId !== undefined)
  
  // ให้ใช้ useFixed เป็น true หากไม่พบ Mapping ตาม Header ที่คาดหวัง 
  // หรือถ้าเป็นเทมเพลตที่หัวอยู่ที่แถว 3 เราจะเน้น Fixed Column ลำดับ B, C, D, E
  const useFixed = headerIndex === 2 || !hasHeaderMapping

  const out: HrImportPayloadRow[] = []
  for (let r = dataStartIndex; r < matrix.length; r++) {
    const row = matrix[r]
    if (!Array.isArray(row)) continue
    
    // ข้ามแถวที่คอลัมน์ A (ลำดับ) เป็นค่าว่างและไม่มีชื่อสกุล
    const meaningful = row.some((c) => String(c ?? '').replace(/\r?\n/g, '').trim() !== '')
    if (!meaningful) continue

    const rec = readDataRow(row, colMap, useFixed)
    if (rec) out.push(rec)
  }

  if (out.length === 0) {
    return {
      ok: false,
      message:
        'ไม่พบข้อมูลพนักงาน — กรุณาตรวจสอบว่าไฟล์มีคอลัมน์ "ชื่อสกุล", "รหัส", "เลขที่ ID 13 หลัก" และ "ยอดเงินสะสม" ครบถ้วน',
    }
  }

  return { ok: true, rows: out }
}
