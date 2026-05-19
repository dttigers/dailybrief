import { useLayoutEffect, useRef, useState } from 'react'
import { createThought, triageThought, updateThought, type ThoughtApiResponse } from '../api/client'

interface CaptureBarProps {
  onCapture: (thought: ThoughtApiResponse) => void
  onCategoryUpdate: (id: number, category: string) => void
}

export default function CaptureBar({ onCapture, onCategoryUpdate }: CaptureBarProps) {
  const [input, setInput] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // D-03 / D-04: auto-grow up to the visual cap, reset to baseline when input clears.
  useLayoutEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = `${el.scrollHeight}px`
  }, [input])

  async function handleSubmit() {
    const trimmed = input.trim()
    if (!trimmed || isSubmitting) return

    setIsSubmitting(true)
    setError(null)

    try {
      const thought = await createThought(trimmed)
      onCapture(thought)
      setInput('')
      setIsSubmitting(false)

      // Fire-and-forget triage: never block capture on triage result
      triageThought(trimmed)
        .then((result) =>
          updateThought(thought.id, {
            category: result.category,
            ...(result.tags ? { tags: result.tags } : {}),
            ...(result.therapyClassification ? { therapyClassification: result.therapyClassification } : {}),
          }).then(() =>
            onCategoryUpdate(thought.id, result.category),
          ),
        )
        .catch(() => {
          // Silently swallow 503/502 — thought stays uncategorized
        })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save thought')
      setIsSubmitting(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSubmit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.currentTarget.blur()
    }
    // Plain Enter: textarea inserts newline by default (D-01)
  }

  return (
    <div className="sticky bottom-0 bg-gray-900 border-t border-gray-900/40 p-4">
      <div className="flex gap-2 max-w-4xl mx-auto items-end">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Capture a thought..."
          disabled={isSubmitting}
          rows={1}
          enterKeyHint="enter"
          className="flex-1 bg-gray-900/80 border border-gray-400/30 rounded-lg px-4 py-2.5 text-gray-50 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-600 resize-none max-h-36 overflow-y-auto"
        />
        <button
          onClick={handleSubmit}
          disabled={input.trim() === '' || isSubmitting}
          title="⌘+Enter"
          className="px-4 py-2.5 bg-teal-600 hover:bg-teal-400 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white font-medium transition-colors"
        >
          Save
        </button>
      </div>
      {error && (
        <p className="text-red-400 text-sm mt-1 max-w-4xl mx-auto">{error}</p>
      )}
    </div>
  )
}
