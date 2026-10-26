// Private document download. Requires: valid short-lived HMAC signature bound to the requesting user,
// AND a fresh record-level access check. Responses are never cached.
import { NextResponse, type NextRequest } from "next/server";
import { currentActor } from "@/server/web/session";
import { readDocument, verifyDocumentLink } from "@/server/documents/service";
import { audit } from "@/server/audit/audit";
import { prisma } from "@/server/db";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const exp = req.nextUrl.searchParams.get("exp") ?? "";
  const sig = req.nextUrl.searchParams.get("sig") ?? "";
  const actor = await currentActor();
  const validForUser = actor && verifyDocumentLink(id, actor.userId, exp, sig);
  const validPublic = verifyDocumentLink(id, null, exp, sig);
  if (!validForUser && !validPublic) return NextResponse.json({ error: "Link expired or invalid. Reload the page to get a new link." }, { status: 403 });
  try {
    const { doc, data } = await readDocument(actor, id);
    if (doc.visibility !== "PUBLIC_LISTING") await audit(prisma, { actor, action: "document.downloaded", entityType: "Document", entityId: id, summary: `Downloaded ${doc.filename}` });
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": doc.mimeType,
        "Content-Disposition": `${doc.mimeType === "application/pdf" || doc.mimeType.startsWith("image/") ? "inline" : "attachment"}; filename="${doc.filename.replace(/"/g, "")}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
