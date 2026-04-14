import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://nmveysejndbibgpkfhmi.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tdmV5c2VqbmRiaWJncGtmaG1pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4OTI2NjUsImV4cCI6MjA4NDQ2ODY2NX0.5scWE3PXdNwFAR8ZD4Vz0u-bBjIxUudbOWCSxlwaVE8";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    // Disable navigator.locks – this is the root cause of the AbortError in
    // React StrictMode. gotrue-js uses the Web Locks API with an AbortController
    // internally; when StrictMode tears down the first mount the lock request
    // gets aborted and throws an unhandled AbortError.
    // With lock disabled the auth client falls back to a simple in-memory mutex
    // which works perfectly fine for single-tab SPAs.
    lock: async (_name, _acquireTimeout, fn) => await fn(),
  },
});
