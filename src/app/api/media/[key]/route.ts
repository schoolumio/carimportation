// Public vehicle photos/videos uploaded through the listing editor (no private data).
import { NextResponse } from "next/server";
import { getStorage } from "@/server/documents/service";

const TYPES: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", mp4: "video/mp4" };

export async function GET(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!/^[\w-]+\.(jpg|jpeg|png|webp|mp4)$/.test(key)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const data = await getStorage().get(`media/${key}`);
    return new NextResponse(new Uint8Array(data), { headers: { "Content-Type": TYPES[key.split(".").pop()!], "Cache-Control": "public, max-age=86400, immutable", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
