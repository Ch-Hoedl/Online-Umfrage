import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://nmveysejndbibgpkfhmi.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tdmV5c2VqbmRiaWJncGtmaG1pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4OTI2NjUsImV4cCI6MjA4NDQ2ODY2NX0.5scWE3PXdNwFAR8ZD4Vz0u-bBjIxUudbOWCSxlwaVE8";

// Reentrant in-memory lock to replace navigator.locks (which causes AbortError
// in React StrictMode). The gotrue-js client can call the lock recursively
// (e.g. token refresh inside a locked section), so a simple mutex deadlocks.
// This implementation queues waiters and allows the current holder to re-enter.
let activeName: string | null = null;
let queue: Array<() => void> = [];

async function reentrantLock<T>(name: string, _acquireTimeout: number, fn: () => Promise<T>): Promise<T> {
  // If we already hold this lock (reentrant call), just run fn directly
  if (activeName === name) {
    return fn();
  }

  // If a different lock is active, wait in queue
  if (activeName !== null) {
    await new Promise<void>((resolve) => queue.push(resolve));
  }

  activeName = name;
  try {
    return await fn();
  } finally {
    activeName = null;
    // Wake up next waiter if any
    if (queue.length > 0) {
      const next = queue.shift()!;
      next();
    }
  }
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    lock: reentrantLock,
  },
});
