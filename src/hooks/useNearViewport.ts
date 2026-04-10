"use client"

import { useEffect, useRef, useState } from "react"

interface UseNearViewportOptions {
  rootMargin?: string
  threshold?: number
}

export function useNearViewport(options: UseNearViewportOptions = {}) {
  const { rootMargin = "400px", threshold = 0 } = options
  const ref = useRef<HTMLDivElement | null>(null)
  const [isNearViewport, setIsNearViewport] = useState(false)

  useEffect(() => {
    if (isNearViewport) {
      return
    }

    if (typeof IntersectionObserver === "undefined") {
      setIsNearViewport(true)
      return
    }

    const node = ref.current
    if (!node) {
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setIsNearViewport(true)
          observer.disconnect()
        }
      },
      { rootMargin, threshold }
    )

    observer.observe(node)

    return () => {
      observer.disconnect()
    }
  }, [isNearViewport, rootMargin, threshold])

  return { ref, isNearViewport }
}
