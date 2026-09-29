export const HORIZON_COLUMNS = 58;

// The shared spectrum texture already has quadratic frequency spacing. Sample
// it only once per mirrored tower pair; skip the DC/near-DC plateau at its start.
export const HORIZON_BANDS = Float32Array.from(
  { length: HORIZON_COLUMNS / 2 },
  (_, index) => .065 + index / (HORIZON_COLUMNS / 2 - 1) * (.92 - .065),
);
