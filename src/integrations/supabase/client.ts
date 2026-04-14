import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://nmveysejndbibgpkfhmi.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tdmV5c2VqbmRiaWJncGtmaG1pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4OTI2NjUsImV4cCI6MjA4NDQ2ODY2NX0.5scWE3PXdNwFAR8ZD4Vz0u-bBjIxUudbOWCSxlwaVE8";

async function debugLock<T>(name: string, acquireTimeout: number, fn: () => Promise<T>): Promise<T> {
  console.log('[supabase-lock] acquire', name, 'timeout:', acquireTimeout);
  try {
    const result = await fn();
    console.log('[supabase-lock] released', name);
    return result;
  } catch (err) {
    console.error('[supabase-lock] error in', name, err);
    throw err;
  }
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    lock: debugLock,
    storageKey: 'sb-nmveysejndbibgpkfhmi-auth-token',
    flowType: 'implicit',
  },
});
