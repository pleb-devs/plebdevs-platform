import { NextResponse } from "next/server"
import { DEFAULT_RELAYS } from "@/lib/nostr-relays"

// LOCAL CUSTOMIZATION NOTE (plebdevs.com):
// This NIP-05 endpoint is a temporary fork-specific addition while upstream
// pleb.school support is still evolving. Keep this route during upstream syncs
// unless/ until an equivalent upstream implementation is adopted.
const PLEBDEVS_NIP05_PUBKEY = "f33c8a9617cb15f705fc70cd461cfd6eaf22f9e24c33eabad981648e5ec6f741"

// We expose both "plebdevs@plebdevs.com" and the root-style "_@plebdevs.com".
const PLATFORM_NAMES: Record<string, string> = {
  plebdevs: PLEBDEVS_NIP05_PUBKEY,
  _: PLEBDEVS_NIP05_PUBKEY,
}

const NAME_PATTERN = /^[a-z0-9._-]+$/

function buildCorsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "public, max-age=300, s-maxage=300",
  }
}

function buildNamesPayload(name: string | null): Record<string, string> {
  if (!name) {
    return PLATFORM_NAMES
  }

  const normalized = name.trim().toLowerCase()
  if (!normalized || !NAME_PATTERN.test(normalized)) {
    return {}
  }

  const pubkey = PLATFORM_NAMES[normalized]
  return pubkey ? { [normalized]: pubkey } : {}
}

export async function GET(request: Request) {
  const requestedName = new URL(request.url).searchParams.get("name")
  const names = buildNamesPayload(requestedName)

  const payload: {
    names: Record<string, string>
    relays?: Record<string, string[]>
  } = { names }

  if (Object.keys(names).length > 0) {
    payload.relays = {
      [PLEBDEVS_NIP05_PUBKEY]: DEFAULT_RELAYS,
    }
  }

  return NextResponse.json(payload, { headers: buildCorsHeaders() })
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: buildCorsHeaders() })
}
