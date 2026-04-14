import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://nmveysejndbibgpkfhmi.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tdmV5c2VqbmRiaWJncGtmaG1pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4OTI2NjUsImV4cCI6MjA4NDQ2ODY2NX0.5scWE3PXdNwFAR8ZD4Vz0u-bBjIxUudbOWCSxlwaVE8";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    // Bypass navigator.locks entirely. The Web Locks API causes two problems:
    // 1. AbortError in React StrictMode (double mount/unmount)
    // 2. Stale locks after HMR reloads that block all subsequent requests
    // For a single-tab SPA this is safe – concurrent token refreshes are
    // extremely unlikely and the worst case is a redundant refresh.
    lock: async <T>(_name: string, _acquireTimeout: number, fn: () => Promise<T>) => fn(),
    storageKey: 'sb-nmveysejndbibgpkfhmi-auth-token',
    flowType: 'implicit',
  },
});
