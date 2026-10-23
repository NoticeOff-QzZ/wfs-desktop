import { useRef, useState } from 'react'

interface Props {
  onFile: (file: File) => void
  hasImage: boolean
}

export default function DropZone({ onFile, hasImage }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const pick = (file: File | undefined) => {
    if (file) onFile(file)
  }

  return (
    <div
      className={`dropzone${dragging ? ' dropzone--active' : ''}`}
      onDragOver={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        pick(Array.from(event.dataTransfer.files).find((candidate) => candidate.type.startsWith('image/')))
      }}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click()
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          pick(event.target.files?.[0])
          event.target.value = ''
        }}
      />
      <strong>{hasImage ? '换一张截图' : '在这里粘贴截图'}</strong>
      <span>Ctrl + V 粘贴，或拖拽图片到此处，也可以点击选择文件</span>
    </div>
  )
}
