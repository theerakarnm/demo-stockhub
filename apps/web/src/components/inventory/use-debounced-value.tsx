'use client';

import { useEffect, useState } from 'react';

/**
 * Delays a fast-changing value (a search box) so every keystroke does not fire
 * a request. Kept local to the inventory screens until a second screen needs it.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
