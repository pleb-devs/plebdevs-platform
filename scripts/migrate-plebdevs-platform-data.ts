import 'dotenv/config'

import { PrismaClient } from '../src/generated/prisma'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

type ConflictStrategy = "skip" | "update" | "error"

interface CliOptions {
  sourceUrl: string
  targetUrl: string
  dryRun: boolean
  batchSize: number
  failFast: boolean
  strategy: ConflictStrategy
  allowNonEmptyTarget: boolean
  includeOnly: Set<string> | null
}

interface MigrationResult {
  rowsSeen: number
  created: number
  updated: number
  skipped: number
  invalid: number
  failed: number
}

type MigrationAction = "created" | "updated" | "skipped" | "invalid"

interface MigrationStep {
  name: string
  sourceTables: string[]
  sourceOrderColumns: string[]
  mapRow: (row: Record<string, unknown>) => Record<string, unknown> | null
  write: (tx: any, row: Record<string, unknown>, options: CliOptions) => Promise<MigrationAction>
}

const USER_TABLE_CANDIDATES = ["User"]
const ROLE_TABLE_CANDIDATES = ["Role"]
const ACCOUNT_TABLE_CANDIDATES = ["Account"]
const SESSION_TABLE_CANDIDATES = ["Session"]
const VERIFICATION_TOKEN_TABLE_CANDIDATES = ["VerificationToken"]
const RESOURCE_TABLE_CANDIDATES = ["Resource"]
const DRAFT_TABLE_CANDIDATES = ["Draft"]
const COURSE_TABLE_CANDIDATES = ["Course"]
const COURSE_DRAFT_TABLE_CANDIDATES = ["CourseDraft"]
const LESSON_TABLE_CANDIDATES = ["Lesson"]
const DRAFT_LESSON_TABLE_CANDIDATES = ["DraftLesson"]
const PURCHASE_TABLE_CANDIDATES = ["Purchase"]
const USER_LESSON_TABLE_CANDIDATES = ["UserLesson"]
const USER_COURSE_TABLE_CANDIDATES = ["UserCourse"]
const PLATFORM_NIP05_TABLE_CANDIDATES = ["PlatformNip05"]
const PLATFORM_LIGHTNING_ADDRESS_TABLE_CANDIDATES = ["PlatformLightningAddress"]
const BADGE_TABLE_CANDIDATES = ["Badge"]
const USER_BADGE_TABLE_CANDIDATES = ["UserBadge"]
const VIEW_TOTAL_TABLE_CANDIDATES = ["ViewCounterTotal"]
const VIEW_DAILY_TABLE_CANDIDATES = ["ViewCounterDaily"]
const AUDIT_LOG_TABLE_CANDIDATES = ["AuditLog"]

async function main() {
  const options = parseCli(process.argv.slice(2))

  if (options.includeOnly === null && process.argv.includes("--help")) {
    printHelp()
    return
  }

  if (!options.sourceUrl) {
    throw new Error("Missing OLD_DATABASE_URL / SOURCE_DATABASE_URL")
  }
  if (!options.targetUrl) {
    throw new Error("Missing NEW_DATABASE_URL / DATABASE_URL")
  }

  const source = createPrismaClient(options.sourceUrl)
  const target = createPrismaClient(options.targetUrl)

  try {
    if (!options.allowNonEmptyTarget) {
      await enforceEmptyTarget(target)
    }

    const sourceColumns = await readTableColumns(source)
    const steps = buildSteps(options)

    const filteredSteps = steps.filter((step) => {
      if (!options.includeOnly || options.includeOnly.size === 0) return true
      return options.includeOnly.has(step.name)
    })

    for (const step of filteredSteps) {
      const sourceTable = resolveSourceTable(sourceColumns, step.sourceTables)
      if (!sourceTable) {
        console.warn(`⚠️  Step "${step.name}" skipped: no matching source table found among [${step.sourceTables.join(", ")}]`)
        continue
      }

      console.log(`\n▶ Migrating ${step.name} from ${sourceTable}`)
      const tableResult = await migrateStep({
        step,
        source,
        target,
        sourceTable,
        sourceColumns,
        options,
      })

      console.log(`  done: ${formatResult(tableResult)}`)
    }

    console.log("\n✅ Migration script completed.")
  } finally {
    await source.$disconnect()
    await target.$disconnect()
  }
}

function printHelp() {
  console.log(`Usage:
  npx tsx scripts/migrate-plebdevs-platform-data.ts [options]

Environment:
  OLD_DATABASE_URL     PostgreSQL connection URL for old platform
  NEW_DATABASE_URL     PostgreSQL connection URL for new platform

Options:
  --source-url=URL            override OLD_DATABASE_URL / SOURCE_DATABASE_URL
  --target-url=URL            override NEW_DATABASE_URL / DATABASE_URL
  --dry-run                   read-only run (no writes)
  --batch-size=N              rows per batch (default: 500)
  --fail-fast                 stop on first row error
  --allow-non-empty           allow migration to run when target has existing rows
  --include=users,course,...   run only selected entity names
  --strategy=skip|update|error conflict handling for duplicate rows when target already has data
                               skip: skip duplicates (default)
                               update: upsert by row id / token / identifier
                               error: throw on first duplicate

Notes:
  - Assumes source schemas are close to the current prisma schema.
  - The script uses tolerant field aliasing for common historical name differences.
`)
}

function createPrismaClient(databaseUrl: string): PrismaClient {
  const pool = new Pool({ connectionString: databaseUrl })
  const adapter = new PrismaPg(pool)
  return new PrismaClient({ adapter })
}

function parseCli(argv: string[]): CliOptions {
  const getArg = (prefix: string, fallback?: string) => {
    const exact = argv.find((item) => item.startsWith(`${prefix}=`))
    if (exact) {
      return exact.slice(prefix.length + 1)
    }
    const index = argv.indexOf(prefix)
    if (index >= 0 && index + 1 < argv.length) {
      return argv[index + 1]
    }
    return fallback
  }

  const hasFlag = (flag: string) => argv.includes(flag)

  const sourceUrl =
    getArg("--source-url", process.env.OLD_DATABASE_URL || process.env.SOURCE_DATABASE_URL) || ""
  const targetUrl = getArg("--target-url", process.env.NEW_DATABASE_URL || process.env.DATABASE_URL) || ""
  const batchSize = Number.parseInt(getArg("--batch-size", "500") || "500", 10)
  const strategy = (getArg("--strategy", "skip") as ConflictStrategy) || "skip"
  const includeOnlyRaw = getArg("--include")
  const includeOnly = includeOnlyRaw
    ? new Set(includeOnlyRaw.split(",").map((value) => value.trim()).filter(Boolean))
    : null

  if (!["skip", "update", "error"].includes(strategy)) {
    throw new Error("Invalid --strategy. Use skip, update, or error")
  }

  return {
    sourceUrl,
    targetUrl,
    dryRun: hasFlag("--dry-run"),
    batchSize: Number.isFinite(batchSize) && batchSize > 0 ? batchSize : 500,
    failFast: hasFlag("--fail-fast"),
    strategy,
    allowNonEmptyTarget: hasFlag("--allow-non-empty") || hasFlag("--force"),
    includeOnly,
  }
}

async function enforceEmptyTarget(target: PrismaClient) {
  const targetTables = await target.$queryRaw<
    { table_name: string }[]
  >`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
  `
  const existingTables = new Set(
    targetTables.map((row) => String(row.table_name))
  )

  const candidateTables = [
    "User",
    "Account",
    "Session",
    "VerificationToken",
    "Role",
    "Resource",
    "Draft",
    "Course",
    "CourseDraft",
    "Lesson",
    "DraftLesson",
    "UserLesson",
    "UserCourse",
    "Purchase",
    "PlatformNip05",
    "PlatformLightningAddress",
    "Badge",
    "UserBadge",
    "ViewCounterTotal",
    "ViewCounterDaily",
    "AuditLog",
  ]

  const populatedTables: string[] = []

  for (const tableName of candidateTables) {
    if (!existingTables.has(tableName)) continue

    const countResult = await target.$queryRawUnsafe<
      { count: string }[]
    >(`SELECT COUNT(*)::bigint AS count FROM "${tableName}"`)
    const count = Number.parseInt(countResult[0]?.count ?? "0", 10)
    if (count > 0) {
      populatedTables.push(`${tableName}=${count}`)
    }
  }

  if (populatedTables.length > 0) {
    throw new Error(
      `Refusing to migrate into a non-empty target database. Populated tables: ${populatedTables.join(", ")}. ` +
        "Pass --allow-non-empty to proceed."
    )
  }
}

async function readTableColumns(client: PrismaClient): Promise<Map<string, Set<string>>> {
  const rows = await client.$queryRaw<
    { table_name: string; column_name: string }[]
  >`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
  `

  const byTable = new Map<string, Set<string>>()
  for (const row of rows) {
    const table = String(row.table_name)
    const cols = byTable.get(table) ?? new Set<string>()
    cols.add(String(row.column_name).toLowerCase())
    byTable.set(table, cols)
  }

  return byTable
}

function resolveSourceTable(tableColumns: Map<string, Set<string>>, candidates: string[]): string | null {
  const normalized = new Map<string, string>()
  for (const tableName of tableColumns.keys()) {
    normalized.set(tableName.toLowerCase(), tableName)
  }
  for (const candidate of candidates) {
    const hit = normalized.get(candidate.toLowerCase())
    if (hit) {
      return hit
    }
  }
  return null
}

function resolveOrderColumn(columns: Set<string> | undefined, candidates: string[]): string {
  if (!columns) {
    return ""
  }
  for (const candidate of candidates) {
    if (columns.has(candidate.toLowerCase())) return candidate
  }
  return ""
}

async function migrateStep(context: {
  step: MigrationStep
  source: PrismaClient
  target: PrismaClient
  sourceTable: string
  sourceColumns: Map<string, Set<string>>
  options: CliOptions
}) {
  const { step, source, target, sourceTable, sourceColumns, options } = context
  const result: MigrationResult = {
    rowsSeen: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    invalid: 0,
    failed: 0,
  }

  const rowCount = await countRows(source, sourceTable)
  console.log(`  source rows: ${rowCount}`)
  if (rowCount === 0) {
    return result
  }

  const sourceColumnSet = sourceColumns.get(sourceTable) ?? new Set<string>()
  const orderColumn = resolveOrderColumn(sourceColumnSet, step.sourceOrderColumns)
  const orderClause = orderColumn ? `"${orderColumn}"` : "1"

  let offset = 0
  while (true) {
    const rows = await source.$queryRawUnsafe<
      Record<string, unknown>[]
    >(`SELECT * FROM "${sourceTable}" ORDER BY ${orderClause} LIMIT ${options.batchSize} OFFSET ${offset}`)

    if (rows.length === 0) break
    offset += rows.length
    result.rowsSeen += rows.length

    const mappedRows = rows
      .map((row) => step.mapRow(row))
      .filter((row): row is Record<string, unknown> => row !== null)

    if (options.dryRun) {
      result.skipped += mappedRows.length
      continue
    }

    if (mappedRows.length === 0) {
      result.skipped += rows.length
      continue
    }

    for (const mapped of mappedRows) {
      try {
        const action = await step.write(target as any, mapped, options)
        if (action === "created") result.created++
        if (action === "updated") result.updated++
        if (action === "skipped") result.skipped++
        if (action === "invalid") result.invalid++
      } catch (error) {
        result.failed++
        console.error(`    ⚠️  ${step.name} row failed`, mapped)
        if (error instanceof Error) {
          console.error(`       ${error.message}`)
        }
        if (options.failFast) {
          throw error
        }
      }
    }
  }

  return result
}

function formatResult(result: MigrationResult) {
  return `rows=${result.rowsSeen}, created=${result.created}, updated=${result.updated}, skipped=${result.skipped}, invalid=${result.invalid}, failed=${result.failed}`
}

async function countRows(client: PrismaClient, table: string) {
  const rows = await client.$queryRawUnsafe<{ count: string }[]>(`SELECT COUNT(*)::bigint AS count FROM "${table}"`)
  const rawCount = rows[0]?.count ?? "0"
  return Number.parseInt(rawCount, 10)
}

function normalizeColumnKey(key: string) {
  return String(key).replace(/[^a-z0-9]/gi, "").toLowerCase()
}

function createRowReader(row: Record<string, unknown>) {
  const normalized = new Map<string, unknown>()
  for (const [key, value] of Object.entries(row)) {
    normalized.set(normalizeColumnKey(key), value)
  }

  return (aliases: string[]) => {
    for (const alias of aliases) {
      if (Object.prototype.hasOwnProperty.call(row, alias)) {
        const value = (row as Record<string, unknown>)[alias]
        if (value !== undefined) return value
      }
    }

    for (const alias of aliases) {
      const normalizedValue = normalized.get(normalizeColumnKey(alias))
      if (normalizedValue !== undefined) return normalizedValue
    }

    return undefined
  }
}

function asOptionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  const str = String(value).trim()
  if (str.length === 0) return undefined
  return str
}

function asDate(value: unknown): Date | undefined {
  if (value === undefined || value === null) return undefined
  const date = value instanceof Date ? value : new Date(String(value))
  if (Number.isNaN(date.getTime())) return undefined
  return date
}

function asBoolean(value: unknown, fallback = false): boolean {
  if (value === undefined || value === null) return fallback
  if (typeof value === "boolean") return value
  const normalized = String(value).toLowerCase()
  if (["true", "1", "t", "y", "yes"].includes(normalized)) return true
  if (["false", "0", "f", "n", "no"].includes(normalized)) return false
  return fallback
}

function asInt(value: unknown, fallback = 0): number {
  if (value === undefined || value === null || value === "") return fallback
  const numberValue = typeof value === "number" ? value : Number.parseInt(String(value), 10)
  return Number.isFinite(numberValue) ? numberValue : fallback
}

function asBigInt(value: unknown, fallback = BigInt(0)): bigint | undefined {
  if (value === undefined || value === null || value === "") return fallback
  try {
    if (typeof value === "bigint") return value
    return BigInt(String(value))
  } catch {
    return fallback
  }
}

function asJson(value: unknown, fallback: unknown = {}) {
  if (value === undefined || value === null) return fallback
  if (typeof value === "object") return value
  if (typeof value === "string") {
    try {
      return JSON.parse(value)
    } catch {
      return fallback
    }
  }
  return fallback
}

function asStringArray(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return []
  if (Array.isArray(value)) return value.map((item) => String(item))
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (!trimmed) return []
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      const parsed = asJson(value, []) as unknown[]
      return Array.isArray(parsed) ? parsed.map((item) => String(item)) : []
    }
    return trimmed.split(",").map((item) => item.trim()).filter(Boolean)
  }
  return []
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const next = { ...obj }
  for (const key of Object.keys(next)) {
    if (next[key] === undefined) {
      delete next[key]
    }
  }
  return next
}

async function writeById(delegate: any, row: Record<string, unknown>, options: CliOptions): Promise<MigrationAction> {
  const id = asOptionalString(row.id)
  if (!id) return "invalid"

  if (options.dryRun) {
    return "skipped"
  }

  const cleanPayload = stripUndefined({ ...row }) as Record<string, unknown>
  const { id: _unused, ...updatePayload } = cleanPayload

  const existing = await delegate.findUnique({
    where: { id },
    select: { id: true },
  })

  if (existing) {
    if (options.strategy === "skip") return "skipped"
    if (options.strategy === "error") {
      throw new Error(`Conflict on id=${id}`)
    }
    await delegate.update({ where: { id }, data: updatePayload })
    return "updated"
  }

  await delegate.create({ data: cleanPayload })
  return "created"
}

function writeVerificationToken(delegate: any, row: Record<string, unknown>, options: CliOptions): Promise<MigrationAction> {
  const token = asOptionalString(row.token)
  if (!token) return Promise.resolve("invalid")
  if (options.dryRun) return Promise.resolve("skipped")

  return Promise.resolve(options.strategy)
    .then(async () => {
      const payload = stripUndefined({ ...row }) as Record<string, unknown>
      const where = { token }
      const existing = await delegate.findUnique({ where, select: { token: true } })
      if (existing) {
        if (options.strategy === "skip") return "skipped" as MigrationAction
        if (options.strategy === "error") throw new Error(`Conflict on token=${token}`)
        await delegate.update({ where, data: payload })
        return "updated"
      }

      await delegate.create({ data: payload })
      return "created"
    })
}

function buildSteps(options: CliOptions): MigrationStep[] {
  const steps: MigrationStep[] = [
    {
      name: "users",
      sourceTables: USER_TABLE_CANDIDATES,
      sourceOrderColumns: ["createdAt", "created_at", "created", "id"],
      mapRow: mapUser,
      write: (tx, row) => writeById(tx.user, row, options),
    },
    {
      name: "accounts",
      sourceTables: ACCOUNT_TABLE_CANDIDATES,
      sourceOrderColumns: ["createdAt", "created_at", "created", "id"],
      mapRow: mapAccount,
      write: (tx, row) => writeById(tx.account, row, options),
    },
    {
      name: "sessions",
      sourceTables: SESSION_TABLE_CANDIDATES,
      sourceOrderColumns: ["expires", "createdAt", "created_at", "id"],
      mapRow: mapSession,
      write: (tx, row) => writeById(tx.session, row, options),
    },
    {
      name: "verification_tokens",
      sourceTables: VERIFICATION_TOKEN_TABLE_CANDIDATES,
      sourceOrderColumns: ["expires", "createdAt", "created_at", "identifier"],
      mapRow: mapVerificationToken,
      write: (tx, row) => writeVerificationToken(tx.verificationToken, row, options),
    },
    {
      name: "roles",
      sourceTables: ROLE_TABLE_CANDIDATES,
      sourceOrderColumns: ["createdAt", "created_at", "id"],
      mapRow: mapRole,
      write: (tx, row) => writeById(tx.role, row, options),
    },
    {
      name: "platform_nip05",
      sourceTables: PLATFORM_NIP05_TABLE_CANDIDATES,
      sourceOrderColumns: ["createdAt", "created_at", "id"],
      mapRow: mapPlatformNip05,
      write: (tx, row) => writeById(tx.platformNip05, row, options),
    },
    {
      name: "platform_lightning_addresses",
      sourceTables: PLATFORM_LIGHTNING_ADDRESS_TABLE_CANDIDATES,
      sourceOrderColumns: ["createdAt", "created_at", "id"],
      mapRow: mapPlatformLightningAddress,
      write: (tx, row) => writeById(tx.platformLightningAddress, row, options),
    },
    {
      name: "resources",
      sourceTables: RESOURCE_TABLE_CANDIDATES,
      sourceOrderColumns: ["createdAt", "created_at", "updatedAt", "id"],
      mapRow: mapResource,
      write: (tx, row) => writeById(tx.resource, row, options),
    },
    {
      name: "courses",
      sourceTables: COURSE_TABLE_CANDIDATES,
      sourceOrderColumns: ["createdAt", "created_at", "updatedAt", "id"],
      mapRow: mapCourse,
      write: (tx, row) => writeById(tx.course, row, options),
    },
    {
      name: "course_drafts",
      sourceTables: COURSE_DRAFT_TABLE_CANDIDATES,
      sourceOrderColumns: ["createdAt", "created_at", "updatedAt", "id"],
      mapRow: mapCourseDraft,
      write: (tx, row) => writeById(tx.courseDraft, row, options),
    },
    {
      name: "drafts",
      sourceTables: DRAFT_TABLE_CANDIDATES,
      sourceOrderColumns: ["createdAt", "created_at", "updatedAt", "id"],
      mapRow: mapDraft,
      write: (tx, row) => writeById(tx.draft, row, options),
    },
    {
      name: "lessons",
      sourceTables: LESSON_TABLE_CANDIDATES,
      sourceOrderColumns: ["courseId", "course_id", "index", "id", "createdAt"],
      mapRow: mapLesson,
      write: (tx, row) => writeById(tx.lesson, row, options),
    },
    {
      name: "draft_lessons",
      sourceTables: DRAFT_LESSON_TABLE_CANDIDATES,
      sourceOrderColumns: ["courseDraftId", "course_draft_id", "index", "id", "createdAt"],
      mapRow: mapDraftLesson,
      write: (tx, row) => writeById(tx.draftLesson, row, options),
    },
    {
      name: "purchases",
      sourceTables: PURCHASE_TABLE_CANDIDATES,
      sourceOrderColumns: ["createdAt", "created_at", "id", "updatedAt"],
      mapRow: mapPurchase,
      write: (tx, row) => writeById(tx.purchase, row, options),
    },
    {
      name: "user_lessons",
      sourceTables: USER_LESSON_TABLE_CANDIDATES,
      sourceOrderColumns: ["createdAt", "created_at", "id", "lessonId", "userId"],
      mapRow: mapUserLesson,
      write: (tx, row) => writeById(tx.userLesson, row, options),
    },
    {
      name: "user_courses",
      sourceTables: USER_COURSE_TABLE_CANDIDATES,
      sourceOrderColumns: ["createdAt", "created_at", "id", "userId", "courseId"],
      mapRow: mapUserCourse,
      write: (tx, row) => writeById(tx.userCourse, row, options),
    },
    {
      name: "badges",
      sourceTables: BADGE_TABLE_CANDIDATES,
      sourceOrderColumns: ["createdAt", "created_at", "updatedAt", "id"],
      mapRow: mapBadge,
      write: (tx, row) => writeById(tx.badge, row, options),
    },
    {
      name: "user_badges",
      sourceTables: USER_BADGE_TABLE_CANDIDATES,
      sourceOrderColumns: ["awardedAt", "awarded_at", "createdAt", "id"],
      mapRow: mapUserBadge,
      write: (tx, row) => writeById(tx.userBadge, row, options),
    },
    {
      name: "view_counter_totals",
      sourceTables: VIEW_TOTAL_TABLE_CANDIDATES,
      sourceOrderColumns: ["namespace", "key", "total", "createdAt"],
      mapRow: mapViewCounterTotal,
      write: (tx, row) => writeById(tx.viewCounterTotal, row, options),
    },
    {
      name: "view_counter_dailies",
      sourceTables: VIEW_DAILY_TABLE_CANDIDATES,
      sourceOrderColumns: ["day", "createdAt", "created_at", "id"],
      mapRow: mapViewCounterDaily,
      write: (tx, row) => writeById(tx.viewCounterDaily, row, options),
    },
    {
      name: "audit_logs",
      sourceTables: AUDIT_LOG_TABLE_CANDIDATES,
      sourceOrderColumns: ["createdAt", "created_at", "id", "action"],
      mapRow: mapAuditLog,
      write: (tx, row) => writeById(tx.auditLog, row, options),
    },
  ]

  return steps
}

function mapUser(row: Record<string, unknown>) {
  const get = createRowReader(row)
  const id = asOptionalString(get(["id"]))
  if (!id) return null

  return stripUndefined({
    id,
    pubkey: asOptionalString(get(["pubkey", "publicKey"])),
    privkey: asOptionalString(get(["privkey", "privateKey", "encryptedPrivkey", "encrypted_privkey"])),
    email: asOptionalString(get(["email", "emailAddress"])),
    emailVerified: asDate(get(["emailVerified", "email_verified"])),
    username: asOptionalString(get(["username", "handle", "user_name"])),
    displayName: asOptionalString(get(["displayName", "display_name", "name"])),
    avatar: asOptionalString(get(["avatar", "picture", "image"])),
    nip05: asOptionalString(get(["nip05", "nip05Address"])),
    lud16: asOptionalString(get(["lud16", "lud_16", "lightningAddress"])),
    banner: asOptionalString(get(["banner", "bannerImage", "coverImage"])),
    primaryProvider: asOptionalString(get(["primaryProvider", "primary_provider", "provider"])),
    profileSource: asOptionalString(get(["profileSource", "profile_source"])) || "oauth",
    anonReconnectTokenHash: asOptionalString(get(["anonReconnectTokenHash", "anon_reconnect_token_hash", "reconnectTokenHash"])),
    createdAt: asDate(get(["createdAt", "created_at", "created"])),
    updatedAt: asDate(get(["updatedAt", "updated_at", "updated"])),
  })
}

function mapAccount(row: Record<string, unknown>) {
  const get = createRowReader(row)
  const id = asOptionalString(get(["id"]))
  const userId = asOptionalString(get(["userId", "user_id", "uid"]))
  if (!id || !userId) return null

  return stripUndefined({
    id,
    userId,
    type: asOptionalString(get(["type", "providerType"])) || "oauth",
    provider: asOptionalString(get(["provider"])) || "credentials",
    providerAccountId: asOptionalString(get(["providerAccountId", "provider_account_id", "providerId"])) || "",
    refresh_token: asOptionalString(get(["refresh_token", "refreshToken"])),
    access_token: asOptionalString(get(["access_token", "accessToken"])),
    expires_at: asInt(get(["expires_at", "expiresAt"]), undefined as any),
    token_type: asOptionalString(get(["token_type", "tokenType"])),
    scope: asOptionalString(get(["scope"])),
    id_token: asOptionalString(get(["id_token", "idToken"])),
    session_state: asOptionalString(get(["session_state", "sessionState"])),
    oauth_token_secret: asOptionalString(get(["oauth_token_secret", "oauthTokenSecret"])),
    oauth_token: asOptionalString(get(["oauth_token", "oauthToken"])),
    createdAt: asDate(get(["createdAt", "created_at", "created"])),
  }) as Record<string, unknown>
}

function mapSession(row: Record<string, unknown>) {
  const get = createRowReader(row)
  const id = asOptionalString(get(["id"]))
  const userId = asOptionalString(get(["userId", "user_id", "uid"]))
  const sessionToken = asOptionalString(get(["sessionToken", "session_token", "token"]))
  const expires = asDate(get(["expires"]))

  if (!id || !userId || !sessionToken || !expires) return null

  return {
    id,
    userId,
    sessionToken,
    expires,
  }
}

function mapVerificationToken(row: Record<string, unknown>) {
  const get = createRowReader(row)
  const identifier = asOptionalString(get(["identifier"]))
  const token = asOptionalString(get(["token"]))
  const expires = asDate(get(["expires"]))
  if (!identifier || !token || !expires) return null

  return stripUndefined({
    identifier,
    token,
    expires,
    lookupId: asOptionalString(get(["lookupId", "lookup_id", "lookup"])),
  })
}

function mapRole(row: Record<string, unknown>) {
  const get = createRowReader(row)
  const id = asOptionalString(get(["id"])) ?? `role:${asOptionalString(get(["userId", "user_id", "uid"]))}`
  const userId = asOptionalString(get(["userId", "user_id", "uid"]))
  if (!id || !userId) return null

  return stripUndefined({
    id,
    userId,
    subscribed: asBoolean(get(["subscribed"]), false),
    admin: asBoolean(get(["admin"]), false),
    subscriptionType: asOptionalString(get(["subscriptionType", "subscription_type"])) || "monthly",
    subscriptionStartDate: asDate(get(["subscriptionStartDate", "subscription_start_date"])),
    lastPaymentAt: asDate(get(["lastPaymentAt", "last_payment_at"])),
    subscriptionExpiredAt: asDate(get(["subscriptionExpiredAt", "subscription_expired_at"])),
    nwc: asOptionalString(get(["nwc"])),
  })
}

function mapResource(row: Record<string, unknown>) {
  const get = createRowReader(row)
  const id = asOptionalString(get(["id"]))
  const userId = asOptionalString(get(["userId", "user_id", "uid"]))
  if (!id || !userId) return null

  return stripUndefined({
    id,
    userId,
    price: asInt(get(["price"]), 0),
    noteId: asOptionalString(get(["noteId", "note_id"])),
    videoId: asOptionalString(get(["videoId", "video_id"])),
    videoUrl: asOptionalString(get(["videoUrl", "video_url", "video"])),
    createdAt: asDate(get(["createdAt", "created_at", "created"])),
    updatedAt: asDate(get(["updatedAt", "updated_at", "updated"])),
  })
}

function mapCourse(row: Record<string, unknown>) {
  const get = createRowReader(row)
  const id = asOptionalString(get(["id"]))
  const userId = asOptionalString(get(["userId", "user_id", "uid"]))
  if (!id || !userId) return null

  return stripUndefined({
    id,
    userId,
    price: asInt(get(["price"]), 0),
    noteId: asOptionalString(get(["noteId", "note_id"])),
    submissionRequired: asBoolean(get(["submissionRequired", "submission_required"]), false),
    createdAt: asDate(get(["createdAt", "created_at", "created"])),
    updatedAt: asDate(get(["updatedAt", "updated_at", "updated"])),
  })
}

function mapCourseDraft(row: Record<string, unknown>) {
  const get = createRowReader(row)
  const id = asOptionalString(get(["id"]))
  const userId = asOptionalString(get(["userId", "user_id", "uid"]))
  if (!id || !userId) return null

  return stripUndefined({
    id,
    userId,
    title: asOptionalString(get(["title"])) || "",
    summary: asOptionalString(get(["summary"])) || "",
    image: asOptionalString(get(["image", "coverImage"])),
    price: asInt(get(["price"]), 0),
    topics: asStringArray(get(["topics"])),
    createdAt: asDate(get(["createdAt", "created_at", "created"])),
    updatedAt: asDate(get(["updatedAt", "updated_at", "updated"])),
  })
}

function mapDraft(row: Record<string, unknown>) {
  const get = createRowReader(row)
  const id = asOptionalString(get(["id"]))
  const userId = asOptionalString(get(["userId", "user_id", "uid"]))
  if (!id || !userId) return null

  return stripUndefined({
    id,
    userId,
    type: asOptionalString(get(["type"])) || "resource",
    title: asOptionalString(get(["title"])) || "",
    summary: asOptionalString(get(["summary"])) || "",
    content: asOptionalString(get(["content"])) || "",
    image: asOptionalString(get(["image", "coverImage"])),
    price: asInt(get(["price"]), 0),
    topics: asStringArray(get(["topics"])),
    additionalLinks: asJson(get(["additionalLinks", "additional_links"]), []),
    videoUrl: asOptionalString(get(["videoUrl", "video_url", "video"])),
    createdAt: asDate(get(["createdAt", "created_at", "created"])),
    updatedAt: asDate(get(["updatedAt", "updated_at", "updated"])),
  })
}

function mapLesson(row: Record<string, unknown>) {
  const get = createRowReader(row)
  const id = asOptionalString(get(["id"]))
  if (!id) return null

  return stripUndefined({
    id,
    courseId: asOptionalString(get(["courseId", "course_id", "course"])),
    resourceId: asOptionalString(get(["resourceId", "resource_id", "resource"])),
    draftId: asOptionalString(get(["draftId", "draft_id", "draft"])),
    index: asInt(get(["index", "position", "order", "idx"]), 0),
    createdAt: asDate(get(["createdAt", "created_at", "created"])),
    updatedAt: asDate(get(["updatedAt", "updated_at", "updated"])),
  })
}

function mapDraftLesson(row: Record<string, unknown>) {
  const get = createRowReader(row)
  const id = asOptionalString(get(["id"]))
  const courseDraftId = asOptionalString(get(["courseDraftId", "course_draft_id", "courseDraft", "courseDraftId"]))
  if (!id || !courseDraftId) return null

  return stripUndefined({
    id,
    courseDraftId,
    resourceId: asOptionalString(get(["resourceId", "resource_id", "resource"])),
    draftId: asOptionalString(get(["draftId", "draft_id", "draft"])),
    index: asInt(get(["index", "position", "order", "idx"]), 0),
    createdAt: asDate(get(["createdAt", "created_at", "created"])),
    updatedAt: asDate(get(["updatedAt", "updated_at", "updated"])),
  })
}

function mapPurchase(row: Record<string, unknown>) {
  const get = createRowReader(row)
  const id = asOptionalString(get(["id"]))
  const userId = asOptionalString(get(["userId", "user_id", "uid"]))
  const amountPaid = asInt(get(["amountPaid", "amount_paid", "amount"]), 0)
  if (!id || !userId) return null

  return stripUndefined({
    id,
    userId,
    courseId: asOptionalString(get(["courseId", "course_id", "course"])),
    resourceId: asOptionalString(get(["resourceId", "resource_id", "resource"])),
    amountPaid,
    priceAtPurchase: asInt(get(["priceAtPurchase", "price_at_purchase"]), undefined as any),
    paymentType: asOptionalString(get(["paymentType", "payment_type"])) || "zap",
    zapReceiptId: asOptionalString(get(["zapReceiptId", "zap_receipt_id"])),
    invoice: asOptionalString(get(["invoice"])),
    zapReceiptJson: asJson(get(["zapReceiptJson", "zap_receipt_json"]), undefined),
    zapRequestJson: asJson(get(["zapRequestJson", "zap_request_json"]), undefined),
    createdAt: asDate(get(["createdAt", "created_at", "created"])),
    updatedAt: asDate(get(["updatedAt", "updated_at", "updated"])),
  })
}

function mapUserLesson(row: Record<string, unknown>) {
  const get = createRowReader(row)
  const id = asOptionalString(get(["id"]))
  const userId = asOptionalString(get(["userId", "user_id", "uid"]))
  const lessonId = asOptionalString(get(["lessonId", "lesson_id", "lesson"]))
  if (!id || !userId || !lessonId) return null

  return stripUndefined({
    id,
    userId,
    lessonId,
    opened: asBoolean(get(["opened"]), false),
    completed: asBoolean(get(["completed"]), false),
    openedAt: asDate(get(["openedAt", "opened_at"])),
    completedAt: asDate(get(["completedAt", "completed_at"])),
    createdAt: asDate(get(["createdAt", "created_at", "created"])),
    updatedAt: asDate(get(["updatedAt", "updated_at", "updated"])),
  })
}

function mapUserCourse(row: Record<string, unknown>) {
  const get = createRowReader(row)
  const id = asOptionalString(get(["id"]))
  const userId = asOptionalString(get(["userId", "user_id", "uid"]))
  const courseId = asOptionalString(get(["courseId", "course_id", "course"]))
  if (!id || !userId || !courseId) return null

  return stripUndefined({
    id,
    userId,
    courseId,
    started: asBoolean(get(["started"]), false),
    completed: asBoolean(get(["completed"]), false),
    startedAt: asDate(get(["startedAt", "started_at"])),
    completedAt: asDate(get(["completedAt", "completed_at"])),
    submittedRepoLink: asOptionalString(get(["submittedRepoLink", "submitted_repo_link"])),
    createdAt: asDate(get(["createdAt", "created_at", "created"])),
    updatedAt: asDate(get(["updatedAt", "updated_at", "updated"])),
  })
}

function mapPlatformNip05(row: Record<string, unknown>) {
  const get = createRowReader(row)
  const id = asOptionalString(get(["id"])) ?? `nip05:${asOptionalString(get(["userId", "user_id"]))}`
  const userId = asOptionalString(get(["userId", "user_id", "uid"]))
  const pubkey = asOptionalString(get(["pubkey", "publicKey"]))
  const name = asOptionalString(get(["name"]))
  if (!id || !userId || !pubkey || !name) return null

  return stripUndefined({
    id,
    userId,
    pubkey,
    name,
    createdAt: asDate(get(["createdAt", "created_at", "created"])),
    updatedAt: asDate(get(["updatedAt", "updated_at", "updated"])),
  })
}

function mapPlatformLightningAddress(row: Record<string, unknown>) {
  const get = createRowReader(row)
  const id = asOptionalString(get(["id"])) ?? `lightning:${asOptionalString(get(["userId", "user_id"]))}`
  const userId = asOptionalString(get(["userId", "user_id", "uid"]))
  const name = asOptionalString(get(["name"]))
  if (!id || !userId || !name) return null

  return stripUndefined({
    id,
    userId,
    name,
    allowsNostr: asBoolean(get(["allowsNostr", "allows_nostr"]), true),
    description: asOptionalString(get(["description"])),
    maxSendable: asBigInt(get(["maxSendable", "max_sendable"]), BigInt(10_000_000_000)),
    minSendable: asBigInt(get(["minSendable", "min_sendable"]), BigInt(1_000)),
    invoiceMacaroon: asOptionalString(get(["invoiceMacaroon", "invoice_macaroon"])) || "",
    lndCert: asOptionalString(get(["lndCert", "lnd_cert"])),
    lndHost: asOptionalString(get(["lndHost", "lnd_host"])) || "",
    lndPort: asInt(get(["lndPort", "lnd_port"]), 8080),
    createdAt: asDate(get(["createdAt", "created_at", "created"])),
    updatedAt: asDate(get(["updatedAt", "updated_at", "updated"])),
  })
}

function mapBadge(row: Record<string, unknown>) {
  const get = createRowReader(row)
  const id = asOptionalString(get(["id"]))
  const name = asOptionalString(get(["name"]))
  const noteId = asOptionalString(get(["noteId", "note_id"]))
  if (!id || !name || !noteId) return null

  return stripUndefined({
    id,
    name,
    noteId,
    courseId: asOptionalString(get(["courseId", "course_id", "course"])),
    createdAt: asDate(get(["createdAt", "created_at", "created"])),
    updatedAt: asDate(get(["updatedAt", "updated_at", "updated"])),
  })
}

function mapUserBadge(row: Record<string, unknown>) {
  const get = createRowReader(row)
  const id = asOptionalString(get(["id"])) ?? `userbadge:${asOptionalString(get(["userId", "user_id"]))}:${asOptionalString(get(["badgeId", "badge_id"]))}`
  const userId = asOptionalString(get(["userId", "user_id", "uid"]))
  const badgeId = asOptionalString(get(["badgeId", "badge_id", "badge"]))
  if (!id || !userId || !badgeId) return null

  return stripUndefined({
    id,
    userId,
    badgeId,
    awardedAt: asDate(get(["awardedAt", "awarded_at"])) ?? new Date(),
  })
}

function mapViewCounterTotal(row: Record<string, unknown>) {
  const get = createRowReader(row)
  const key = asOptionalString(get(["key"]))
  if (!key) return null

  return stripUndefined({
    key,
    namespace: asOptionalString(get(["namespace"])) || "",
    entityId: asOptionalString(get(["entityId", "entity_id"])),
    path: asOptionalString(get(["path"])),
    total: asInt(get(["total"]), 0),
    createdAt: asDate(get(["createdAt", "created_at", "created"])),
    updatedAt: asDate(get(["updatedAt", "updated_at", "updated"])),
  })
}

function mapViewCounterDaily(row: Record<string, unknown>) {
  const get = createRowReader(row)
  const id = asOptionalString(get(["id"])) ?? `view-daily:${asOptionalString(get(["key"]))}:${asOptionalString(get(["day"]))}`
  const day = asDate(get(["day"]))
  if (!id || !day) return null

  return stripUndefined({
    id,
    key: asOptionalString(get(["key"])) || "",
    day,
    count: asInt(get(["count"]), 0),
    createdAt: asDate(get(["createdAt", "created_at", "created"])),
    updatedAt: asDate(get(["updatedAt", "updated_at", "updated"])),
  })
}

function mapAuditLog(row: Record<string, unknown>) {
  const get = createRowReader(row)
  const id = asOptionalString(get(["id"])) ?? `audit:${asOptionalString(get(["userId", "user_id"]))}:${Date.now()}`
  const userId = asOptionalString(get(["userId", "user_id", "uid"]))
  const action = asOptionalString(get(["action"]))
  const details = asJson(get(["details", "json"]), {})
  if (!id || !userId || !action) return null

  return stripUndefined({
    id,
    userId,
    action,
    details,
    ip: asOptionalString(get(["ip"])),
    userAgent: asOptionalString(get(["userAgent", "user_agent"])),
    createdAt: asDate(get(["createdAt", "created_at", "created"])) ?? new Date(),
  }) as Record<string, unknown>
}

void main().catch((error) => {
  console.error(error)
  process.exit(1)
})
