import { useRef, useState } from 'react'
import { usePhotoUpload } from '../hooks/usePhotoUpload'

export default function PhotoUploadPage() {
  const { phase, imagePreviewUrl, previewResult, commitResult, error, selectFile, preview, commit, reset } =
    usePhotoUpload()

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [forcePaperType, setForcePaperType] = useState<'lined' | 'gridded' | undefined>(undefined)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    // Reset override whenever a new file is selected
    setForcePaperType(undefined)
    selectFile(file)
  }

  // After selectFile transitions to "previewing" phase, auto-trigger the API call
  // We use a separate effect-like pattern — the page calls preview() once the
  // base64 is ready (phase === 'previewing' and no previewResult yet).
  const hasCalledPreview = useRef(false)
  if (phase === 'previewing' && !previewResult && !error && !hasCalledPreview.current) {
    hasCalledPreview.current = true
    preview()
  }
  // Reset the flag whenever we go back to idle
  if (phase === 'idle') {
    hasCalledPreview.current = false
  }

  function handleReset() {
    hasCalledPreview.current = false
    setForcePaperType(undefined)
    reset()
    // Clear file input so same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function handleCommit() {
    commit(forcePaperType)
  }

  // ---- IDLE STATE ----
  if (phase === 'idle' || phase === 'selecting') {
    return (
      <div>
        <h1 className="text-xl font-medium text-gray-50 mb-6">Upload Photo</h1>
        <label
          htmlFor="photo-input"
          className="flex flex-col items-center justify-center w-full border-2 border-dashed border-gray-400/30 hover:border-teal-600 rounded-xl px-6 py-12 cursor-pointer transition-colors"
        >
          <svg
            className="w-12 h-12 text-gray-400 mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
          <p className="text-gray-100 font-medium mb-1">Upload a photo of handwritten notes</p>
          <p className="text-gray-400 text-sm">JPEG, PNG, GIF or WebP — max 5 MB</p>
          <input
            ref={fileInputRef}
            id="photo-input"
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            capture="environment"
            className="sr-only"
            onChange={handleFileChange}
          />
        </label>
      </div>
    )
  }

  // ---- PREVIEWING (loading) STATE ----
  if (phase === 'previewing' && !previewResult) {
    return (
      <div>
        <h1 className="text-xl font-medium text-gray-50 mb-6">Upload Photo</h1>
        {imagePreviewUrl && (
          <img
            src={imagePreviewUrl}
            alt="Selected photo"
            className="max-h-48 rounded-lg mb-6 object-contain"
          />
        )}
        <div className="flex items-center gap-3 text-gray-400">
          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          <span>Analyzing photo...</span>
        </div>
      </div>
    )
  }

  // ---- PREVIEW RESULT STATE ----
  if ((phase === 'previewing' || phase === 'committing') && previewResult) {
    const paperLabel = previewResult.paperType === 'lined'
      ? 'Lined'
      : previewResult.paperType === 'gridded'
        ? 'Gridded'
        : 'Unknown'

    const confidencePct = Math.round(previewResult.confidence * 100)

    return (
      <div>
        <h1 className="text-xl font-medium text-gray-50 mb-6">Review Transcription</h1>

        {/* Photo thumbnail */}
        {imagePreviewUrl && (
          <img
            src={imagePreviewUrl}
            alt="Selected photo"
            className="max-h-48 rounded-lg mb-4 object-contain"
          />
        )}

        {/* Paper type badge */}
        <div className="flex items-center gap-3 mb-4">
          <span className="inline-flex items-center gap-1.5 bg-teal-600/20 text-teal-400 rounded-full px-3 py-1 text-sm font-medium">
            {paperLabel}
          </span>
          <span className="text-gray-400 text-sm">{confidencePct}% confidence</span>
        </div>

        {/* Paper type override */}
        <div className="flex items-center gap-2 mb-5">
          <span className="text-gray-400 text-sm">Override:</span>
          <button
            onClick={() => setForcePaperType(forcePaperType === 'lined' ? undefined : 'lined')}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              forcePaperType === 'lined'
                ? 'bg-teal-600 text-white'
                : 'bg-gray-900/80 text-gray-400 hover:text-gray-50'
            }`}
          >
            Lined
          </button>
          <button
            onClick={() => setForcePaperType(forcePaperType === 'gridded' ? undefined : 'gridded')}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              forcePaperType === 'gridded'
                ? 'bg-teal-600 text-white'
                : 'bg-gray-900/80 text-gray-400 hover:text-gray-50'
            }`}
          >
            Gridded
          </button>
          {forcePaperType && (
            <span className="text-xs text-gray-400 ml-1">
              (will use {forcePaperType} when saving)
            </span>
          )}
        </div>

        {/* Detected thoughts */}
        <div className="space-y-2 mb-6">
          <p className="text-sm text-gray-400 mb-2">
            {previewResult.thoughts.length} thought{previewResult.thoughts.length !== 1 ? 's' : ''} detected
          </p>
          {previewResult.thoughts.map((thought, i) => (
            <div key={i} className="bg-gray-900/80 p-3 rounded-lg">
              <p className="text-gray-100 text-sm whitespace-pre-line">{thought.content}</p>
            </div>
          ))}
        </div>

        {/* Actions */}
        {phase === 'committing' ? (
          <div className="flex items-center gap-3 text-gray-400">
            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            <span>Saving thoughts...</span>
          </div>
        ) : (
          <div className="flex gap-3">
            <button
              onClick={handleCommit}
              className="bg-teal-600 hover:bg-teal-400 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              Save Thoughts
            </button>
            <button
              onClick={handleReset}
              className="bg-gray-900/80 hover:bg-gray-400/30 text-gray-100 px-5 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    )
  }

  // ---- DONE STATE ----
  if (phase === 'done' && commitResult) {
    const count = commitResult.thoughts.length
    return (
      <div>
        <h1 className="text-xl font-medium text-gray-50 mb-6">Upload Photo</h1>
        <div className="bg-green-900/30 border border-green-700/40 rounded-xl px-6 py-8 text-center">
          <svg
            className="w-12 h-12 text-green-400 mx-auto mb-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p className="text-green-300 font-medium text-lg mb-1">
            {count} thought{count !== 1 ? 's' : ''} saved
          </p>
          <p className="text-gray-400 text-sm mb-6">
            Your handwritten notes have been added to Thoughts.
          </p>
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

  // ---- ERROR STATE ----
  if (phase === 'error') {
    return (
      <div>
        <h1 className="text-xl font-medium text-gray-50 mb-6">Upload Photo</h1>
        <div className="bg-red-900/30 border border-red-700/40 rounded-xl px-6 py-8 text-center">
          <svg
            className="w-12 h-12 text-red-400 mx-auto mb-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
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

  // Fallback (should not normally be reached)
  return null
}
