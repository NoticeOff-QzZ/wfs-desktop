import { useState } from 'react'
import type { UploadedImage } from '../types'

interface Props {
  images: UploadedImage[]
  disabled: boolean
  onRemove: (id: string) => void
  onMove: (from: number, to: number) => void
}

export default function ImageQueue({ images, disabled, onRemove, onMove }: Props) {
  const [dragging, setDragging] = useState<number | null>(null)
  const [dropTarget, setDropTarget] = useState<number | null>(null)

  if (images.length === 0) return null

  const stopDragging = () => {
    setDragging(null)
    setDropTarget(null)
  }

  return (
    <div className="image-queue" role="list" aria-label="已上传截图，按查询顺序排列">
      {images.map((image, index) => (
        <div
          key={image.id}
          className={`image-card${dragging === index ? ' is-dragging' : ''}${dropTarget === index ? ' is-drop-target' : ''}`}
          role="listitem"
          aria-label={`第 ${index + 1} 张：${image.name}`}
          draggable={!disabled}
          onDragStart={(event) => {
            if (disabled) {
              event.preventDefault()
              return
            }
            setDragging(index)
            event.dataTransfer.effectAllowed = 'move'
            event.dataTransfer.setData('text/plain', String(index))
          }}
          onDragOver={(event) => {
            if (disabled) return
            event.preventDefault()
            event.dataTransfer.dropEffect = 'move'
            setDropTarget(index)
          }}
          onDragLeave={() => setDropTarget(null)}
          onDrop={(event) => {
            if (disabled) return
            event.preventDefault()
            const fallback = Number(event.dataTransfer.getData('text/plain'))
            const from = dragging ?? (Number.isInteger(fallback) ? fallback : null)
            if (from !== null && from !== index) onMove(from, index)
            stopDragging()
          }}
          onDragEnd={stopDragging}
        >
          <div className="image-card__header">
            <span className="image-card__index">{index + 1}</span>
            <span className="image-card__handle" title="拖动调整顺序" aria-hidden="true">
              ⠿
            </span>
            <button
              className="button button--icon"
              onClick={() => onRemove(image.id)}
              disabled={disabled}
              aria-label={`移除第 ${index + 1} 张截图`}
            >
              ×
            </button>
          </div>
          <img src={image.dataUrl} alt={image.name} draggable={false} />
          <p className="image-card__name" title={image.name}>
            {image.name}
          </p>
        </div>
      ))}
    </div>
  )
}
