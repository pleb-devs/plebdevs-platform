"use client"

import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"

import { useNostr, type NormalizedProfile } from "@/hooks/useNostr"

export interface UseProfileSummaryOptions {
  enabled?: boolean
  staleTime?: number
  gcTime?: number
}

export function useProfileSummary(
  pubkey?: string | null,
  initialSummary?: NormalizedProfile | null,
  options: UseProfileSummaryOptions = {}
) {
  const { fetchProfile, normalizeKind0 } = useNostr()
  const normalizedPubkey = pubkey?.trim().toLowerCase() || ""
  const initialData = useMemo(() => initialSummary ?? null, [initialSummary])
  const {
    enabled = true,
    staleTime = 30 * 60 * 1000,
    gcTime = 60 * 60 * 1000,
  } = options

  const query = useQuery({
    queryKey: ["profile-summary", normalizedPubkey || "none"],
    queryFn: async () => {
      if (!normalizedPubkey) {
        return initialData
      }

      const profileEvent = await fetchProfile(normalizedPubkey)
      return normalizeKind0(profileEvent) ?? initialData
    },
    enabled: enabled && normalizedPubkey.length > 0,
    initialData,
    staleTime,
    gcTime,
    refetchOnWindowFocus: false,
    retry: 1,
  })

  return {
    ...query,
    profile: query.data ?? initialData,
  }
}
