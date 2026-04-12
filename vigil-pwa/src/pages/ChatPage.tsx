import { useEffect, useRef, useState } from 'react'
import { useChat } from '../hooks/useChat'

export default function ChatPage() {
  const { messages, isLoading, error, contextUsed, sendMessage, clearChat } = useChat()
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = input.trim()
    if (!trimmed || isLoading) return
    setInput('')
    await sendMessage(trimmed)
  }

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 10rem)' }}>
      {/* Header row with clear button */}
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-lg font-semibold text-slate-100">Chat</h1>
        {messages.length > 0 && (
          <button
            onClick={clearChat}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            Clear chat
          </button>
        )}
      </div>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {messages.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center h-full text-center py-16">
            <p className="text-slate-400 text-sm">
              Ask Vigil anything about your thoughts, tasks, or plans.
            </p>
            <p className="text-slate-600 text-xs mt-2">
              Vigil has context from your recent captured thoughts.
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-800 text-slate-100'
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {/* Loading indicator */}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-slate-800 text-slate-400 px-4 py-2.5 rounded-2xl text-sm animate-pulse">
              ...
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Context badge */}
      {contextUsed > 0 && (
        <p className="text-xs text-slate-500 mt-2 mb-1">
          Using context from {contextUsed} recent thought{contextUsed !== 1 ? 's' : ''}
        </p>
      )}

      {/* Error banner */}
      {error && (
        <div className="bg-red-900/50 text-red-300 px-4 py-2 rounded-lg text-sm mt-2">
          {error}
        </div>
      )}

      {/* Input area */}
      <form onSubmit={handleSubmit} className="mt-3 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Message Vigil..."
          className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 w-full text-sm focus:outline-none focus:border-indigo-500 transition-colors"
          disabled={isLoading}
        />
        <button
          type="submit"
          disabled={!input.trim() || isLoading}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-3 rounded-lg text-sm font-medium transition-colors shrink-0"
        >
          Send
        </button>
      </form>
    </div>
  )
}
