import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { maskApiKey } from "./mask";
import { DEFAULT_SEATS } from "./personas";
import type {
  ActiveTypingState,
  AppDatabase,
  Message,
  PipelineRun,
  PublicSettings,
  RelayRequest,
  Seat,
  Settings,
  StorageMode,
} from "./types";

const DB_REDIS_KEY = "meja-bundar:db";
const IMG_REDIS_PREFIX = "meja-bundar:img:";
const IMG_TTL_SECONDS = 60 * 60 * 24 * 7;

function getRedisConfig(): { url: string; token: string } | null {
  if (process.env.MEJA_BUNDAR_DATA_DIR) {
    return null;
  }
  const url = (
    process.env.KV_REST_API_URL ||
    process.env.UPSTASH_REDIS_REST_URL ||
    ""
  ).trim();
  const token = (
    process.env.KV_REST_API_TOKEN ||
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    ""
  ).trim();
  return url && token ? { url: url.replace(/\/+$/, ""), token } : null;
}

export function getStorageMode(): StorageMode {
  if (getRedisConfig()) return "redis";
  if (process.env.VERCEL && !process.env.MEJA_BUNDAR_DATA_DIR) return "ephemeral";
  return "local";
}

export function getDataDir(): string {
  if (process.env.MEJA_BUNDAR_DATA_DIR) {
    return path.resolve(process.env.MEJA_BUNDAR_DATA_DIR);
  }
  if (process.env.VERCEL) {
    return path.join(os.tmpdir(), "meja-bundar-data");
  }
  return path.join(process.cwd(), "data");
}

export function getDbFile(): string {
  return path.join(getDataDir(), "meja-bundar.json");
}

export function getGeneratedImagesDir(): string {
  return path.join(getDataDir(), "generated");
}

async function redisCommand<T = unknown>(command: Array<string | number>): Promise<T> {
  const cfg = getRedisConfig();
  if (!cfg) {
    throw new Error("Redis REST belum dikonfigurasi.");
  }
  const res = await fetch(cfg.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Redis REST HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  const parsed = JSON.parse(text) as { result?: T; error?: string };
  if (parsed.error) {
    throw new Error(`Redis REST error: ${parsed.error}`);
  }
  return parsed.result as T;
}

let writeQueue: Promise<unknown> = Promise.resolve();

export function resolveDefaultOwnerName(): string {
  const envName = process.env.MEJA_BUNDAR_OWNER_NAME?.trim();
  if (envName) return envName;
  return "Pemilik";
}

export function createInitialDatabase(): AppDatabase {
  const ownerName = resolveDefaultOwnerName();
  const settings: Settings = {
    ownerName,
    ownerAvatar: "/avatars/owner.svg",
    groupAvatar: "/avatars/group.svg",
    diskusiBergilir: true,
    reviewLevel: "Sedang",
    gatewayBaseUrl: process.env.GATEWAY_BASE_URL?.trim() || "",
    gatewayApiKey: process.env.GATEWAY_API_KEY?.trim() || "",
    geminiApiKey: process.env.GEMINI_API_KEY?.trim() || "",
    lastGatewayModels: [],
    lastGeminiModels: [],
    relay: {
      enabled: false,
      activeCodeHash: null,
      codeCreatedAt: null,
      codeExpiresAt: null,
      codeUsedAt: null,
    },
  };

  return {
    settings,
    seats: DEFAULT_SEATS.map((seat) => ({ ...seat })),
    messages: [],
    pipelineRuns: [],
    relayRequests: [],
    typing: {
      activeSeatId: null,
      queuedSeatIds: [],
      mode: null,
      updatedAt: Date.now(),
    },
  };
}

async function ensureDirectories(): Promise<void> {
  await fs.mkdir(getDataDir(), { recursive: true });
  await fs.mkdir(getGeneratedImagesDir(), { recursive: true });
}

function normalizeDb(raw: Partial<AppDatabase>): AppDatabase {
  const defaults = createInitialDatabase();
  const rawSettings = raw.settings ?? ({} as Partial<Settings>);
  const mergedSettings: Settings = {
    ...defaults.settings,
    ...rawSettings,
    gatewayBaseUrl: rawSettings.gatewayBaseUrl?.trim() || defaults.settings.gatewayBaseUrl,
    gatewayApiKey: rawSettings.gatewayApiKey?.trim() || defaults.settings.gatewayApiKey,
    geminiApiKey: rawSettings.geminiApiKey?.trim() || defaults.settings.geminiApiKey,
    relay: {
      ...defaults.settings.relay,
      ...(raw.settings?.relay ?? {}),
    },
  };

  const seatMap = new Map((raw.seats ?? []).map((s) => [s.id, s]));
  const seats: Seat[] = DEFAULT_SEATS.map((def) => {
    const existing = seatMap.get(def.id);
    if (!existing) return { ...def };
    const allowedSource =
      def.id === "MUSE"
        ? existing.source === "gemini" || existing.source === "gateway"
          ? existing.source
          : "builtin"
        : existing.source === "gemini"
          ? "gemini"
          : "gateway";
    return {
      ...def,
      displayName: existing.displayName?.trim() || def.displayName,
      avatar: existing.avatar || def.avatar,
      source: allowedSource,
      gatewayModel: existing.gatewayModel ?? "",
      geminiModel: existing.geminiModel ?? "",
    };
  });

  return {
    settings: mergedSettings,
    seats,
    messages: Array.isArray(raw.messages) ? raw.messages : [],
    pipelineRuns: Array.isArray(raw.pipelineRuns) ? raw.pipelineRuns : [],
    relayRequests: Array.isArray(raw.relayRequests) ? raw.relayRequests : [],
    typing: raw.typing ?? defaults.typing,
  };
}

async function readDbUnsafe(): Promise<AppDatabase> {
  if (getStorageMode() === "redis") {
    const raw = await redisCommand<string | null>(["GET", DB_REDIS_KEY]);
    if (!raw) {
      const fresh = createInitialDatabase();
      await writeDbUnsafe(fresh);
      return fresh;
    }
    const parsed = JSON.parse(raw) as Partial<AppDatabase>;
    return normalizeDb(parsed);
  }

  await ensureDirectories();
  const dbFile = getDbFile();
  try {
    const content = await fs.readFile(dbFile, "utf8");
    const parsed = JSON.parse(content) as Partial<AppDatabase>;
    return normalizeDb(parsed);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      const fresh = createInitialDatabase();
      await writeDbUnsafe(fresh);
      return fresh;
    }
    throw err;
  }
}

async function writeDbUnsafe(db: AppDatabase): Promise<void> {
  if (getStorageMode() === "redis") {
    await redisCommand(["SET", DB_REDIS_KEY, JSON.stringify(db)]);
    return;
  }

  await ensureDirectories();
  const dbFile = getDbFile();
  const tmpFile = `${dbFile}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmpFile, JSON.stringify(db, null, 2), "utf8");
  await fs.rename(tmpFile, dbFile);
}

export async function readDb(): Promise<AppDatabase> {
  return writeQueue.then(() => readDbUnsafe());
}

export async function mutateDb<T>(mutator: (db: AppDatabase) => Promise<T> | T): Promise<T> {
  const next = writeQueue.then(async () => {
    const db = await readDbUnsafe();
    const result = await mutator(db);
    await writeDbUnsafe(db);
    return result;
  });
  writeQueue = next.catch(() => undefined);
  return next;
}

export async function saveStoredImage(
  filename: string,
  buffer: Buffer,
  contentType = "image/png"
): Promise<string> {
  const mode = getStorageMode();
  if (mode === "redis") {
    await redisCommand([
      "SET",
      `${IMG_REDIS_PREFIX}${filename}`,
      JSON.stringify({ b64: buffer.toString("base64"), contentType }),
      "EX",
      IMG_TTL_SECONDS,
    ]);
    return `/api/images/${filename}`;
  }

  if (mode === "ephemeral") {
    return `data:${contentType};base64,${buffer.toString("base64")}`;
  }

  const dir = getGeneratedImagesDir();
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, filename), buffer);
  return `/api/images/${filename}`;
}

export async function readStoredImage(
  filename: string
): Promise<{ data: Buffer; contentType: string } | null> {
  const mode = getStorageMode();
  if (mode === "redis") {
    const raw = await redisCommand<string | null>([
      "GET",
      `${IMG_REDIS_PREFIX}${filename}`,
    ]);
    if (raw) {
      const parsed = JSON.parse(raw) as { b64: string; contentType?: string };
      return {
        data: Buffer.from(parsed.b64, "base64"),
        contentType: parsed.contentType ?? "image/png",
      };
    }
  }

  const fullPath = path.join(getGeneratedImagesDir(), filename);
  try {
    const data = await fs.readFile(fullPath);
    const ext = path.extname(filename).toLowerCase();
    const contentType =
      ext === ".jpg" || ext === ".jpeg"
        ? "image/jpeg"
        : ext === ".webp"
          ? "image/webp"
          : ext === ".svg"
            ? "image/svg+xml"
            : "image/png";
    return { data, contentType };
  } catch {
    return null;
  }
}

export function toPublicSettings(settings: Settings): PublicSettings {
  const now = Date.now();
  const hasActiveCode = Boolean(
    settings.relay.activeCodeHash &&
      settings.relay.codeExpiresAt &&
      settings.relay.codeExpiresAt > now
  );

  return {
    ownerName: settings.ownerName,
    ownerAvatar: settings.ownerAvatar,
    groupAvatar: settings.groupAvatar,
    diskusiBergilir: settings.diskusiBergilir,
    reviewLevel: settings.reviewLevel,
    gatewayBaseUrl: settings.gatewayBaseUrl,
    gatewayApiKeyMasked: maskApiKey(settings.gatewayApiKey),
    hasGatewayApiKey: Boolean(settings.gatewayApiKey.trim()),
    geminiApiKeyMasked: maskApiKey(settings.geminiApiKey),
    hasGeminiApiKey: Boolean(settings.geminiApiKey.trim()),
    lastGatewayModels: settings.lastGatewayModels,
    lastGeminiModels: settings.lastGeminiModels,
    relay: {
      enabled: settings.relay.enabled,
      hasActiveCode,
      codeExpiresAt: settings.relay.codeExpiresAt,
      codeUsed: Boolean(settings.relay.codeUsedAt),
    },
    storageMode: getStorageMode(),
  };
}

export function formatTimeLabel(date = new Date()): string {
  return date.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export async function appendMessage(msg: Message): Promise<Message> {
  return mutateDb((db) => {
    db.messages.push(msg);
    return msg;
  });
}

export async function updateMessage(
  messageId: string,
  patch: Partial<Message>
): Promise<Message | null> {
  return mutateDb((db) => {
    const target = db.messages.find((m) => m.id === messageId);
    if (!target) return null;
    Object.assign(target, patch);
    return target;
  });
}

export async function setTypingState(typing: Partial<ActiveTypingState>): Promise<void> {
  await mutateDb((db) => {
    db.typing = {
      ...db.typing,
      ...typing,
      updatedAt: Date.now(),
    };
  });
}

export async function upsertPipelineRun(run: PipelineRun): Promise<void> {
  await mutateDb((db) => {
    const idx = db.pipelineRuns.findIndex((p) => p.id === run.id);
    if (idx >= 0) {
      db.pipelineRuns[idx] = run;
    } else {
      db.pipelineRuns.push(run);
    }
  });
}

export async function addRelayRequest(req: RelayRequest): Promise<void> {
  await mutateDb((db) => {
    db.relayRequests.push(req);
  });
}
