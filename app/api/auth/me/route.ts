import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  return NextResponse.json({ user: getRequestUser(req) });
}
