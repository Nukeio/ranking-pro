import { NextResponse } from "next/server";
import { getPublicClient } from "@/lib/supabase";

export async function GET() {
  const supabase = getPublicClient();
  if (!supabase) {
    return NextResponse.json({ messages: [], source: "mock" });
  }

  const { data, error } = await supabase
    .from("chat_messages")
    .select("username, message, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ messages: [], error: error.message });
  }

  return NextResponse.json({ messages: (data ?? []).reverse() });
}

export async function POST(request: Request) {
  const supabase = getPublicClient();
  if (!supabase) {
    return NextResponse.json({ error: "Chat storage not configured yet" }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const username = (body?.username ?? "").toString().trim().slice(0, 24);
  const message = (body?.message ?? "").toString().trim().slice(0, 200);

  if (!username || !message) {
    return NextResponse.json({ error: "username and message are required" }, { status: 400 });
  }

  const { error } = await supabase.from("chat_messages").insert({ username, message });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
