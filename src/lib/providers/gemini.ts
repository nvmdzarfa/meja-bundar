import type { ChatTurnMessage } from "./gateway";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const TRANSIENT_STATUSES = new Set([429, 503]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchGeminiWithRetry(
  url: string,
  init: RequestInit,
  maxRetries = 2
): Promise<Response> {
  let attempt = 0;
  while (true) {
    const response = await fetch(url, init);
    if (!TRANSIENT_STATUSES.has(response.status) || attempt >= maxRetries) {
      return response;
    }
    const baseDelay = process.env.VITEST ? 10 : 900 * (attempt + 1);
    await sleep(baseDelay);
    attempt += 1;
  }
}

function extractGoogleError(rawText: string, status: number, statusText: string): string {
  try {
    const parsed = JSON.parse(rawText) as {
      error?: { message?: string; status?: string; code?: number };
    };
    if (parsed.error?.message) {
      const code = parsed.error.code ?? status;
      const state = parsed.error.status ? ` (${parsed.error.status})` : "";
      return `Google Gemini API HTTP ${code}${state}: ${parsed.error.message}`;
    }
  } catch {
    // Raw text fallback
  }
  return `Google Gemini API HTTP ${status}: ${rawText || statusText}`;
}

export async function fetchGeminiModels(apiKey: string): Promise<string[]> {
  const trimmedKey = apiKey.trim();
  if (!trimmedKey) {
    throw new Error("API key Gemini belum diisi.");
  }

  const collected: string[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < 10; page++) {
    const params = new URLSearchParams({
      key: trimmedKey,
      pageSize: "100",
    });
    if (pageToken) {
      params.set("pageToken", pageToken);
    }

    const url = `${GEMINI_API_BASE}/models?${params.toString()}`;
    const response = await fetchGeminiWithRetry(
      url,
      {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(20_000),
      },
      1
    );

    const rawText = await response.text();
    if (!response.ok) {
      throw new Error(extractGoogleError(rawText, response.status, response.statusText));
    }

    const parsed = JSON.parse(rawText) as {
      models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>;
      nextPageToken?: string;
    };

    for (const m of parsed.models ?? []) {
      const methods = m.supportedGenerationMethods ?? [];
      if (
        methods.length === 0 ||
        methods.includes("generateContent") ||
        methods.includes("predict")
      ) {
        const clean = (m.name ?? "").replace(/^models\//, "");
        if (clean) collected.push(clean);
      }
    }

    if (!parsed.nextPageToken) break;
    pageToken = parsed.nextPageToken;
  }

  return Array.from(new Set(collected));
}

export async function callGeminiChat(params: {
  apiKey: string;
  model: string;
  systemPrompt: string;
  messages: ChatTurnMessage[];
}): Promise<string> {
  const cleanModel = params.model.trim().replace(/^models\//, "");
  if (!cleanModel) {
    throw new Error("Nama model Gemini untuk kursi ini belum diisi.");
  }

  const url = `${GEMINI_API_BASE}/models/${encodeURIComponent(cleanModel)}:generateContent?key=${encodeURIComponent(
    params.apiKey.trim()
  )}`;

  const contents = params.messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const response = await fetchGeminiWithRetry(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: params.systemPrompt }],
      },
      contents,
    }),
    signal: AbortSignal.timeout(60_000),
  });

  const rawText = await response.text();
  if (!response.ok) {
    throw new Error(extractGoogleError(rawText, response.status, response.statusText));
  }

  const parsed = JSON.parse(rawText) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      finishReason?: string;
    }>;
    promptFeedback?: { blockReason?: string };
  };

  const parts = parsed.candidates?.[0]?.content?.parts ?? [];
  const text = parts
    .map((p) => p.text ?? "")
    .join("")
    .trim();

  if (!text) {
    const reason =
      parsed.promptFeedback?.blockReason ??
      parsed.candidates?.[0]?.finishReason ??
      "tidak ada kandidat teks";
    throw new Error(`Google Gemini tidak mengembalikan jawaban (${reason}).`);
  }

  return text;
}

export async function callGeminiImage(params: {
  apiKey: string;
  model: string;
  prompt: string;
}): Promise<{ base64: string; mimeType: string; caption?: string }> {
  const cleanModel = params.model.trim().replace(/^models\//, "");
  if (!cleanModel) {
    throw new Error("Nama model Gemini untuk kursi Visual belum diisi.");
  }

  if (cleanModel.startsWith("imagen-")) {
    const url = `${GEMINI_API_BASE}/models/${encodeURIComponent(cleanModel)}:predict?key=${encodeURIComponent(
      params.apiKey.trim()
    )}`;
    const response = await fetchGeminiWithRetry(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instances: [{ prompt: params.prompt }],
          parameters: { sampleCount: 1 },
        }),
        signal: AbortSignal.timeout(90_000),
      },
      1
    );

    const rawText = await response.text();
    if (!response.ok) {
      throw new Error(extractGoogleError(rawText, response.status, response.statusText));
    }

    const parsed = JSON.parse(rawText) as {
      predictions?: Array<{ bytesBase64Encoded?: string; mimeType?: string }>;
    };
    const pred = parsed.predictions?.[0];
    if (!pred?.bytesBase64Encoded) {
      throw new Error(`Google Imagen tidak mengembalikan data gambar: ${rawText.slice(0, 250)}`);
    }
    return {
      base64: pred.bytesBase64Encoded,
      mimeType: pred.mimeType ?? "image/png",
    };
  }

  const url = `${GEMINI_API_BASE}/models/${encodeURIComponent(cleanModel)}:generateContent?key=${encodeURIComponent(
    params.apiKey.trim()
  )}`;
  const response = await fetchGeminiWithRetry(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: params.prompt }] }],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
        },
      }),
      signal: AbortSignal.timeout(90_000),
    },
    1
  );

  const rawText = await response.text();
  if (!response.ok) {
    throw new Error(extractGoogleError(rawText, response.status, response.statusText));
  }

  const parsed = JSON.parse(rawText) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          text?: string;
          inlineData?: { mimeType?: string; data?: string };
        }>;
      };
    }>;
  };

  const parts = parsed.candidates?.[0]?.content?.parts ?? [];
  const imgPart = parts.find((p) => p.inlineData?.data);
  const textPart = parts
    .map((p) => p.text ?? "")
    .join("")
    .trim();

  if (!imgPart?.inlineData?.data) {
    throw new Error(
      `Model Gemini "${cleanModel}" tidak mengembalikan gambar inlineData. Pilih model image generation Gemini (mis. gemini-2.5-flash-image / imagen-3.0-generate-002).`
    );
  }

  return {
    base64: imgPart.inlineData.data,
    mimeType: imgPart.inlineData.mimeType ?? "image/png",
    caption: textPart || undefined,
  };
}
