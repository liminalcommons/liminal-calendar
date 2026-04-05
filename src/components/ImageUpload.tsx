'use client'

import { useState, useRef, useCallback } from 'react'
import { X, Image as ImageIcon, Sparkles } from 'lucide-react'

interface ImageUploadProps {
  onImageUrl: (url: string | null) => void
  currentUrl?: string | null
  /** Event title used as prompt context for AI generation */
  eventTitle?: string
  /** Event description used as prompt context for AI generation */
  eventDescription?: string
}

export function ImageUpload({ onImageUrl, currentUrl, eventTitle, eventDescription }: ImageUploadProps) {
  const [preview, setPreview] = useState<string | null>(currentUrl ?? null)
  const [uploading, setUploading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be under 5MB')
      return
    }

    setError(null)
    setUploading(true)

    // Show local preview immediately
    const localUrl = URL.createObjectURL(file)
    setPreview(localUrl)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Upload failed' }))
        throw new Error(data.error || 'Upload failed')
      }

      const { url } = await res.json()
      setPreview(url)
      onImageUrl(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
      setPreview(null)
      onImageUrl(null)
    } finally {
      setUploading(false)
      URL.revokeObjectURL(localUrl)
    }
  }, [onImageUrl])

  const handleGenerate = useCallback(async () => {
    if (!eventTitle?.trim()) {
      setError('Add an event title first to generate a banner')
      return
    }

    setError(null)
    setGenerating(true)

    try {
      const res = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: eventTitle.trim(),
          description: eventDescription?.trim() || undefined,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Generation failed' }))
        throw new Error(data.error || 'Generation failed')
      }

      const { url } = await res.json()
      setPreview(url)
      onImageUrl(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setGenerating(false)
    }
  }, [eventTitle, eventDescription, onImageUrl])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const handleRemove = () => {
    setPreview(null)
    setError(null)
    onImageUrl(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  const busy = uploading || generating

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-grove-text">Event Image</label>

      {preview ? (
        <div className="relative rounded-lg overflow-hidden border border-grove-border/20">
          <img src={preview} alt="Event preview" className="w-full h-40 object-cover" />
          <button
            type="button"
            onClick={handleRemove}
            className="absolute top-2 right-2 w-7 h-7 bg-black/50 rounded-full flex items-center justify-center text-white hover:bg-black/70 transition-colors"
          >
            <X size={14} />
          </button>
          {busy && (
            <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
              <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            </div>
          )}
          {/* Regenerate button when image exists */}
          {!busy && (
            <button
              type="button"
              onClick={handleGenerate}
              className="absolute bottom-2 right-2 flex items-center gap-1.5 px-2.5 py-1.5 bg-black/50 hover:bg-black/70 text-white text-xs rounded-lg transition-colors"
            >
              <Sparkles size={12} />
              Regenerate
            </button>
          )}
        </div>
      ) : (
        <div className="flex gap-2">
          {/* Upload area */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => !busy && inputRef.current?.click()}
            className={`flex-1 border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
              busy ? 'opacity-50 cursor-not-allowed' :
              dragOver
                ? 'border-grove-accent bg-grove-accent/5 cursor-pointer'
                : 'border-grove-border/30 hover:border-grove-accent/50 cursor-pointer'
            }`}
          >
            <div className="flex flex-col items-center gap-2">
              {uploading ? (
                <div className="w-8 h-8 border-2 border-grove-accent/30 border-t-grove-accent rounded-full animate-spin" />
              ) : (
                <>
                  <ImageIcon size={24} className="text-grove-text-muted" />
                  <span className="text-sm text-grove-text-muted">
                    Drop image or browse
                  </span>
                  <span className="text-[11px] text-grove-text-dim">Max 5MB</span>
                </>
              )}
            </div>
          </div>

          {/* AI Generate button */}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={busy}
            className={`flex flex-col items-center justify-center gap-2 px-4 border-2 border-dashed rounded-lg transition-colors ${
              busy
                ? 'opacity-50 cursor-not-allowed border-grove-border/30'
                : 'border-grove-accent/30 hover:border-grove-accent hover:bg-grove-accent/5 cursor-pointer'
            }`}
          >
            {generating ? (
              <div className="w-8 h-8 border-2 border-grove-accent/30 border-t-grove-accent rounded-full animate-spin" />
            ) : (
              <>
                <Sparkles size={24} className="text-grove-accent" />
                <span className="text-sm text-grove-accent font-medium">AI Generate</span>
              </>
            )}
          </button>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
        }}
      />

      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}
    </div>
  )
}
