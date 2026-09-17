/**
 * Header normalisation + alias resolution. Implemented for real.
 *
 * Marketplace exports are hostile to exact string matching:
 *   - Shopee prefixes the first header with a UTF-8 BOM.
 *   - Lazada ships both camelCase (`sellerSku`) and Title Case (`Seller Sku`)
 *     depending on which export button the seller clicked.
 *   - TikTok pads headers with non-breaking and zero-width spaces.
 *   - Thai headers sometimes arrive in a different Unicode normal form.
 *
 * So: never compare raw headers. Normalise, then look up an alias list from the
 * platform's `columns.ts`.
 */

/**
 * Characters that carry no meaning in a header and only break equality.
 * The zero-width range is deliberate: exported headers are plain text, never
 * emoji, so there is no grapheme cluster for the ZWJ to hold together.
 */
// biome-ignore lint/suspicious/noMisleadingCharacterClass: headers are plain text, stripping ZWJ is intended
const NOISE = /[\s\u00a0\u200b-\u200d\ufeff_\-.*'"“”‘’:：;,()[\]{}/\\]+/g;

/**
 * trim -> NFKC -> lowercase -> strip zero-width, spaces and punctuation.
 * `"  Order ID (หมายเลข) "` -> `"orderidหมายเลข"`.
 */
export const normaliseHeader = (header: string): string =>
  header.normalize('NFKC').toLowerCase().replace(NOISE, '');

/** An ordered list of header names that all mean the same column. */
export type ColumnAliases = readonly string[];

/** `columns.ts` in each platform folder exports one of these. */
export type ColumnAliasMap<K extends string = string> = Readonly<Record<K, ColumnAliases>>;

export interface HeaderIndex {
  /** Verbatim headers, in file order. */
  readonly headers: readonly string[];
  /** normaliseHeader(header) -> verbatim header. First occurrence wins. */
  readonly byNormalised: ReadonlyMap<string, string>;
}

export const buildHeaderIndex = (headers: readonly string[]): HeaderIndex => {
  const byNormalised = new Map<string, string>();
  for (const header of headers) {
    const key = normaliseHeader(header);
    if (key !== '' && !byNormalised.has(key)) byNormalised.set(key, header);
  }
  return { headers, byNormalised };
};

/** Aliases shorter than this are never used for fuzzy substring matching. */
const MIN_FUZZY_ALIAS_LENGTH = 4;

/**
 * Resolves an alias list to the verbatim header present in the file.
 *
 * Two passes, in order:
 *   1. exact match on the normalised form (cheap, safe),
 *   2. substring match, so `Order ID` still resolves inside
 *      `Order ID (do not edit)`. Only for aliases of >= 4 characters, because
 *      a 2-character alias would match almost anything.
 *
 * Returns `undefined` when the column is absent - callers decide whether that
 * is a `ParseIssue` or just an optional field.
 */
export const resolveColumn = (index: HeaderIndex, aliases: ColumnAliases): string | undefined => {
  for (const alias of aliases) {
    const key = normaliseHeader(alias);
    const exact = index.byNormalised.get(key);
    if (exact !== undefined) return exact;
  }
  for (const alias of aliases) {
    const key = normaliseHeader(alias);
    if (key.length < MIN_FUZZY_ALIAS_LENGTH) continue;
    for (const [normalised, verbatim] of index.byNormalised) {
      if (normalised.includes(key)) return verbatim;
    }
  }
  return undefined;
};

export interface ResolvedColumns<K extends string> {
  /** Logical column name -> verbatim header found in the file. */
  readonly columns: Readonly<Partial<Record<K, string>>>;
  /** Logical columns that are not in the file at all. */
  readonly missing: readonly K[];
}

/** Resolves a whole `columns.ts` map in one call. */
export const resolveColumns = <K extends string>(
  index: HeaderIndex,
  aliasMap: ColumnAliasMap<K>,
): ResolvedColumns<K> => {
  const columns: Partial<Record<K, string>> = {};
  const missing: K[] = [];
  for (const key of Object.keys(aliasMap) as K[]) {
    const found = resolveColumn(index, aliasMap[key]);
    if (found === undefined) missing.push(key);
    else columns[key] = found;
  }
  return { columns, missing };
};

/** Safe cell read. Returns undefined for an absent column or an empty cell. */
export const cell = (
  row: Record<string, string>,
  column: string | undefined,
): string | undefined => {
  if (column === undefined) return undefined;
  const value = row[column];
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

/**
 * What `detect()` scores against.
 *
 * `required` - columns every export from this platform has. Missing ones drag
 *              the score down but do not zero it, because sellers can deselect
 *              columns in the export dialog.
 * `unique`   - columns no other supported platform uses. These are what
 *              actually tells Shopee apart from Lazada.
 */
export interface HeaderSignature {
  readonly required: readonly ColumnAliases[];
  readonly unique: readonly ColumnAliases[];
}

export interface SignatureScore {
  /** 0 = not mine, 1 = certain. Fed straight into DetectionResult.confidence. */
  readonly confidence: number;
  /** Verbatim headers that matched a `unique` alias. Used for the UI reason. */
  readonly matchedUnique: readonly string[];
  readonly requiredMatched: number;
  readonly requiredTotal: number;
}

/** Weight split between "looks like the right shape" and "has my fingerprint". */
const REQUIRED_WEIGHT = 0.55;
const UNIQUE_WEIGHT = 0.45;

/**
 * Deterministic, header-only scoring shared by all three adapters.
 *
 * confidence = 0.55 * (required matched / required total)
 *            + 0.45 * (unique matched / unique total)
 *
 * A file with every generic column but no platform fingerprint therefore tops
 * out at 0.55, which sits just above the registry threshold only if it also has
 * at least one unique header. See registry.ts for the threshold rationale.
 */
export const scoreSignature = (index: HeaderIndex, signature: HeaderSignature): SignatureScore => {
  const requiredMatched = signature.required.filter(
    (aliases) => resolveColumn(index, aliases) !== undefined,
  ).length;

  const matchedUnique: string[] = [];
  for (const aliases of signature.unique) {
    const found = resolveColumn(index, aliases);
    if (found !== undefined) matchedUnique.push(found);
  }

  const requiredTotal = signature.required.length;
  const uniqueTotal = signature.unique.length;
  const requiredRatio = requiredTotal === 0 ? 0 : requiredMatched / requiredTotal;
  const uniqueRatio = uniqueTotal === 0 ? 0 : matchedUnique.length / uniqueTotal;

  const confidence = REQUIRED_WEIGHT * requiredRatio + UNIQUE_WEIGHT * uniqueRatio;

  return {
    confidence: Math.min(1, Number(confidence.toFixed(4))),
    matchedUnique,
    requiredMatched,
    requiredTotal,
  };
};
