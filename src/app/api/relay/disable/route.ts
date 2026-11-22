import { NextResponse } from "next/server";
import { setRelayEnabled } from "@/lib/relay";
import { readDb, toPublicSettings } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST() {
  await setRelayEnabled(false);
  const db = await readDb();
  return NextResponse.json({
    ok: true,
    settings: toPublicSettings(db.settings),
  });
}
