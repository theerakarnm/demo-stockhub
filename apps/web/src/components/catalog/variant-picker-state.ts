/**
 * Headless state for the inline variant picker (a combobox).
 *
 * Kept out of the component so the keyboard behaviour - wrap-around highlight,
 * reset on typing, query survives closing - is testable with plain `bun test`,
 * no DOM needed.
 */

export interface PickerState {
  /** The suggestion/result list is rendered. */
  open: boolean;
  /** Index into the combined suggestion + result list. */
  highlighted: number;
  /** What the user has typed; kept on close so reopening can refine it. */
  query: string;
}

export type PickerAction =
  | { type: 'type'; query: string }
  | { type: 'move'; delta: 1 | -1; count: number }
  | { type: 'open' }
  | { type: 'close' };

export const pickerInitialState: PickerState = { open: false, highlighted: 0, query: '' };

export const pickerReducer = (state: PickerState, action: PickerAction): PickerState => {
  switch (action.type) {
    case 'type':
      // Typing reopens the list and puts the highlight back on the first row,
      // so Enter after a pause always picks the best-ranked row.
      return { open: true, highlighted: 0, query: action.query };
    case 'move': {
      if (action.count === 0) return state;
      const next = state.highlighted + action.delta;
      // Wrap around instead of stopping: the list is short and arrow keys
      // should always answer, whichever end the user is at.
      const wrapped = next < 0 ? action.count - 1 : next >= action.count ? 0 : next;
      return { ...state, open: true, highlighted: wrapped };
    }
    case 'open':
      return { ...state, open: true };
    case 'close':
      // Escape must not wipe the query: the user usually reopens and refines.
      return { ...state, open: false };
  }
};
