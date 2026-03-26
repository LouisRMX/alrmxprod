'use client'

import { useEffect, useRef } from 'react'

export default function DemoPage() {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const hasSwitched = useRef(false)

  useEffect(() => {
    function handleLoad() {
      // Give the HTML tool a moment to initialize, then switch to portfolio/dashboard mode
      setTimeout(() => {
        if (iframeRef.current?.contentWindow && !hasSwitched.current) {
          hasSwitched.current = true
          iframeRef.current.contentWindow.postMessage(
            { type: 'ALRMX_DEMO_MODE' },
            '*'
          )
        }
      }, 500)
    }

    const iframe = iframeRef.current
    if (iframe) {
      iframe.addEventListener('load', handleLoad)
      return () => iframe.removeEventListener('load', handleLoad)
    }
  }, [])

  return (
    <iframe
      ref={iframeRef}
      src="/assessment-tool.html#demo"
      style={{
        width: '100%',
        flex: 1,
        border: 'none',
        minHeight: 'calc(100vh - 100px)',
      }}
    />
  )
}
