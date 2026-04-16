import { useState } from 'react'
import { createThought, triageThought, updateThought, type ThoughtApiResponse } from '../api/client'

interface CaptureBarProps {
  onCapture: (thought: ThoughtApiResponse) => void
  onCategoryUpdate: (id: number, category: string) => void
}

export default function CaptureBar({ onCapture, onCategoryUpdate }: CaptureBarProps) {
  const [input, setInput] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="sticky bottom-0 bg-gray-900 border-t border-gray-900/40 p-4">
      <div className="flex gap-2 max-w-4xl mx-auto">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Capture a thought..."
          disabled={isSubmitting}
          className="flex-1 bg-gray-900/80 border border-gray-400/30 rounded-lg px-4 py-2.5 text-gray-50 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-600"
        />
        <button
          onClick={handleSubmit}
          disabled={input.trim() === '' || isSubmitting}
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
