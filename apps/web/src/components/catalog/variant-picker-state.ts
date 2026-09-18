/**
 * Pure state machine for the variant picker's open listbox.
 *
 * Kept free of React on purpose: the keyboard behaviour (wrap-around
 * highlighting, reset on typing, query preserved on close) is the kind of
 * logic that is cheapest to prove with plain unit tests.
 */

export type PickerState = { open: boolean; highlighted: number; query: string };

export type PickerAction =
  | { type: 'type'; query: string }
  | { type: 'move'; delta: 1 | -1; count: number }
  | { type: 'open' }
  | { type: 'close' };

export const pickerReducer = (state: PickerState, action: PickerAction): PickerState => {
  switch (action.type) {
    case 'type':
      // Typing reopens the list and always restarts the highlight at the top.
      return { open: true, highlighted: 0, query: action.query };
    case 'move': {
      // Nothing to move through yet: keep the state exactly as it is.
      if (action.count === 0) return state;
      const next = state.highlighted + action.delta;
      const wrapped = next < 0 ? action.count - 1 : next % action.count;
      return { ...state, highlighted: wrapped };
    }
    case 'open':
      return { ...state, open: true };
    case 'close':
      // Closing must not wipe what the user typed; the query drives the search.
      return { ...state, open: false };
  }
};
