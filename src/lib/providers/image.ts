import crypto from "node:crypto";
import { saveStoredImage } from "../store";
import type { Seat, Settings } from "../types";
import { callGeminiImage } from "./gemini";
import { callGatewayImage } from "./gateway";

async function saveGeneratedImage(buffer: Buffer, ext = "png"): Promise<string> {
  const filename = `img-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.${ext}`;
  const contentType = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "image/png";
  return saveStoredImage(filename, buffer, contentType);
}

export interface VisualImageOutcome {
  text: string;
  imageUrl: string | null;
  sourceLabel: string;
  providerError: string | null;
}

export async function generateVisualImage(params: {
  prompt: string;
  seat: Seat;
  settings: Settings;
}): Promise<VisualImageOutcome> {
  const { prompt, seat, settings } = params;
  const cleanPrompt = prompt.replace(/^Gambar:\s*/i, "").trim() || "Ilustrasi Meja Bundar";

  if (seat.source === "gemini") {
    const hasKey = Boolean(settings.geminiApiKey.trim());
    const model = seat.geminiModel.trim();

    if (hasKey && model) {
      try {
        const res = await callGeminiImage({
          apiKey: settings.geminiApiKey,
          model,
          prompt: cleanPrompt,
        });
        const ext = res.mimeType.includes("jpeg") ? "jpg" : "png";
        const imageUrl = await saveGeneratedImage(
          Buffer.from(res.base64, "base64"),
          ext
        );
        return {
          text:
            res.caption ||
            `${settings.ownerName}, gambar untuk "${cleanPrompt}" selesai dibuat.`,
          imageUrl,
          sourceLabel: `via Gemini (login Google) · ${model}`,
          providerError: null,
        };
      } catch (err) {
        return {
          text: `${settings.ownerName}, pembuatan gambar melalui Gemini (${model}) gagal.`,
          imageUrl: null,
          sourceLabel: `via Gemini (login Google) · ${model}`,
          providerError: err instanceof Error ? err.message : String(err),
        };
      }
    }

    const reason = !hasKey
      ? "API key Gemini belum diisi"
      : "model gambar Gemini untuk kursi Visual belum diisi";
    return {
      text: `${settings.ownerName}, kursi Visual (${seat.displayName}) belum bisa membuat gambar karena ${reason}.`,
      imageUrl: null,
      sourceLabel: "Belum terhubung ke model gambar",
      providerError: `${reason}. Buka Pengaturan untuk menghubungkan model generator gambar.`,
    };
  }

  // Gateway path
  const hasGateway = Boolean(
    settings.gatewayBaseUrl.trim() && settings.gatewayApiKey.trim()
  );
  const model = seat.gatewayModel.trim();

  if (hasGateway && model) {
    try {
      const res = await callGatewayImage({
        baseUrl: settings.gatewayBaseUrl,
        apiKey: settings.gatewayApiKey,
        model,
        prompt: cleanPrompt,
      });
      let imageUrl: string;
      if (res.b64Json) {
        imageUrl = await saveGeneratedImage(Buffer.from(res.b64Json, "base64"), "png");
      } else if (res.url) {
        const fetched = await fetch(res.url, { signal: AbortSignal.timeout(30_000) });
        if (!fetched.ok) {
          throw new Error(`Gagal mengunduh gambar dari ${res.url}: HTTP ${fetched.status}`);
        }
        const buf = Buffer.from(await fetched.arrayBuffer());
        imageUrl = await saveGeneratedImage(buf, "png");
      } else {
        throw new Error("Respons gateway tidak memiliki data gambar.");
      }

      return {
        text: `${settings.ownerName}, gambar untuk "${cleanPrompt}" selesai dibuat.`,
        imageUrl,
        sourceLabel: `via Link API (gateway) · ${model}`,
        providerError: null,
      };
    } catch (err) {
      return {
        text: `${settings.ownerName}, pembuatan gambar melalui Link API (${model}) gagal.`,
        imageUrl: null,
        sourceLabel: `via Link API (gateway) · ${model}`,
        providerError: err instanceof Error ? err.message : String(err),
      };
    }
  }

  const reason = !hasGateway
    ? "Link API gateway belum diisi"
    : "model gambar gateway untuk kursi Visual belum diisi";
  return {
    text: `${settings.ownerName}, kursi Visual (${seat.displayName}) belum bisa membuat gambar karena ${reason}.`,
    imageUrl: null,
    sourceLabel: "Belum terhubung ke model gambar",
    providerError: `${reason}. Buka Pengaturan untuk menghubungkan model generator gambar.`,
  };
}

