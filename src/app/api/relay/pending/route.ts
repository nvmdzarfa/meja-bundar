import { NextResponse } from "next/server";
import { getPendingRelayRequests } from "@/lib/relay";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code =
    request.headers.get("x-relay-code") ?? url.searchParams.get("code") ?? "";

  if (!code.trim()) {
    return NextResponse.json(
      { error: "Kode relay wajib disertakan (header x-relay-code atau query ?code=)." },
      { status: 401 }
    );
  }

  const result = await getPendingRelayRequests(code);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: result.status });
  }

  return NextResponse.json({ ok: true, requests: result.requests });
}
