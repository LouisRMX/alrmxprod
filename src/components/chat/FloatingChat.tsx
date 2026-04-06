'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useChatContext } from '@/context/ChatContext'
import { usePathname } from 'next/navigation'
import type { MemberRole } from '@/lib/getEffectiveMemberRole'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Message {
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
}

interface FloatingChatProps {
  userRole: MemberRole | null
  isAdmin: boolean
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function ChatIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function CloseIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function SendIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function FloatingChat({ userRole, isAdmin }: FloatingChatProps) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const pageContext = useChatContext()
  const pathname = usePathname()

  // Clear conversation on route change — avoids stale context confusion
  useEffect(() => {
    setMessages([])
    setError(null)
  }, [pathname])

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Focus input when panel opens
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 60)
  }, [open])

  const roleName = isAdmin ? 'system_admin' : (userRole ?? 'unknown')

  const sendMessage = useCallback(async () => {
    const text = input.trim()
    if (!text || loading) return

    setInput('')
    setError(null)

    // Snapshot of completed history before we add the new turn
    const historySnapshot = messages
      .filter(m => !m.streaming)
      .map(m => ({ role: m.role, content: m.content }))

    setMessages(prev => [
      ...prev,
      { role: 'user', content: text },
      { role: 'assistant', content: '', streaming: true },
    ])
    setLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: text,
          history: historySnapshot,
          pageContext,
          userRole: roleName,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `HTTP ${res.status}`)
      }

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') break
          try {
            const parsed = JSON.parse(data)
            if (parsed.error) throw new Error(parsed.error)
            if (parsed.text) {
              setMessages(prev => {
                const updated = [...prev]
                const last = updated[updated.length - 1]
                if (last?.role === 'assistant') {
                  updated[updated.length - 1] = { ...last, content: last.content + parsed.text, streaming: true }
                }
                return updated
              })
            }
          } catch {
            // malformed SSE chunk, skip
          }
        }
      }

      // Mark streaming complete
      setMessages(prev => {
        const updated = [...prev]
        const last = updated[updated.length - 1]
        if (last?.role === 'assistant') updated[updated.length - 1] = { ...last, streaming: false }
        return updated
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong'
      setError(msg)
      // Remove empty assistant placeholder
      setMessages(prev => prev.slice(0, -1))
    } finally {
      setLoading(false)
    }
  }, [input, loading, messages, pageContext, roleName])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  // Auto-resize textarea
  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 80) + 'px'
  }

  const plantSubtitle = pageContext?.plantName
    ? pageContext.plantName
    : 'Ask me anything about your plant'

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 9999 }}>

      {/* Expanded panel */}
      {open && (
        <div style={{
          position: 'absolute',
          bottom: 'calc(52px + 12px)',
          right: 0,
          width: '380px',
          height: '520px',
          background: 'var(--white)',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          boxShadow: '0 8px 40px rgba(0,0,0,0.14)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'chatSlideUp 0.18s ease-out',
        }}>

          {/* Header */}
          <div style={{
            padding: '13px 16px',
            borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'var(--white)', flexShrink: 0,
          }}>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--gray-900)' }}>
                Al-RMX Assistant
              </div>
              <div style={{ fontSize: '11px', color: 'var(--gray-400)', marginTop: '1px' }}>
                {plantSubtitle}
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close chat"
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--gray-400)', padding: '4px', borderRadius: '6px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                lineHeight: 1,
              }}
            >
              <CloseIcon />
            </button>
          </div>

          {/* Messages */}
          <div style={{
            flex: 1, overflowY: 'auto', padding: '12px 14px',
            display: 'flex', flexDirection: 'column', gap: '10px',
          }}>
            {messages.length === 0 && (
              <div style={{
                flex: 1, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                color: 'var(--gray-400)', fontSize: '13px', textAlign: 'center',
                gap: '10px', padding: '24px 16px',
              }}>
                <div style={{ fontSize: '32px' }}>💬</div>
                <div style={{ lineHeight: 1.5 }}>
                  Ask about scores, losses, or how to improve operations
                  {pageContext?.plantName ? ` at ${pageContext.plantName}` : ''}.
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} style={{
                display: 'flex',
                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
              }}>
                <div style={{
                  maxWidth: '88%',
                  padding: '9px 13px',
                  borderRadius: msg.role === 'user'
                    ? '14px 14px 4px 14px'
                    : '14px 14px 14px 4px',
                  background: msg.role === 'user' ? 'var(--green)' : 'var(--gray-50)',
                  color: msg.role === 'user' ? '#fff' : 'var(--gray-800)',
                  border: msg.role === 'assistant' ? '1px solid var(--border)' : 'none',
                  fontSize: '13px', lineHeight: 1.55, whiteSpace: 'pre-wrap',
                }}>
                  {msg.content === '' && msg.streaming
                    ? <span style={{ opacity: 0.45 }}>Thinking...</span>
                    : msg.content}
                  {msg.streaming && msg.content !== '' && (
                    <span style={{
                      display: 'inline-block', width: '2px', height: '13px',
                      background: 'var(--gray-400)', marginLeft: '2px',
                      verticalAlign: 'text-bottom',
                      animation: 'chatBlink 0.8s step-end infinite',
                    }} />
                  )}
                </div>
              </div>
            ))}

            {error && (
              <div style={{
                padding: '8px 12px', background: 'var(--error-bg)',
                border: '1px solid var(--error-border)', borderRadius: '8px',
                fontSize: '12px', color: 'var(--red)',
              }}>
                {error}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div style={{
            padding: '10px 12px 8px',
            borderTop: '1px solid var(--border)',
            background: 'var(--white)', flexShrink: 0,
          }}>
            <div style={{
              display: 'flex', gap: '8px', alignItems: 'flex-end',
              background: 'var(--gray-50)', border: '1px solid var(--border)',
              borderRadius: '10px', padding: '6px 8px 6px 12px',
            }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={handleInput}
                onKeyDown={handleKeyDown}
                placeholder="Ask about your plant..."
                disabled={loading}
                rows={1}
                style={{
                  flex: 1, border: 'none', background: 'none',
                  resize: 'none', outline: 'none',
                  fontSize: '13px', color: 'var(--gray-800)',
                  fontFamily: 'var(--font)', lineHeight: 1.5,
                  maxHeight: '80px', overflowY: 'auto',
                }}
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || loading}
                aria-label="Send message"
                style={{
                  background: input.trim() && !loading ? 'var(--green)' : 'var(--gray-200)',
                  color: input.trim() && !loading ? '#fff' : 'var(--gray-400)',
                  border: 'none', borderRadius: '7px',
                  width: '32px', height: '32px', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: input.trim() && !loading ? 'pointer' : 'default',
                  transition: 'background .15s, color .15s',
                }}
              >
                <SendIcon />
              </button>
            </div>

            <div style={{
              marginTop: '6px', fontSize: '10px',
              color: 'var(--gray-300)', textAlign: 'center',
            }}>
              Powered by Claude · Questions are logged
            </div>
          </div>
        </div>
      )}

      {/* Toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        aria-label={open ? 'Close AI assistant' : 'Open AI assistant'}
        style={{
          width: '52px', height: '52px', borderRadius: '50%',
          background: open ? 'var(--gray-700)' : 'var(--green)',
          color: '#fff', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 18px rgba(0,0,0,0.18)',
          transition: 'background .15s, transform .15s',
          transform: open ? 'scale(0.94)' : 'scale(1)',
        }}
      >
        {open ? <CloseIcon size={20} /> : <ChatIcon />}
      </button>

      <style>{`
        @keyframes chatSlideUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes chatBlink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0; }
        }
      `}</style>
    </div>
  )
}
