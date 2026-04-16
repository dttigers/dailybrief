import { useState, useCallback } from 'react'
import { vigilFetch } from '../api/client'
import type { ThoughtApiResponse } from '../api/client'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PhotoUploadPhase =
  | 'idle'
  | 'selecting'
  | 'previewing'
  | 'committing'
  | 'done'
  | 'error'

export type ValidMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

const VALID_MEDIA_TYPES: ValidMediaType[] = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024 // 5 MB

export interface PreviewThought {
  id: null
  content: string
  source: 'image'
  confidence: number
  projectId: null
}

export interface PhotoPreviewResult {
  paperType: 'lined' | 'gridded' | 'unknown'
  confidence: number
  thoughts: PreviewThought[]
}

export interface PhotoCommitResult {
  paperType: 'lined' | 'gridded' | 'unknown'
  confidence: number
  thoughts: ThoughtApiResponse[]
}

export interface UsePhotoUploadReturn {
  phase: PhotoUploadPhase
  file: File | null
  imagePreviewUrl: string | null
  previewResult: PhotoPreviewResult | null
  commitResult: PhotoCommitResult | null
  error: string | null
  selectFile: (file: File) => void
  preview: () => Promise<void>
  commit: (forcePaperType?: 'lined' | 'gridded') => Promise<void>
  reset: () => void
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function usePhotoUpload(): UsePhotoUploadReturn {
  const [phase, setPhase] = useState<PhotoUploadPhase>('idle')
  const [file, setFile] = useState<File | null>(null)
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null)
  const [base64Image, setBase64Image] = useState<string | null>(null)
  const [mediaType, setMediaType] = useState<ValidMediaType | null>(null)
  const [previewResult, setPreviewResult] = useState<PhotoPreviewResult | null>(null)
  const [commitResult, setCommitResult] = useState<PhotoCommitResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reset = useCallback(() => {
    setPhase('idle')
    setFile(null)
    setImagePreviewUrl(null)
    setBase64Image(null)
    setMediaType(null)
    setPreviewResult(null)
    setCommitResult(null)
    setError(null)
  }, [])

  const selectFile = useCallback((selectedFile: File) => {
    // Validate file type
    if (!VALID_MEDIA_TYPES.includes(selectedFile.type as ValidMediaType)) {
      setError(`Unsupported file type: ${selectedFile.type}. Please use JPEG, PNG, GIF, or WebP.`)
      setPhase('error')
      return
    }

    // Validate file size (client-side guard — T-71-03)
    if (selectedFile.size > MAX_FILE_SIZE_BYTES) {
      setError('Image is too large. Please use an image under 5 MB.')
      setPhase('error')
      return
    }

    setPhase('selecting')
    setFile(selectedFile)
    setMediaType(selectedFile.type as ValidMediaType)

    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string
      setImagePreviewUrl(dataUrl)
      // Strip the data URL prefix to get raw base64
      const base64 = dataUrl.split(',')[1]
      setBase64Image(base64)
      setPhase('previewing')
    }
    reader.onerror = () => {
      setError('Failed to read file. Please try again.')
      setPhase('error')
    }
    reader.readAsDataURL(selectedFile)
  }, [])

  const preview = useCallback(async () => {
    if (!base64Image || !mediaType) {
      setError('No image selected.')
      setPhase('error')
      return
    }

    setPhase('previewing')
    setError(null)

    try {
      const res = await vigilFetch('/v1/process-photo?preview=true', {
        method: 'POST',
        body: JSON.stringify({ image: base64Image, mediaType }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        const msg = (body as { error?: string }).error ?? `Server error: ${res.status}`
        setError(msg)
        setPhase('error')
        return
      }

      const result: PhotoPreviewResult = await res.json()
      setPreviewResult(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze photo. Please try again.')
      setPhase('error')
    }
  }, [base64Image, mediaType])

  const commit = useCallback(
    async (forcePaperType?: 'lined' | 'gridded') => {
      if (!base64Image || !mediaType) {
        setError('No image selected.')
        setPhase('error')
        return
      }

      setPhase('committing')
      setError(null)

      try {
        const body: { image: string; mediaType: string; forcePaperType?: string } = {
          image: base64Image,
          mediaType,
        }
        if (forcePaperType) body.forcePaperType = forcePaperType

        const res = await vigilFetch('/v1/process-photo', {
          method: 'POST',
          body: JSON.stringify(body),
        })

        if (!res.ok) {
          const resBody = await res.json().catch(() => ({}))
          const msg = (resBody as { error?: string }).error ?? `Server error: ${res.status}`
          setError(msg)
          setPhase('error')
          return
        }

        const result: PhotoCommitResult = await res.json()
        setCommitResult(result)
        setPhase('done')
        window.dispatchEvent(new Event('vigil:thought-created'))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save thoughts. Please try again.')
        setPhase('error')
      }
    },
    [base64Image, mediaType],
  )

  return {
    phase,
    file,
    imagePreviewUrl,
    previewResult,
    commitResult,
    error,
    selectFile,
    preview,
    commit,
    reset,
  }
}
