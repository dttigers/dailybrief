import { useCallback, useEffect, useRef, useState } from 'react'
import {
  sendChatMessage,
  getChatSessions,
  getChatSession,
  createChatSession,
  updateChatSession,
  deleteChatSession,
  type ChatMessage,
  type ChatSession,
} from '../api/client'

export function useChat(options?: { skipAutoLoad?: boolean }) {
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  // Ref keeps messages always current — avoids stale closure in sendMessage useCallback
  const messagesRef = useRef<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [contextUsed, setContextUsed] = useState(0)

  // Keep ref in sync with state
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  const loadSession = useCallback(async (id: number) => {
    try {
      const session = await getChatSession(id)
      setActiveSessionId(id)
      setMessages(session.messages)
      setError(null)
      setContextUsed(0)
    } catch {
      setError('Failed to load session')
    }
  }, [])

  // D-09: Auto-resume most recent session on mount
  useEffect(() => {
    getChatSessions()
      .then((res) => {
        setSessions(res.data)
        if (res.data.length > 0 && !options?.skipAutoLoad) {
          loadSession(res.data[0].id)
        }
      })
      .catch(() => {})
  }, [loadSession]) // eslint-disable-line react-hooks/exhaustive-deps

  const startNewSession = useCallback(async () => {
    try {
      const session = await createChatSession()
      setSessions((prev) => [session, ...prev])
      setActiveSessionId(session.id)
      setMessages([])
      setError(null)
      setContextUsed(0)
    } catch {
      setError('Failed to create session')
    }
  }, [])

  const deleteSession = useCallback(async (id: number) => {
    try {
      await deleteChatSession(id)
      setSessions((prev) => prev.filter((s) => s.id !== id))
      if (activeSessionId === id) {
        setActiveSessionId(null)
        setMessages([])
        setContextUsed(0)
      }
    } catch {
      setError('Failed to delete session')
    }
  }, [activeSessionId])

  const sendMessage = useCallback(async (content: string) => {
    const userMessage: ChatMessage = { role: 'user', content }
    // Build newMessages from the ref (always current) rather than relying on the
    // functional state updater being called synchronously — in React 18 concurrent
    // mode the updater is called during the commit phase (asynchronously), so
    // reading o after setMessages(fn) still gives [] and the API gets an empty array.
    const newMessages = [...messagesRef.current, userMessage]
    setMessages(newMessages)
    setIsLoading(true)
    setError(null)

    try {
      const result = await sendChatMessage(newMessages)
      const updatedMessages = [...newMessages, { role: 'assistant' as const, content: result.response }]
      setMessages(updatedMessages)
      setContextUsed(result.contextUsed)

      // Persist to server
      if (activeSessionId) {
        const title = newMessages.length === 1
          ? content.slice(0, 50) + (content.length > 50 ? '...' : '')
          : undefined
        await updateChatSession(activeSessionId, {
          messages: updatedMessages,
          ...(title ? { title } : {}),
        }).catch(() => {}) // Non-blocking
        // Update session list
        setSessions((prev) =>
          prev.map((s) =>
            s.id === activeSessionId
              ? { ...s, messageCount: updatedMessages.length, title: title ?? s.title }
              : s,
          ),
        )
      } else {
        // Auto-create session on first message
        const title = content.slice(0, 50) + (content.length > 50 ? '...' : '')
        const session = await createChatSession(title)
        await updateChatSession(session.id, { messages: updatedMessages }).catch(() => {})
        setActiveSessionId(session.id)
        setSessions((prev) => [{ ...session, messageCount: updatedMessages.length }, ...prev])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send message')
      setMessages((prev) => prev.slice(0, -1))
    } finally {
      setIsLoading(false)
    }
  }, [activeSessionId])

  const clearChat = useCallback(() => {
    setActiveSessionId(null)
    setMessages([])
    setContextUsed(0)
    setError(null)
  }, [])

  return {
    sessions,
    activeSessionId,
    messages,
    isLoading,
    error,
    contextUsed,
    sendMessage,
    clearChat,
    loadSession,
    startNewSession,
    deleteSession,
  }
}
