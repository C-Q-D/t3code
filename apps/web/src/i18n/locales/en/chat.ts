/** English chat messages; interpolation leaves UI rendering to the caller. */
export const chat = {
  /** Formats a conversation count; count is the number of threads to describe. */
  threadCount: (count: number) => (count === 1 ? "1 thread" : `${count} threads`),
};
