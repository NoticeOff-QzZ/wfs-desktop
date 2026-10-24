import { useRef, useState } from 'react'

interface Props {
  onFiles: (files: File[]) => void
  hasImage: boolean
  remaining: number
  disabled: boolean
}

export default function DropZone({ onFiles, hasImage, remaining, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const unavailable = disabled || remaining <= 0

  const pick = (files: FileList | null) => {
    if (unavailable || !files || files.length === 0) return
    onFiles(Array.from(files))
  }

  return (
    <div
      className={`dropzone${dragging ? ' dropzone--active' : ''}${unavailable ? ' dropzone--disabled' : ''}`}
      onDragOver={(event) => {
        if (unavailable) return
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        if (unavailable) return
        event.preventDefault()
        setDragging(false)
        pick(event.dataTransfer.files)
      }}
      onClick={() => {
        if (!unavailable) inputRef.current?.click()
      }}
      role="button"
      tabIndex={unavailable ? -1 : 0}
      aria-disabled={unavailable}
      onKeyDown={(event) => {
        if (!unavailable && (event.key === 'Enter' || event.key === ' ')) {
          inputRef.current?.click()
        }
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        disabled={unavailable}
        hidden
        onChange={(event) => {
          pick(event.target.files)
          event.target.value = ''
        }}
      />
      <strong>
        {disabled
          ? '查询进行中，暂不能调整截图'
          : remaining <= 0
            ? '已上传 3 张截图'
            : hasImage
              ? `继续添加截图（还可添加 ${remaining} 张）`
              : '在这里粘贴或拖入截图'}
      </strong>
      <span>
        {disabled
          ? '请先中止当前查询'
          : remaining <= 0
            ? '移除一张后可继续添加'
            : '支持一次选择多张，最多 3 张；添加后点击“开始查询”'}
      </span>
    </div>
  )
}
