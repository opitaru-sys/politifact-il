import { NextResponse } from "next/server";
import { fetchAllFeeds } from "@/lib/ingest";

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.ADMIN_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await fetchAllFeeds();
  return NextResponse.json({ results });
}
