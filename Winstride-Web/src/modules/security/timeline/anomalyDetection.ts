/**
 * Rolling z-score anomaly detection.
 *
 * Lightweight JS alternative to ChangeFinder (used by LogonTracer).
 * Runs on time-bucketed event counts per user/machine to highlight
 * suspicious activity spikes.
 */

/** Score at or above this value is considered anomalous. */
export const ANOMALY_THRESHOLD = 2.0;

/**
 * Compute a rolling z-score for each value in the series.
 *
 * For every element the z-score is calculated against the statistics
 * of a trailing window of `windowSize` values (including the current one).
 * A high absolute score means the value deviates significantly from recent
 * behaviour.
 *
 * @param values     Time-series of numeric observations (e.g. event counts).
 * @param windowSize Number of observations in the rolling window (default 6).
 * @returns          Array of z-scores, same length as `values`.
 */
export function detectAnomalies(
  values: number[],
  windowSize = 6,
): number[] {
  const scores: number[] = [];

  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - windowSize);
    const win = values.slice(start, i + 1);
    const mean = win.reduce((a, b) => a + b, 0) / win.length;
    const std = Math.sqrt(
      win.reduce((a, b) => a + (b - mean) ** 2, 0) / win.length,
    );
    scores.push(std > 0 ? (values[i] - mean) / std : 0);
  }

  return scores;
}

/**
 * Return the peak anomaly score (maximum absolute value) from a scores array.
 *
 * Useful for ranking entities by how "anomalous" their timeline is overall.
 *
 * @param scores Array of z-scores produced by `detectAnomalies`.
 * @returns      The largest absolute z-score, or 0 for an empty array.
 */
export function maxAnomaly(scores: number[]): number {
  if (scores.length === 0) return 0;
  return Math.max(...scores.map(Math.abs));
}
