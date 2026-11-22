export interface ParsedGatewayResult {
  text: string;
  format: "sse" | "json" | "text";
}

function extractTextFromContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const part of content) {
      if (typeof part === "string") {
        parts.push(part);
      } else if (part && typeof part === "object") {
        const record = part as Record<string, unknown>;
        if (typeof record.text === "string") {
          parts.push(record.text);
        } else if (typeof record.content === "string") {
          parts.push(record.content);
        } else if (
          record.text &&
          typeof record.text === "object" &&
          typeof (record.text as Record<string, unknown>).value === "string"
        ) {
          parts.push((record.text as Record<string, unknown>).value as string);
        }
      }
    }
    return parts.join("");
  }

  if (content && typeof content === "object") {
    const record = content as Record<string, unknown>;
    if (typeof record.text === "string") return record.text;
    if (typeof record.content === "string") return record.content;
    if (typeof record.value === "string") return record.value;
  }

  return "";
}

function extractErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const obj = payload as Record<string, unknown>;
  if (obj.error) {
    if (typeof obj.error === "string") return obj.error;
    if (typeof obj.error === "object") {
      const errObj = obj.error as Record<string, unknown>;
      if (typeof errObj.message === "string") return errObj.message;
      return JSON.stringify(obj.error);
    }
  }
  return null;
}

function extractTextFromJsonPayload(payload: unknown): string {
  if (typeof payload === "string") return payload;
  if (!payload || typeof payload !== "object") return "";

  const errMsg = extractErrorMessage(payload);
  if (errMsg) {
    throw new Error(errMsg);
  }

  const obj = payload as Record<string, unknown>;

  if (Array.isArray(obj.choices) && obj.choices.length > 0) {
    const choice = obj.choices[0] as Record<string, unknown>;
    if (choice.delta && typeof choice.delta === "object") {
      const delta = choice.delta as Record<string, unknown>;
      const fromDelta = extractTextFromContent(delta.content ?? delta.text);
      if (fromDelta) return fromDelta;
    }
    if (choice.message && typeof choice.message === "object") {
      const msg = choice.message as Record<string, unknown>;
      const fromMessage = extractTextFromContent(msg.content ?? msg.text);
      if (fromMessage) return fromMessage;
    }
    if (typeof choice.text === "string") {
      return choice.text;
    }
    if (choice.content !== undefined) {
      const fromChoice = extractTextFromContent(choice.content);
      if (fromChoice) return fromChoice;
    }
  }

  if (obj.delta && typeof obj.delta === "object") {
    const delta = obj.delta as Record<string, unknown>;
    const fromDelta = extractTextFromContent(delta.content ?? delta.text);
    if (fromDelta) return fromDelta;
  }

  if (obj.message && typeof obj.message === "object") {
    const msg = obj.message as Record<string, unknown>;
    const fromMsg = extractTextFromContent(msg.content ?? msg.text);
    if (fromMsg) return fromMsg;
  }

  if (typeof obj.output_text === "string") {
    return obj.output_text;
  }

  if (Array.isArray(obj.output)) {
    const collected: string[] = [];
    for (const item of obj.output) {
      if (item && typeof item === "object") {
        const rec = item as Record<string, unknown>;
        collected.push(extractTextFromContent(rec.content ?? rec.text));
      }
    }
    const joined = collected.join("");
    if (joined) return joined;
  }

  if (obj.content !== undefined) {
    const fromContent = extractTextFromContent(obj.content);
    if (fromContent) return fromContent;
  }

  if (typeof obj.text === "string") {
    return obj.text;
  }

  return "";
}

function parseSseBody(raw: string): string {
  const lines = raw.split(/\r?\n/);
  const chunks: string[] = [];
  let sawDataLine = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (!trimmed.startsWith("data:")) continue;

    sawDataLine = true;
    const dataPayload = trimmed.slice(5).trim();
    if (!dataPayload || dataPayload === "[DONE]") {
      continue;
    }

    try {
      const parsed = JSON.parse(dataPayload) as unknown;
      const chunk = extractTextFromJsonPayload(parsed);
      if (chunk) {
        chunks.push(chunk);
      }
    } catch (err) {
      // If extractTextFromJsonPayload threw a provider error, rethrow it
      if (err instanceof SyntaxError) {
        chunks.push(dataPayload);
      } else {
        throw err;
      }
    }
  }

  if (!sawDataLine) {
    return "";
  }
  return chunks.join("");
}

export function parseGatewayResponse(
  rawBody: string,
  contentType = ""
): ParsedGatewayResult {
  const trimmed = rawBody.trim();
  if (!trimmed) {
    throw new Error("Respons kosong dari gateway.");
  }

  const looksLikeSse =
    contentType.toLowerCase().includes("text/event-stream") ||
    /(?:^|\r?\n)\s*data:\s*/.test(trimmed);

  if (looksLikeSse) {
    const sseText = parseSseBody(trimmed);
    if (sseText.trim()) {
      return { text: sseText.trim(), format: "sse" };
    }
  }

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      const extracted = extractTextFromJsonPayload(parsed);
      if (extracted.trim()) {
        return { text: extracted.trim(), format: "json" };
      }
      throw new Error(
        `Respons JSON gateway tidak memiliki konten teks: ${trimmed.slice(0, 300)}`
      );
    } catch (err) {
      if (!(err instanceof SyntaxError)) {
        throw err;
      }
    }
  }

  return { text: trimmed, format: "text" };
}
