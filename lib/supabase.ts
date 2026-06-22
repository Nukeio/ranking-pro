import { createClient } from "@supabase/supabase-js";

// Public client: safe to use for read-only queries from API routes.
// Relies on NEXT_PUBLIC_* vars, which are intentionally exposed to the browser.
export function getPublicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// Service-role client: bypasses Row Level Security. Only ever use this on the
// server (e.g. in app/api/ingest/route.ts), never send this key to the browser.
export function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}
