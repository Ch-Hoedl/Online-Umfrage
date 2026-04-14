import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://nmveysejndbibgpkfhmi.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tdmV5c2VqbmRiaWJncGtmaG1pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4OTI2NjUsImV4cCI6MjA4NDQ2ODY2NX0.5scWE3PXdNwFAR8ZD4Vz0u-bBjIxUudbOWCSxlwaVE8";

// Custom fetch that silently swallows AbortErrors caused by React StrictMode
// double-invoking effects (the first mount is torn down before the request completes).
const fetchWithAbortGuard = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  try {
    return await fetch(input, init);
  } catch (err: any) {
    if (err?.name === 'AbortError' || err?.code === 'ABORT_ERR') {
      // Return a never-resolving promise so callers don't see the error.
      // The second StrictMode mount will make the real request.
      return new Promise<Response>(() => {});
    }
    throw err;
  }
}) as typeof fetch;

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  global: { fetch: fetchWithAbortGuard },
});
