import { useCallback, useEffect, useRef, useState } from 'react'
import Cropper from 'react-easy-crop'
import type { Area, Point } from 'react-easy-crop'
import './employee-avatar-crop.css'

type Props = {
  open: boolean
  imageSrc: string
  onClose: () => void
  onApply: (dataUrl: string) => void
  onError?: (message: string) => void
}

const OUTPUT_MAX_PX = 400

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.addEventListener('load', () => resolve(img))
    img.addEventListener('error', () => reject(new Error('โหลดรูปไม่สำเร็จ')))
    img.src = src
  })
}

async function cropToJpegDataUrl(imageSrc: string, pixelCrop: Area): Promise<string> {
  const image = await loadImage(imageSrc)
  const canvas = document.createElement('canvas')
  const scale = Math.min(OUTPUT_MAX_PX / pixelCrop.width, OUTPUT_MAX_PX / pixelCrop.height, 1)
  const w = Math.max(1, Math.round(pixelCrop.width * scale))
  const h = Math.max(1, Math.round(pixelCrop.height * scale))
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('ไม่สามารถสร้างภาพได้')
  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    w,
    h,
  )
  return canvas.toDataURL('image/jpeg', 0.9)
}

export default function EmployeeAvatarCropModal({ open, imageSrc, onClose, onApply, onError }: Props) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [busy, setBusy] = useState(false)
  const [cropReady, setCropReady] = useState(false)
  const croppedPixelsRef = useRef<Area | null>(null)

  useEffect(() => {
    if (open && imageSrc) {
      setCrop({ x: 0, y: 0 })
      setZoom(1)
      croppedPixelsRef.current = null
      setCropReady(false)
    }
  }, [open, imageSrc])

  const onCropComplete = useCallback((_area: Area, areaPixels: Area) => {
    croppedPixelsRef.current = areaPixels
    setCropReady(true)
  }, [])

  const handleApply = useCallback(async () => {
    const pix = croppedPixelsRef.current
    if (!pix || !imageSrc) {
      onError?.('ยังไม่พร้อมตัดรูป ลองเลื่อนหรือซูมเล็กน้อย')
      return
    }
    setBusy(true)
    try {
      const dataUrl = await cropToJpegDataUrl(imageSrc, pix)
      if (dataUrl.length > 2_000_000) {
        onError?.('รูปหลังตัดยังใหญ่เกินไป ลองซูมเข้าให้กรอบเล็กลง')
        return
      }
      onApply(dataUrl)
      onClose()
    } catch {
      onError?.('ตัดรูปไม่สำเร็จ ลองเลือกไฟล์อื่น')
    } finally {
      setBusy(false)
    }
  }, [imageSrc, onApply, onClose, onError])

  if (!open || !imageSrc) return null

  return (
    <div className="employeeAvatarCropOverlay" role="dialog" aria-modal="true" aria-labelledby="employeeAvatarCropTitle">
      <button type="button" className="employeeAvatarCropBackdrop" aria-label="ปิด" onClick={onClose} />
      <div className="employeeAvatarCropPanel">
        <h2 id="employeeAvatarCropTitle" className="employeeAvatarCropTitle">
          จัดตำแหน่งรูปโปรไฟล์
        </h2>
        <p className="employeeAvatarCropHint">ลากเพื่อเลื่อน · ปรับซูมให้ใบหน้าอยู่ในกรอบวงกลม</p>
        <div className="employeeAvatarCropStage">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>
        <label className="employeeAvatarCropZoom">
          <span className="employeeAvatarCropZoomLabel">ซูม</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.02}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          />
        </label>
        <div className="employeeAvatarCropActions">
          <button type="button" className="employeeAvatarCropBtn employeeAvatarCropBtn--ghost" onClick={onClose}>
            ยกเลิก
          </button>
          <button
            type="button"
            className="employeeAvatarCropBtn employeeAvatarCropBtn--primary"
            disabled={busy || !cropReady}
            onClick={() => void handleApply()}
          >
            {busy ? 'กำลังบันทึก...' : 'ใช้รูปนี้'}
          </button>
        </div>
      </div>
    </div>
  )
}
