import { useRef, useState } from 'react'
import { processAudio } from '../api/client'

type Phase = 'idle' | 'processing' | 'done' | 'error'

export default function AudioUploadSection() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [result, setResult] = useState<{ id: number; transcription: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate size (10 MB)
    if (file.size > 10 * 1024 * 1024) {
      setError('File exceeds 10 MB limit')
      setPhase('error')
      return
    }

    // Validate type
    const validTypes = ['audio/wav', 'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/m4a', 'audio/webm', 'audio/ogg', 'audio/x-m4a']
    const mediaType = file.type === 'audio/x-m4a' ? 'audio/m4a' : file.type
    if (!validTypes.includes(file.type) && !file.name.match(/\.(wav|mp3|m4a|mp4|webm|ogg)$/i)) {
      setError('Unsupported audio format. Use WAV, MP3, M4A, or WebM.')
      setPhase('error')
      return
    }

    setPhase('processing')
    setError(null)

    try {
      // Convert to base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          const dataUrl = reader.result as string
          // Strip "data:audio/wav;base64," prefix
          const base64Data = dataUrl.split(',')[1]
          resolve(base64Data)
        }
        reader.onerror = () => reject(new Error('Failed to read file'))
        reader.readAsDataURL(file)
      })

      const derivedMediaType = mediaType || `audio/${file.name.split('.').pop()?.toLowerCase()}`
      const response = await processAudio(base64, derivedMediaType)
      setResult({ id: response.id, transcription: response.transcription })
      setPhase('done')
      // Signal thoughts list to refetch (new thought created server-side)
      window.dispatchEvent(new Event('vigil:thought-created'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Audio processing failed')
      setPhase('error')
    }
  }

  function handleReset() {
    setPhase('idle')
    setResult(null)
    setError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  if (phase === 'idle') {
    return (
      <div>
        <h1 className="text-xl font-medium text-gray-50 mb-6">Upload Audio</h1>
        <label
          htmlFor="audio-input"
          className="flex flex-col items-center justify-center w-full border-2 border-dashed border-gray-400/30 hover:border-teal-600 rounded-xl px-6 py-12 cursor-pointer transition-colors"
        >
          <svg className="w-12 h-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
          <p className="text-gray-100 font-medium mb-1">Upload an audio recording</p>
          <p className="text-gray-400 text-sm">WAV, MP3, M4A, WebM — max 10 MB</p>
          <input
            ref={fileInputRef}
            id="audio-input"
            type="file"
            accept="audio/*,.wav,.mp3,.m4a,.webm,.ogg,.mp4,.caf"
            className="sr-only"
            onChange={handleFileChange}
          />
        </label>
      </div>
    )
  }

  if (phase === 'processing') {
    return (
      <div>
        <h1 className="text-xl font-medium text-gray-50 mb-6">Upload Audio</h1>
        <div className="flex items-center gap-3 text-gray-400">
          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span>Transcribing audio with Claude...</span>
        </div>
      </div>
    )
  }

  if (phase === 'done' && result) {
    return (
      <div>
        <h1 className="text-xl font-medium text-gray-50 mb-6">Upload Audio</h1>
        <div className="bg-green-900/30 border border-green-700/40 rounded-xl px-6 py-6">
          <div className="flex items-center gap-2 mb-4">
            <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-green-300 font-medium">Thought saved</p>
          </div>
          <div className="bg-gray-900/80 p-3 rounded-lg mb-4">
            <p className="text-gray-100 text-sm">{result.transcription}</p>
          </div>
          <button
            onClick={handleReset}
            className="bg-teal-600 hover:bg-teal-400 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Upload Another
          </button>
        </div>
      </div>
    )
  }

  // Error state
  return (
    <div>
      <h1 className="text-xl font-medium text-gray-50 mb-6">Upload Audio</h1>
      <div className="bg-red-900/30 border border-red-700/40 rounded-xl px-6 py-8 text-center">
        <p className="text-red-300 font-medium mb-1">Something went wrong</p>
        {error && <p className="text-gray-400 text-sm mb-6">{error}</p>}
        <button
          onClick={handleReset}
          className="bg-teal-600 hover:bg-teal-400 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          Try Again
        </button>
      </div>
    </div>
  )
}
