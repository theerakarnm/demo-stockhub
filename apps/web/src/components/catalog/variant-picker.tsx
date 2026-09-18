'use client';

/**
 * Inline variant picker (combobox) for mapping a platform SKU onto a variant.
 *
 * One keyboard-navigable list, two sources:
 *   1. `suggestions` - the server's ranked guesses for this exact platform SKU
 *   2. a debounced catalogApi.search across the whole catalogue, so the user
 *      can still find the right variant when no guess fits.
 *
 * Picking calls onChange(variantId, row). `row` is only set for search
 * results, because a suggestion carries no stock or price data. The chosen
 * variant stays visible as a chip so the row reads like a decision, not a form.
 */

import { useDebouncedValue } from '@/components/inventory/use-debounced-value';
import { useRole } from '@/components/role-provider';
import { Input } from '@/components/ui';
import { catalogApi } from '@/lib/api-catalog';
import type { CatalogSearchRow } from '@/lib/api-types-catalog';
import { percent, qty } from '@/lib/format';
import { useApi } from '@/lib/use-api';
import { Check, ChevronDown } from 'lucide-react';
import { useId, useReducer, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { pickerInitialState, pickerReducer } from './variant-picker-state';

export interface PickerSuggestion {
  variantId: string;
  sku: string;
  name: string;
  score?: number;
}

export interface VariantPickerProps {
  /** Currently chosen variant id, '' when nothing is chosen yet. */
  value: string;
  onChange: (variantId: string, row?: CatalogSearchRow) => void;
  /** Ranked guesses the API attached to this platform SKU. */
  suggestions?: PickerSuggestion[];
  disabled?: boolean;
  ariaLabel: string;
}

/** One keyboard-navigable row. `row` exists only for full search results. */
interface Entry {
  kind: 'suggestion' | 'result';
  variantId: string;
  sku: string;
  name: string;
  score?: number;
  row?: CatalogSearchRow;
}

const SEARCH_DEBOUNCE_MS = 250;
const SEARCH_LIMIT = 8;

export function VariantPicker({
  value,
  onChange,
  suggestions = [],
  disabled = false,
  ariaLabel,
}: VariantPickerProps) {
  const { role } = useRole();
  const listboxId = useId();
  const [state, dispatch] = useReducer(pickerReducer, pickerInitialState);
  const [pickedRow, setPickedRow] = useState<
    { variantId: string; sku: string; name: string } | undefined
  >(undefined);

  const debouncedQuery = useDebouncedValue(state.query, SEARCH_DEBOUNCE_MS);
  const trimmedQuery = debouncedQuery.trim();
  // An empty query must not hit the API (q is required), so it answers no rows.
  const { data, error, loading } = useApi(
    () =>
      trimmedQuery === ''
        ? Promise.resolve<CatalogSearchRow[]>([])
        : catalogApi.search(trimmedQuery, SEARCH_LIMIT),
    [trimmedQuery, role],
  );

  const suggestionIds = new Set(suggestions.map((suggestion) => suggestion.variantId));
  const results = (data ?? []).filter((row) => !suggestionIds.has(row.variantId));
  const entries: Entry[] = [
    ...suggestions.map(
      (suggestion): Entry => ({
        kind: 'suggestion',
        variantId: suggestion.variantId,
        sku: suggestion.sku,
        name: suggestion.name,
        score: suggestion.score,
      }),
    ),
    ...results.map(
      (row): Entry => ({
        kind: 'result',
        variantId: row.variantId,
        sku: row.sku,
        name: row.name,
        row,
      }),
    ),
  ];
  const count = entries.length;
  const activeEntry = entries[state.highlighted];

  // The chip label: the row the user picked, else the suggestion the parent
  // pre-selected, else the bare id we know nothing about.
  const chip =
    pickedRow ??
    suggestions.find((suggestion) => suggestion.variantId === value) ??
    (value === '' ? undefined : { variantId: value, sku: value, name: '' });

  const pick = (entry: Entry) => {
    setPickedRow({ variantId: entry.variantId, sku: entry.sku, name: entry.name });
    onChange(entry.variantId, entry.row);
    dispatch({ type: 'close' });
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      dispatch({ type: 'move', delta: 1, count });
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      dispatch({ type: 'move', delta: -1, count });
    } else if (event.key === 'Enter') {
      // Only an open list turns Enter into a pick; otherwise the input sits
      // inside the panel and Enter would swallow the user's flow silently.
      if (state.open && activeEntry) {
        event.preventDefault();
        pick(activeEntry);
      }
    } else if (event.key === 'Escape') {
      dispatch({ type: 'close' });
    }
  };

  return (
    <div className="relative w-full">
      {chip ? (
        <span className="mb-1 inline-flex max-w-full items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
          <Check className="size-3 shrink-0" aria-hidden />
          <span className="font-mono">{chip.sku}</span>
          {chip.name ? <span className="truncate">{chip.name}</span> : null}
        </span>
      ) : null}

      <Input
        type="text"
        role="combobox"
        aria-expanded={state.open}
        aria-controls={listboxId}
        aria-activedescendant={
          state.open && activeEntry ? `${listboxId}-opt-${state.highlighted}` : undefined
        }
        aria-autocomplete="list"
        aria-label={ariaLabel}
        value={state.query}
        disabled={disabled}
        placeholder="พิมพ์ SKU หรือชื่อสินค้าเพื่อค้นหา"
        onChange={(event) => dispatch({ type: 'type', query: event.target.value })}
        onKeyDown={handleKeyDown}
      />
      <ChevronDown
        className="pointer-events-none absolute bottom-2.5 right-2.5 size-4 text-slate-400"
        aria-hidden
      />

      {state.open && !disabled ? (
        <div
          id={listboxId}
          // biome-ignore lint/a11y/useSemanticElements: the WAI-ARIA combobox pattern needs a listbox driven by a text input; a native <select> cannot offer free-text search.
          role="listbox"
          tabIndex={-1}
          aria-label={ariaLabel}
          className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          {loading && trimmedQuery !== '' ? (
            <p className="px-3 py-2 text-xs text-slate-500">กำลังค้นหา...</p>
          ) : null}
          {error ? <p className="px-3 py-2 text-xs text-rose-600">{error.message}</p> : null}
          {!loading && !error && count === 0 ? (
            <p className="px-3 py-2 text-xs text-slate-500">ไม่พบสินค้าที่ค้นหา</p>
          ) : null}

          {suggestions.length > 0 ? (
            <p
              role="presentation"
              className="px-3 pt-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-slate-400"
            >
              ใกล้เคียง
            </p>
          ) : null}
          {entries.map((entry, index) => {
            const highlighted = state.highlighted === index;
            return (
              <button
                key={`${entry.kind}-${entry.variantId}`}
                type="button"
                // biome-ignore lint/a11y/useSemanticElements: the combobox listbox needs option roles for aria-activedescendant; a native <option> cannot live outside a <select>.
                role="option"
                id={`${listboxId}-opt-${index}`}
                aria-selected={value === entry.variantId}
                className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs ${
                  highlighted ? 'bg-emerald-50' : ''
                }`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pick(entry)}
              >
                <span className="min-w-0">
                  <span className="font-mono text-slate-900">{entry.sku}</span>{' '}
                  <span className="text-slate-500">{entry.name}</span>
                </span>
                <span className="shrink-0 text-slate-400">
                  {entry.score !== undefined
                    ? `คะแนน ${percent(entry.score, 0)}`
                    : entry.row
                      ? `คงเหลือ ${qty(entry.row.onHand)}`
                      : null}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
