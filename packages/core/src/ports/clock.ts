/** Injectable clock. Never call `new Date()` inside domain logic - tests need to pin time. */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

export const fixedClock = (iso: string): Clock => {
  const at = new Date(iso);
  return { now: () => at };
};
