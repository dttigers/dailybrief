import { useEffect, useRef, useState } from 'react'
import { useChat } from '../hooks/useChat'

export default function ChatPage() {
  const {
    sessions, activeSessionId, messages, isLoading, error, contextUsed,
    sendMessage, clearChat, loadSession, startNewSession, deleteSession,
  } = useChat()
  const [input, setInput] = useState('')
  const [showSessions, setShowSessions] = useState(false)
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
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-lg font-semibold text-slate-100">Chat</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSessions(!showSessions)}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            {showSessions ? 'Hide' : 'History'} ({sessions.length})
          </button>
          <button
            onClick={() => { clearChat(); setShowSessions(false) }}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            New chat
          </button>
        </div>
      </div>

      {/* Session list */}
      {showSessions && (
        <div className="mb-3 max-h-48 overflow-y-auto space-y-1 border border-slate-800 rounded-lg p-2">
          {sessions.length === 0 && (
            <p className="text-slate-500 text-xs text-center py-2">No saved chats</p>
          )}
          {sessions.map((s) => (
            <div
              key={s.id}
              className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer text-sm transition-colors ${
                s.id === activeSessionId
                  ? 'bg-indigo-600/20 text-indigo-300'
                  : 'hover:bg-slate-800 text-slate-300'
              }`}
              onClick={() => { loadSession(s.id); setShowSessions(false) }}
            >
              <span className="truncate flex-1">{s.title}</span>
              <button
                onClick={(e) => { e.stopPropagation(); deleteSession(s.id) }}
                className="text-slate-600 hover:text-red-400 ml-2 shrink-0"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

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
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
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

      {/* Error */}
      {error && (
        <div className="bg-red-900/50 text-red-300 px-4 py-2 rounded-lg text-sm mt-2">
          {error}
        </div>
      )}

      {/* Input */}
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
