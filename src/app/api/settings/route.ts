import { NextResponse } from "next/server";
import { isMaskedPlaceholder } from "@/lib/mask";
import { mutateDb, readDb, toPublicSettings } from "@/lib/store";
import type { ReviewLevel, SeatId } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = await readDb();
  return NextResponse.json({
    settings: toPublicSettings(db.settings),
    seats: db.seats,
  });
}

interface SettingsPatchBody {
  ownerName?: string;
  ownerAvatar?: string;
  groupAvatar?: string;
  diskusiBergilir?: boolean;
  reviewLevel?: ReviewLevel;
  gatewayBaseUrl?: string;
  gatewayApiKey?: string;
  clearGatewayApiKey?: boolean;
  geminiApiKey?: string;
  clearGeminiApiKey?: boolean;
  seats?: Array<{
    id: SeatId;
    displayName?: string;
    source?: "builtin" | "gateway" | "gemini";
    gatewayModel?: string;
    geminiModel?: string;
  }>;
}

const VALID_REVIEW_LEVELS: ReviewLevel[] = ["Longgar", "Santai", "Sedang", "Ketat"];

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as SettingsPatchBody;

    const updated = await mutateDb((db) => {
      if (typeof body.ownerName === "string") {
        const clean = body.ownerName.trim();
        if (clean) db.settings.ownerName = clean;
      }
      if (typeof body.ownerAvatar === "string" && body.ownerAvatar.trim()) {
        db.settings.ownerAvatar = body.ownerAvatar.trim();
      }
      if (typeof body.groupAvatar === "string" && body.groupAvatar.trim()) {
        db.settings.groupAvatar = body.groupAvatar.trim();
      }
      if (typeof body.diskusiBergilir === "boolean") {
        db.settings.diskusiBergilir = body.diskusiBergilir;
      }
      if (body.reviewLevel && VALID_REVIEW_LEVELS.includes(body.reviewLevel)) {
        db.settings.reviewLevel = body.reviewLevel;
      }
      if (typeof body.gatewayBaseUrl === "string") {
        db.settings.gatewayBaseUrl = body.gatewayBaseUrl.trim();
      }

      if (body.clearGatewayApiKey) {
        db.settings.gatewayApiKey = "";
      } else if (
        typeof body.gatewayApiKey === "string" &&
        body.gatewayApiKey.trim() &&
        !isMaskedPlaceholder(body.gatewayApiKey)
      ) {
        db.settings.gatewayApiKey = body.gatewayApiKey.trim();
      }

      if (body.clearGeminiApiKey) {
        db.settings.geminiApiKey = "";
      } else if (
        typeof body.geminiApiKey === "string" &&
        body.geminiApiKey.trim() &&
        !isMaskedPlaceholder(body.geminiApiKey)
      ) {
        db.settings.geminiApiKey = body.geminiApiKey.trim();
      }

      if (Array.isArray(body.seats)) {
        for (const patch of body.seats) {
          const target = db.seats.find((s) => s.id === patch.id);
          if (!target) continue;

          if (typeof patch.displayName === "string" && patch.displayName.trim()) {
            target.displayName = patch.displayName.trim();
          }

          if (target.id === "MUSE") {
            if (
              patch.source === "builtin" ||
              patch.source === "gateway" ||
              patch.source === "gemini"
            ) {
              target.source = patch.source;
            }
          } else if (patch.source === "gateway" || patch.source === "gemini") {
            target.source = patch.source;
          }

          if (typeof patch.gatewayModel === "string") {
            target.gatewayModel = patch.gatewayModel.trim();
          }
          if (typeof patch.geminiModel === "string") {
            target.geminiModel = patch.geminiModel.trim();
          }
        }
      }

      return {
        settings: toPublicSettings(db.settings),
        seats: db.seats,
      };
    });

    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Gagal menyimpan pengaturan." },
      { status: 400 }
    );
  }
}
