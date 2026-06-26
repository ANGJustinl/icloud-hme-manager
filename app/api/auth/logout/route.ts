import { logout } from "@/lib/session";
import { handleError, json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await logout();
    return json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
