"use client"

import dynamic from "next/dynamic"

import { useNearViewport } from "@/hooks/useNearViewport"
import type { ZapThreadsProps } from "@/components/ui/zap-threads"

const LazyZapThreads = dynamic(
  () => import("@/components/ui/zap-threads").then((mod) => mod.ZapThreads),
  {
    ssr: false,
    loading: () => <div className="min-h-40" aria-hidden="true" />,
  }
)

interface DeferredZapThreadsProps extends ZapThreadsProps {
  rootMargin?: string
}

export function DeferredZapThreads({
  rootMargin = "400px",
  ...props
}: DeferredZapThreadsProps) {
  const { ref, isNearViewport } = useNearViewport({ rootMargin })

  return (
    <div ref={ref}>
      {isNearViewport ? <LazyZapThreads {...props} /> : <div className="min-h-40" aria-hidden="true" />}
    </div>
  )
}
