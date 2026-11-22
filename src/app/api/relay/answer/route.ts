import { NextResponse } from "next/server";
import { submitRelayAnswer } from "@/lib/relay";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      code?: string;
      requestId?: string;
      answer?: string;
      error?: string;
    };
    const code = body.code ?? request.headers.get("x-relay-code") ?? "";
    if (!code.trim()) {
      return NextResponse.json(
        { error: "Kode relay wajib disertakan." },
        { status: 401 }
      );
    }

    const result = await submitRelayAnswer({
      code,
      requestId: body.requestId,
      answer: body.answer,
      error: body.error,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: result.status });
    }

    return NextResponse.json({
      ok: true,
      request: result.request,
      message: result.message,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Gagal mengirim jawaban relay." },
      { status: 400 }
    );
  }
}
