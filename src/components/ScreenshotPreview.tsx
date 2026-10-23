interface Props {
  image: { url: string; name: string } | null
}

export default function ScreenshotPreview({ image }: Props) {
  if (!image) {
    return <div className="preview preview--empty">截图会显示在这里</div>
  }

  return (
    <div className="preview">
      <div className="preview__stage">
        <img src={image.url} alt={image.name} />
      </div>
      <p className="hint">{image.name}</p>
    </div>
  )
}
