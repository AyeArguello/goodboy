import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env/server";
import { runWeeklyAgenda } from "@/lib/notifications/weeklyAgenda";

export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const secret = getServerEnv().CRON_SECRET;
  if (!secret) return false;
  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Emails the owner next week's turns. Called by the Netlify scheduled function. */
export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  try {
    const result = await runWeeklyAgenda();
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (err) {
    console.error("weekly agenda failed:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
