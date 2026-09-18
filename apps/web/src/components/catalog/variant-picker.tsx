'use client';

/**
 * Inline combobox for matching a platform SKU to an internal catalog variant.
 *
 * The open/highlight/query behaviour lives in the pure reducer next door, so
 * the keyboard logic stays unit-testable without rendering React; this file
 * only wires that reducer to the input, the debounced catalog search and the
 * suggestion chip.
 */

import { useDebouncedValue } from '@/components/inventory/use-debounced-value';
import { useRole } from '@/components/role-provider';
import { Badge, SearchInput } from '@/components/ui';
import { catalogApi } from '@/lib/api-catalog';
import type { CatalogSearchRow } from '@/lib/api-types-catalog';
import { cn } from '@/lib/cn';
import { percent } from '@/lib/format';
import { useApi } from '@/lib/use-api';
import { useId, useMemo, useReducer, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { pickerReducer } from './variant-picker-state';
import type { PickerState } from './variant-picker-state';

/** A pre-ranked match from the import API, shown above the free-text results. */
export interface PickerSuggestion {
  variantId: string;
  sku: string;
  name: string;
  score?: number;
}

export interface VariantPickerProps {
  /** Chosen variant id, '' while nothing is chosen. */
  value: string;
  /** `row` is the full catalog row for search picks; suggestions carry no row. */
  onChange: (variantId: string, row?: CatalogSearchRow) => void;
  suggestions?: PickerSuggestion[];
  disabled?: boolean;
  ariaLabel: string;
}

/** One selectable row in the dropdown: a suggestion or a search hit. */
interface PickerOption {
  variantId: string;
  label: string;
  row?: CatalogSearchRow;
}

const optionLabel = (option: { sku: string; name: string; score?: number }): string =>
  option.score === undefined
    ? `${option.sku} - ${option.name}`
    : `${option.sku} - ${option.name} (คะแนน ${percent(option.score, 0)})`;

const INITIAL_STATE: PickerState = { open: false, highlighted: 0, query: '' };

export function VariantPicker({
  value,
  onChange,
  suggestions,
  disabled = false,
  ariaLabel,
}: VariantPickerProps) {
  const { role } = useRole();
  const [state, dispatch] = useReducer(pickerReducer, INITIAL_STATE);
  // The chip must survive a refetch that drops the picked row from the list,
  // so remember the label at pick time and only fall back to a list lookup.
  const [picked, setPicked] = useState<{ variantId: string; label: string } | null>(null);
  const listboxId = useId();

  const debouncedQuery = useDebouncedValue(state.query);
  const needle = debouncedQuery.trim();
  // role belongs in the key: the API strips cost fields per role (useApi docs).
  const { data } = useApi(
    () => (needle === '' ? Promise.resolve<CatalogSearchRow[]>([]) : catalogApi.search(needle)),
    [needle, role],
  );

  const suggestionOptions = useMemo<PickerOption[]>(
    () => (suggestions ?? []).map((s) => ({ variantId: s.variantId, label: optionLabel(s) })),
    [suggestions],
  );
  const resultOptions = useMemo<PickerOption[]>(
    () => (data ?? []).map((row) => ({ variantId: row.variantId, label: optionLabel(row), row })),
    [data],
  );
  // Suggestions first, search results below - the plan freezes this order.
  const options = useMemo(
    () => [...suggestionOptions, ...resultOptions],
    [suggestionOptions, resultOptions],
  );

  // Highlight the UI acts on: clamped because the result list can shrink under
  // a highlight computed for the previous query.
  const activeIndex = options.length === 0 ? 0 : Math.min(state.highlighted, options.length - 1);
  const activeOption = options[activeIndex];

  const knownLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const option of options) map.set(option.variantId, option.label);
    return map;
  }, [options]);

  let chipLabel: string | undefined;
  if (value !== '') {
    chipLabel = picked?.variantId === value ? picked.label : knownLabels.get(value);
    chipLabel ??= value;
  }

  const pick = (option: PickerOption): void => {
    setPicked({ variantId: option.variantId, label: option.label });
    onChange(option.variantId, option.row);
    // Close without wiping the query so reopening does not force a retype.
    dispatch({ type: 'close' });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      // Reopen first, then move: the arrows must also work on a closed list.
      dispatch({ type: 'open' });
      dispatch({ type: 'move', delta: event.key === 'ArrowDown' ? 1 : -1, count: options.length });
      return;
    }
    if (event.key === 'Enter') {
      if (!state.open || !activeOption) return;
      event.preventDefault();
      pick(activeOption);
      return;
    }
    if (event.key === 'Escape' && state.open) {
      // preventDefault stops the browser clearing the type="search" field -
      // that clear would fire onChange and reopen the list we just closed.
      event.preventDefault();
      dispatch({ type: 'close' });
    }
  };

  const listOpen = state.open && (options.length > 0 || needle !== '');

  const renderOption = (option: PickerOption, index: number, section: string) => (
    // The plan mandates the ARIA listbox roles; biome would rather have a
    // native <option>, which cannot render this two-section dropdown.
    // biome-ignore lint/a11y/useSemanticElements: ARIA combobox by design
    <div
      role="option"
      key={`${section}-${option.variantId}`}
      id={`${listboxId}-opt-${index}`}
      aria-selected={index === activeIndex}
      // Not tabbable on purpose: the input owns focus and announces the active
      // option through aria-activedescendant (standard combobox pattern).
      tabIndex={-1}
      className={cn(
        'cursor-pointer px-3 py-1.5 text-sm',
        index === activeIndex ? 'bg-emerald-50 font-medium text-emerald-900' : 'text-slate-700',
      )}
      onClick={() => pick(option)}
      onKeyDown={(event) => {
        // Only reachable when an assistive tech focuses the option directly;
        // regular keyboard traffic stays on the input.
        if (event.key === 'Enter' || event.key === ' ') pick(option);
      }}
    >
      {option.label}
    </div>
  );

  return (
    <div className="relative w-full">
      <SearchInput
        role="combobox"
        aria-expanded={listOpen}
        aria-controls={listboxId}
        aria-activedescendant={
          listOpen && activeOption ? `${listboxId}-opt-${activeIndex}` : undefined
        }
        aria-autocomplete="list"
        aria-label={ariaLabel}
        value={state.query}
        disabled={disabled}
        placeholder="ค้นหา SKU หรือชื่อสินค้า"
        onChange={(event) => dispatch({ type: 'type', query: event.target.value })}
        onKeyDown={handleKeyDown}
      />
      {chipLabel ? (
        <Badge tone="info" className="mt-1 max-w-full">
          <span className="truncate">{chipLabel}</span>
        </Badge>
      ) : null}
      {listOpen ? (
        // The plan mandates the ARIA listbox roles; biome would rather have a
        // native <select>, which cannot render this two-section dropdown.
        // biome-ignore lint/a11y/useSemanticElements: ARIA combobox by design
        <div
          role="listbox"
          id={listboxId}
          aria-label={ariaLabel}
          tabIndex={-1}
          className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          {suggestionOptions.length > 0 ? (
            <div className="px-3 pb-0.5 pt-1.5 text-[0.65rem] font-semibold tracking-wide text-slate-400 uppercase">
              จับคู่ใกล้เคียง
            </div>
          ) : null}
          {suggestionOptions.map((option, index) => renderOption(option, index, 'suggestion'))}
          {resultOptions.length > 0 ? (
            <div className="px-3 pb-0.5 pt-1.5 text-[0.65rem] font-semibold tracking-wide text-slate-400 uppercase">
              ผลการค้นหา
            </div>
          ) : null}
          {resultOptions.map((option, index) =>
            renderOption(option, suggestionOptions.length + index, 'result'),
          )}
          {options.length === 0 ? (
            <div className="px-3 py-2 text-xs text-slate-500">ไม่พบสินค้าที่ตรงกับคำค้นหา</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
