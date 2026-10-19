/** Shared physical parameters; response is seconds and damping is a dimensionless ratio. */

/** A unit-mass spring's undamped period and damping ratio. */
export interface SpringToken {
  response: number;
  damping: number;
}

export const TOKENS = {
  snap: { response: 0.26, damping: 0.92 },
  settle: { response: 0.4, damping: 1 },
  fling: { response: 0.46, damping: 0.8 },
  jolt: { response: 0.5, damping: 0.42 },
} as const satisfies Record<string, SpringToken>;

export const DECEL = { normal: 0.998, fast: 0.99 } as const;
