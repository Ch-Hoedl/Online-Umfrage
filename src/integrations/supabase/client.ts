import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://nmveysejndbibgpkfhmi.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tdmV5c2VqbmRiaWJncGtmaG1pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4OTI2NjUsImV4cCI6MjA4NDQ2ODY2NX0.5scWE3PXdNwFAR8ZD4Vz0u-bBjIxUudbOWCSxlwaVE8";

// Use the default navigator.locks but suppress AbortError from React StrictMode.
// The gotrue-js client uses navigator.locks internally with an AbortController;
// when StrictMode tears down the first mount the lock request gets aborted.
// We catch that specific error and return a never-settling promise so the
// torn-down instance doesn't interfere. The real (second) mount works normally.
async function navigatorLockWithAbortGuard<T>(
  name: string,
  acquireTimeout: number,
  fn: () => Promise<T>,
): Promise<T> {
  if (typeof navigator === 'undefined' || !navigator.locks) {
    // Fallback: no locks API available (SSR, old browser) – just run fn
    return fn();
  }

  const controller = new AbortController();

  if (acquireTimeout > 0) {
    setTimeout(() => controller.abort(), acquireTimeout);
  }

  try {
    return await navigator.locks.request(
      name,
      acquireTimeout > 0 ? { signal: controller.signal } : {},
      async () => fn(),
    );
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      // Silently swallow – this is React StrictMode tearing down the first mount.
      // Return a never-settling promise so the caller doesn't proceed.
      return new Promise<T>(() => {});
    }
    throw err;
  }
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    lock: navigatorLockWithAbortGuard,
  },
});
