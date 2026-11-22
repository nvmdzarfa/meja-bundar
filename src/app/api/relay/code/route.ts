import { NextResponse } from "next/server";
import { createRelayCode, setRelayEnabled } from "@/lib/relay";
import { readDb, toPublicSettings } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST() {
  const { code, expiresAt } = await createRelayCode();
  const db = await readDb();
  return NextResponse.json({
    ok: true,
    code,
    expiresAt,
    settings: toPublicSettings(db.settings),
  });
}

export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { enabled?: boolean };
  if (typeof body.enabled === "boolean") {
    await setRelayEnabled(body.enabled);
  }
  const db = await readDb();
  return NextResponse.json({
    ok: true,
    settings: toPublicSettings(db.settings),
  });
}
