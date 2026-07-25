import { createClient } from '@supabase/supabase-js';

// Server-side only — uses the secret/service_role key, which bypasses Row
// Level Security. Never import this file from client components.
export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);
