import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ ok: false, error: "feature_removed" }, { status: 410 });
}

export async function PATCH() {
  return NextResponse.json({ ok: false, error: "feature_removed" }, { status: 410 });
}
