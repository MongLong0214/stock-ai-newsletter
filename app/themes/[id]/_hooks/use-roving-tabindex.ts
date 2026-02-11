/** 카드 리스트 키보드 탐색 (roving tabindex 패턴) */
'use client'

import { useCallback, useRef } from 'react'

export default function useRovingTabindex() {
  const containerRef = useRef<HTMLDivElement>(null)

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const container = containerRef.current
    if (!container) return

    const items = Array.from(container.querySelectorAll<HTMLElement>('[role="button"]'))
    const idx = items.indexOf(e.target as HTMLElement)
    if (idx === -1) return

    let next: number | null = null
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        next = (idx + 1) % items.length
        break
      case 'ArrowUp':
      case 'ArrowLeft':
        next = (idx - 1 + items.length) % items.length
        break
      case 'Home':
        next = 0
        break
      case 'End':
        next = items.length - 1
        break
    }

    if (next !== null) {
      e.preventDefault()
      items[next].focus()
    }
  }, [])

  return { containerRef, handleKeyDown }
}
