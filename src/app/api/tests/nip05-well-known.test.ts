import { describe, expect, it } from "vitest"
import { GET, OPTIONS } from "../../.well-known/nostr.json/route"

const PUBKEY = "f33c8a9617cb15f705fc70cd461cfd6eaf22f9e24c33eabad981648e5ec6f741"

describe("NIP-05 well-known route", () => {
  it("resolves plebdevs name to the configured pubkey", async () => {
    const request = new Request("https://plebdevs.com/.well-known/nostr.json?name=plebdevs")
    const response = await GET(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*")
    expect(payload.names).toEqual({ plebdevs: PUBKEY })
    expect(payload.relays?.[PUBKEY]?.length).toBeGreaterThan(0)
  })

  it("returns empty names for unknown identifiers", async () => {
    const request = new Request("https://plebdevs.com/.well-known/nostr.json?name=unknown")
    const response = await GET(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.names).toEqual({})
    expect(payload.relays).toBeUndefined()
  })

  it("returns CORS headers on OPTIONS", async () => {
    const response = await OPTIONS()

    expect(response.status).toBe(204)
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*")
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain("GET")
  })
})
