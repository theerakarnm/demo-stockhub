/**
 * Groups flat export rows into orders.
 *
 * Every marketplace exports ONE ROW PER ORDER LINE, repeating the order header
 * on each row. So an order with 3 items is 3 rows sharing the same order id.
 * This grouping is identical for all three platforms, so it lives here instead
 * of being copy-pasted into each adapter.
 *
 * Row order is preserved: the first row of a group is the one an adapter should
 * read order-level fields (status, dates, buyer) from.
 */

export interface RowGroup {
  /** Value of the external order id column. */
  key: string;
  /** 1-based source row numbers, for ParseIssue.row. Header row is row 1. */
  rowNumbers: number[];
  rows: Record<string, string>[];
}

/**
 * @param rows            data rows from readTabular, in file order
 * @param getKey          reads the external order id from a row
 * @param firstDataRowNumber 1-based row number of `rows[0]` in the source file
 *                           (2 for a normal file: row 1 is the header)
 */
export const groupRowsByOrder = (
  rows: readonly Record<string, string>[],
  getKey: (row: Record<string, string>) => string | undefined,
  firstDataRowNumber = 2,
): { groups: RowGroup[]; rowsWithoutKey: number[] } => {
  const byKey = new Map<string, RowGroup>();
  const rowsWithoutKey: number[] = [];

  rows.forEach((row, i) => {
    const rowNumber = firstDataRowNumber + i;
    const key = getKey(row);
    if (key === undefined || key === '') {
      rowsWithoutKey.push(rowNumber);
      return;
    }
    const existing = byKey.get(key);
    if (existing === undefined) {
      byKey.set(key, { key, rowNumbers: [rowNumber], rows: [row] });
    } else {
      existing.rowNumbers.push(rowNumber);
      existing.rows.push(row);
    }
  });

  return { groups: [...byKey.values()], rowsWithoutKey };
};
