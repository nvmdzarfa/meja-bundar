import { parseGatewayResponse } from "../parser";

export interface ChatTurnMessage {
  role: "user" | "assistant";
  content: string;
}

export function normalizeGatewayV1Url(baseUrl: string): string {
  const cleaned = baseUrl.trim().replace(/\/+$/, "");
  if (!cleaned) {
    throw new Error("Base URL gateway belum diisi.");
  }
  if (/\/v1$/i.test(cleaned)) {
    return cleaned;
  }
  return `${cleaned}/v1`;
}

export async function testGatewayModels(
  baseUrl: string,
  apiKey: string
): Promise<string[]> {
  const v1Base = normalizeGatewayV1Url(baseUrl);
  const url = `${v1Base}/models`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(20_000),
  });

  const rawText = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} dari ${url}: ${rawText || response.statusText}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error(`Respons /models bukan JSON valid: ${rawText.slice(0, 250)}`);
  }

  const obj = parsed as Record<string, unknown>;
  const list = Array.isArray(obj.data)
    ? obj.data
    : Array.isArray(obj.models)
      ? obj.models
      : Array.isArray(parsed)
        ? parsed
        : null;

  if (!list) {
    throw new Error(`Format daftar model /models tidak dikenali: ${rawText.slice(0, 250)}`);
  }

  const ids = list
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object") {
        const rec = item as Record<string, unknown>;
        return String(rec.id ?? rec.name ?? "");
      }
      return "";
    })
    .filter(Boolean);

  return Array.from(new Set(ids));
}

export async function callGatewayChat(params: {
  baseUrl: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  messages: ChatTurnMessage[];
}): Promise<string> {
  const v1Base = normalizeGatewayV1Url(params.baseUrl);
  const url = `${v1Base}/chat/completions`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey.trim()}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream, text/plain",
    },
    body: JSON.stringify({
      model: params.model.trim(),
      messages: [
        { role: "system", content: params.systemPrompt },
        ...params.messages,
      ],
      stream: false,
    }),
    signal: AbortSignal.timeout(60_000),
  });

  const rawText = await response.text();
  if (!response.ok) {
    throw new Error(
      `Gateway error (HTTP ${response.status}): ${rawText || response.statusText}`
    );
  }

  const parsed = parseGatewayResponse(
    rawText,
    response.headers.get("content-type") ?? ""
  );
  return parsed.text;
}

export async function callGatewayImage(params: {
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
}): Promise<{ b64Json?: string; url?: string }> {
  const v1Base = normalizeGatewayV1Url(params.baseUrl);
  const url = `${v1Base}/images/generations`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey.trim()}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      model: params.model.trim(),
      prompt: params.prompt,
      n: 1,
      size: "1024x1024",
      response_format: "b64_json",
    }),
    signal: AbortSignal.timeout(90_000),
  });

  const rawText = await response.text();
  if (!response.ok) {
    throw new Error(
      `Gateway image error (HTTP ${response.status}): ${rawText || response.statusText}`
    );
  }

  const parsed = JSON.parse(rawText) as {
    data?: Array<{ b64_json?: string; url?: string }>;
    error?: { message?: string };
  };

  if (parsed.error?.message) {
    throw new Error(parsed.error.message);
  }

  const first = parsed.data?.[0];
  if (!first || (!first.b64_json && !first.url)) {
    throw new Error(`Respons image gateway tidak mengandung gambar: ${rawText.slice(0, 250)}`);
  }

  return { b64Json: first.b64_json, url: first.url };
}
