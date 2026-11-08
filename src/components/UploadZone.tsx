import { useRef, useState } from 'react'
import { ImagePlus, RefreshCw, Sparkles, UploadCloud } from 'lucide-react'
import type { LoadedImage } from '../types'

interface UploadZoneProps {
  image: LoadedImage | null
  onFile: (file: File) => void
  onDemo: () => void
}

export function UploadZone({ image, onFile, onDemo }: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const pickFile = () => inputRef.current?.click()
  const acceptFiles = (files: FileList | null) => {
    const file = files?.[0]
    if (file) onFile(file)
  }

  return (
    <div
      className={`upload-zone ${dragging ? 'is-dragging' : ''} ${image ? 'has-image' : ''}`}
      onDragEnter={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false)
      }}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        acceptFiles(event.dataTransfer.files)
      }}
    >
      <input
        ref={inputRef}
        className="visually-hidden"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(event) => {
          acceptFiles(event.target.files)
          event.target.value = ''
        }}
      />
      {image ? (
        <>
          <img className="source-thumbnail" src={image.url} alt="已上传原图" />
          <div className="upload-file-copy">
            <span className="file-name" title={image.name}>{image.name}</span>
            <span className="file-meta">{image.width} × {image.height} px</span>
          </div>
          <button className="icon-button subtle" type="button" onClick={pickFile} title="更换图片">
            <RefreshCw size={17} />
          </button>
        </>
      ) : (
        <>
          <div className="upload-icon"><UploadCloud size={24} strokeWidth={1.8} /></div>
          <div>
            <strong>拖入一张图片</strong>
            <p>PNG、JPG 或 WebP，最大 15MB</p>
          </div>
          <div className="upload-actions">
            <button className="button primary small" type="button" onClick={pickFile}>
              <ImagePlus size={16} /> 选择图片
            </button>
            <button className="button ghost small" type="button" onClick={onDemo}>
              <Sparkles size={16} /> 试用示例
            </button>
          </div>
        </>
      )}
    </div>
  )
}
