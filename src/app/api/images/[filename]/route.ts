import path from "node:path";
import { NextResponse } from "next/server";
import { readStoredImage } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ filename: string }> }
) {
  const { filename } = await context.params;
  const safeName = path.basename(filename);
  if (!safeName || safeName !== filename || !/^[a-zA-Z0-9._-]+$/.test(safeName)) {
    return NextResponse.json({ error: "Nama file tidak valid." }, { status: 400 });
  }

  const stored = await readStoredImage(safeName);
  if (!stored) {
    return NextResponse.json({ error: "Gambar tidak ditemukan." }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(stored.data), {
    status: 200,
    headers: {
      "Content-Type": stored.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
