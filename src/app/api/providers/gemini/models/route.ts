import { NextResponse } from "next/server";
import { isMaskedPlaceholder } from "@/lib/mask";
import { fetchGeminiModels } from "@/lib/providers/gemini";
import { mutateDb, readDb, toPublicSettings } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { apiKey?: string };
    const db = await readDb();
    const rawKey =
      body.apiKey && !isMaskedPlaceholder(body.apiKey)
        ? body.apiKey.trim()
        : db.settings.geminiApiKey.trim();

    if (!rawKey) {
      return NextResponse.json(
        { ok: false, error: "API key Gemini belum diisi." },
        { status: 400 }
      );
    }

    const models = await fetchGeminiModels(rawKey);

    const updated = await mutateDb((state) => {
      state.settings.geminiApiKey = rawKey;
      state.settings.lastGeminiModels = models;
      return toPublicSettings(state.settings);
    });

    return NextResponse.json({ ok: true, models, settings: updated });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Gagal mengambil daftar model Gemini.",
      },
      { status: 502 }
    );
  }
}
