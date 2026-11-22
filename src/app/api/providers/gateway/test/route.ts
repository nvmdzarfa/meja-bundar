import { NextResponse } from "next/server";
import { isMaskedPlaceholder } from "@/lib/mask";
import { testGatewayModels } from "@/lib/providers/gateway";
import { mutateDb, readDb, toPublicSettings } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      baseUrl?: string;
      apiKey?: string;
    };

    const db = await readDb();
    const baseUrl = (body.baseUrl ?? db.settings.gatewayBaseUrl).trim();
    const rawKey =
      body.apiKey && !isMaskedPlaceholder(body.apiKey)
        ? body.apiKey.trim()
        : db.settings.gatewayApiKey.trim();

    if (!baseUrl) {
      return NextResponse.json(
        { ok: false, error: "Base URL gateway belum diisi." },
        { status: 400 }
      );
    }
    if (!rawKey) {
      return NextResponse.json(
        { ok: false, error: "API key gateway belum diisi." },
        { status: 400 }
      );
    }

    const models = await testGatewayModels(baseUrl, rawKey);

    const updated = await mutateDb((state) => {
      state.settings.gatewayBaseUrl = baseUrl;
      state.settings.gatewayApiKey = rawKey;
      state.settings.lastGatewayModels = models;
      return toPublicSettings(state.settings);
    });

    return NextResponse.json({ ok: true, models, settings: updated });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Gagal terhubung ke gateway.",
      },
      { status: 502 }
    );
  }
}
