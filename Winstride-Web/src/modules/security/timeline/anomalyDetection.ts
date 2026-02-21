/**
 * ChangeFinder — two-stage online change-point detection.
 *
 * TypeScript port of https://github.com/shunsukeaihara/changefinder
 * Based on Takeuchi & Yamanishi, "A unifying framework for detecting
 * outliers and change points from time series" (2006).
 *
 * Stage 1: SDAR model on raw data → outlier scores → smooth
 * Stage 2: SDAR model on smoothed scores → change-point scores → smooth
 *
 * Same algorithm used by JPCERT/CC's LogonTracer for security-log anomaly scoring.
 */

const EPSILON = 1e-7;
const LOG_2PI = Math.log(2 * Math.PI);

/** Score at or above this value is considered anomalous. */
export const ANOMALY_THRESHOLD = 3.0;

/**
 * Levinson-Durbin recursion for solving Yule-Walker equations.
 * Given autocorrelation coefficients `r`, returns AR coefficients
 * and the final prediction-error energy.
 */
function levinsonDurbin(
  r: number[],
  order: number,
): { a: number[]; e: number } {
  const a = new Float64Array(order + 1);
  const e = new Float64Array(order + 1);

  a[0] = 1.0;
  a[1] = -r[1] / r[0];
  e[1] = r[0] + r[1] * a[1];

  for (let k = 1; k < order; k++) {
    let lam = 0.0;
    for (let j = 0; j <= k; j++) {
      lam -= a[j] * r[k + 1 - j];
    }
    lam /= e[k];

    // U = [1, a[1..k], 0]   V = [0, a[k..1], 1]
    const prev = Float64Array.from(a);
    for (let i = 1; i <= k; i++) {
      a[i] = prev[i] + lam * prev[k + 1 - i];
    }
    a[k + 1] = lam;

    e[k + 1] = e[k] * (1.0 - lam * lam);
  }

  return { a: Array.from(a.subarray(0, order + 1)), e: e[order] };
}

/**
 * Sequentially Discounting AR model (1-dimensional).
 * Tracks a non-stationary time series using an exponentially-weighted
 * AR model that adapts via a discount rate `r`.
 */
class SDAR {
  private readonly r: number;
  private readonly order: number;
  private mu: number;
  private sigma: number;
  private c: number[];

  constructor(r: number, order: number) {
    this.r = r;
    this.order = order;
    this.mu = 0;
    this.sigma = 1;
    // Small nonzero init so Levinson-Durbin doesn't degenerate on first calls
    this.c = Array.from({ length: order + 1 }, () => 0.01);
  }

  /**
   * Update model with new observation `x` given the most recent `term` values.
   * @returns [outlierScore, prediction]
   */
  update(x: number, term: number[]): [number, number] {
    const { r, order } = this;

    // Exponentially-weighted mean
    this.mu = (1 - r) * this.mu + r * x;

    // Exponentially-weighted autocorrelation
    for (let i = 1; i <= order; i++) {
      this.c[i] =
        (1 - r) * this.c[i] +
        r * (x - this.mu) * (term[term.length - i] - this.mu);
    }
    this.c[0] =
      (1 - r) * this.c[0] + r * (x - this.mu) * (x - this.mu);

    // Guard: if variance estimate is essentially 0, nothing to predict
    if (Math.abs(this.c[0]) < EPSILON) {
      return [0, this.mu];
    }

    // Solve Yule-Walker via Levinson-Durbin → AR coefficients
    const { a } = levinsonDurbin(this.c, order);

    // AR prediction: xhat = mu + sum(-a[i] * (term_reversed[i-1] - mu))
    let xhat = this.mu;
    for (let i = 1; i <= order; i++) {
      xhat += -a[i] * (term[term.length - i] - this.mu);
    }

    // Update prediction-error variance
    this.sigma =
      (1 - r) * this.sigma + r * (x - xhat) * (x - xhat);

    // Negative log-likelihood score (simplified, numerically stable)
    const sig = Math.max(this.sigma, EPSILON);
    const score =
      0.5 * (x - xhat) ** 2 / sig + 0.5 * (LOG_2PI + Math.log(sig));

    return [score, xhat];
  }
}

/**
 * Two-stage ChangeFinder for online change-point detection.
 *
 * @param r      Discount rate (0 < r < 1). Lower = longer memory. Default 0.01.
 * @param order  AR model order. Default 1.
 * @param smooth Smoothing window size. Default 7.
 */
class ChangeFinderModel {
  private readonly smooth: number;
  private readonly smooth2: number;
  private readonly order: number;
  private readonly ts: number[] = [];
  private readonly firstScores: number[] = [];
  private readonly smoothedScores: number[] = [];
  private readonly secondScores: number[] = [];
  private readonly sdarFirst: SDAR;
  private readonly sdarSecond: SDAR;

  constructor(r = 0.01, order = 1, smooth = 7) {
    this.smooth = smooth;
    this.smooth2 = Math.round(smooth / 2);
    this.order = order;
    this.sdarFirst = new SDAR(r, order);
    this.sdarSecond = new SDAR(r, order);
  }

  /**
   * Feed one observation and get the change-point score.
   * Returns 0 during the warmup period (~order + smooth + order + smooth/2 steps).
   */
  update(x: number): [score: number, prediction: number] {
    let score = 0;
    let predict = x;

    // Stage 1: Run SDAR on raw data → outlier scores
    if (this.ts.length === this.order) {
      [score, predict] = this.sdarFirst.update(x, this.ts);
      this.firstScores.push(score);
      if (this.firstScores.length > this.smooth) this.firstScores.shift();
    }

    this.ts.push(x);
    if (this.ts.length > this.order) this.ts.shift();

    // Smooth first-stage scores
    let secondTarget: number | null = null;
    if (this.firstScores.length === this.smooth) {
      secondTarget =
        this.firstScores.reduce((a, b) => a + b, 0) / this.firstScores.length;
    }

    // Stage 2: Run SDAR on smoothed scores → change-point scores
    if (secondTarget !== null && this.smoothedScores.length === this.order) {
      [score] = this.sdarSecond.update(secondTarget, this.smoothedScores);
      this.secondScores.push(score);
      if (this.secondScores.length > this.smooth2) this.secondScores.shift();
    }

    if (secondTarget !== null) {
      this.smoothedScores.push(secondTarget);
      if (this.smoothedScores.length > this.order) this.smoothedScores.shift();
    }

    // Final smoothed change-point score
    if (this.secondScores.length === this.smooth2) {
      return [
        this.secondScores.reduce((a, b) => a + b, 0) / this.secondScores.length,
        predict,
      ];
    }

    return [0, predict];
  }
}

/**
 * Run the ChangeFinder algorithm on a time series and return anomaly scores.
 *
 * Produces one score per input value. Higher scores indicate a change in the
 * underlying distribution (e.g. a spike in logon failures that deviates from
 * the entity's normal pattern).
 *
 * When `baseline` is provided, the model is pre-trained on those values first
 * (scores discarded) before scoring `values`. This matches LogonTracer's
 * approach of training on the cross-user average before scoring each entity.
 *
 * @param values   Time-series of numeric observations (e.g. event counts per bucket).
 * @param baseline Optional pre-training series (e.g. average counts across all entities).
 * @param r        Discount rate (0-1). Lower = longer memory. Default 0.04.
 * @param order    AR model order. Default 1.
 * @param smooth   Smoothing window size. Default 5.
 * @returns        Array of change-point scores, same length as `values`.
 */
export function detectAnomalies(
  values: number[],
  baseline?: number[],
  r = 0.04,
  order = 1,
  smooth = 5,
): number[] {
  if (values.length === 0) return [];

  const cf = new ChangeFinderModel(r, order, smooth);

  // Pre-train on baseline to establish "normal" behaviour
  if (baseline) {
    for (const v of baseline) {
      cf.update(v);
    }
  }

  const scores: number[] = [];
  for (const v of values) {
    const [score] = cf.update(v);
    scores.push(score);
  }

  return scores;
}

/**
 * Return the peak anomaly score (maximum value) from a scores array.
 * Used to rank entities by how anomalous their timeline is overall.
 */
export function maxAnomaly(scores: number[]): number {
  if (scores.length === 0) return 0;
  let max = 0;
  for (const s of scores) {
    if (s > max) max = s;
  }
  return max;
}
