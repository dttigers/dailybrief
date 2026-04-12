import { useCallback, useState } from 'react'
import { sendChatMessage, type ChatMessage } from '../api/client'

export function useChat(): {
  messages: ChatMessage[]
  isLoading: boolean
  error: string | null
  contextUsed: number
  sendMessage: (content: string) => Promise<void>
  clearChat: () => void
} {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [contextUsed, setContextUsed] = useState(0)

  const sendMessage = useCallback(async (content: string) => {
    const userMessage: ChatMessage = { role: 'user', content }
    const newMessages = [...messages, userMessage]

    setMessages(newMessages)
    setIsLoading(true)
    setError(null)

    try {
      const result = await sendChatMessage(newMessages)
      setMessages((prev) => [...prev, { role: 'assistant', content: result.response }])
      setContextUsed(result.contextUsed)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send message')
      // Remove the user message that failed
      setMessages((prev) => prev.slice(0, -1))
    } finally {
      setIsLoading(false)
    }
  }, [messages])

  const clearChat = useCallback(() => {
    setMessages([])
    setContextUsed(0)
    setError(null)
  }, [])

  return { messages, isLoading, error, contextUsed, sendMessage, clearChat }
}
