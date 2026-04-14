import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://nmveysejndbibgpkfhmi.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tdmV5c2VqbmRiaWJncGtmaG1pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4OTI2NjUsImV4cCI6MjA4NDQ2ODY2NX0.5scWE3PXdNwFAR8ZD4Vz0u-bBjIxUudbOWCSxlwaVE8";

// Simple in-memory lock to replace navigator.locks (which causes AbortError
// in React StrictMode). This serializes token refresh calls correctly.
const locks = new Map<string, Promise<unknown>>();

async function inMemoryLock<T>(name: string, _acquireTimeout: number, fn: () => Promise<T>): Promise<T> {
  // Wait for any existing lock with the same name to finish
  while (locks.has(name)) {
    try { await locks.get(name); } catch { /* ignore */ }
  }
  const promise = fn();
  locks.set(name, promise);
  try {
    return await promise;
  } finally {
    locks.delete(name);
  }
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    lock: inMemoryLock,
  },
});
