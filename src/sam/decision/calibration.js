/**
 * Calibration metrics — fixtures/known formulas.
 * Do NOT claim calibrated probabilities without a stored calibration_id.
 */

import { DECISION_CALIBRATION_SCHEMA } from './types.js';

/**
 * Brier score for binary forecasts.
 * @param {Array<{ p: number, y: 0|1|boolean }>} rows
 */
export function brierScore(rows) {
  if (!rows?.length) return null;
  let sum = 0;
  for (const row of rows) {
    const p = Number(row.p);
    const y = row.y === true || row.y === 1 ? 1 : 0;
    sum += (p - y) ** 2;
  }
  return sum / rows.length;
}

/**
 * Log loss for binary forecasts.
 * @param {Array<{ p: number, y: 0|1|boolean }>} rows
 * @param {number} [eps]
 */
export function logLoss(rows, eps = 1e-15) {
  if (!rows?.length) return null;
  let sum = 0;
  for (const row of rows) {
    const y = row.y === true || row.y === 1 ? 1 : 0;
    const p = Math.min(1 - eps, Math.max(eps, Number(row.p)));
    sum += -(y * Math.log(p) + (1 - y) * Math.log(1 - p));
  }
  return sum / rows.length;
}

/**
 * Expected Calibration Error with equal-width bins.
 * @param {Array<{ p: number, y: 0|1|boolean }>} rows
 * @param {number} [bins]
 */
export function expectedCalibrationError(rows, bins = 10) {
  if (!rows?.length) return null;
  /** @type {Array<{ count: number, conf: number, acc: number }>} */
  const bucket = Array.from({ length: bins }, () => ({ count: 0, conf: 0, acc: 0 }));
  for (const row of rows) {
    const p = Number(row.p);
    const y = row.y === true || row.y === 1 ? 1 : 0;
    const idx = Math.min(bins - 1, Math.max(0, Math.floor(p * bins)));
    bucket[idx].count += 1;
    bucket[idx].conf += p;
    bucket[idx].acc += y;
  }
  let ece = 0;
  const n = rows.length;
  const reliability = [];
  for (let i = 0; i < bins; i += 1) {
    const b = bucket[i];
    if (!b.count) {
      reliability.push({ bin: i, count: 0, confidence: null, accuracy: null });
      continue;
    }
    const conf = b.conf / b.count;
    const acc = b.acc / b.count;
    ece += (b.count / n) * Math.abs(acc - conf);
    reliability.push({ bin: i, count: b.count, confidence: conf, accuracy: acc });
  }
  return { ece, reliability, schema: DECISION_CALIBRATION_SCHEMA };
}

/**
 * Dataset export contract from receipts with outcomes (no auto-train).
 * @param {object[]} receipts
 */
export function exportCalibrationDataset(receipts = []) {
  const rows = [];
  for (const receipt of receipts) {
    if (!receipt?.outcome) continue;
    for (const [qid, answer] of Object.entries(receipt.answers || {})) {
      if (answer.type !== 'check') continue;
      const p = answer.calibrated_probability
        ?? answer.support
        ?? answer.confidence_estimate;
      if (p == null) continue;
      rows.push({
        decision_id: receipt.decision_id,
        question_id: qid,
        question_version: receipt.question_versions?.[qid] ?? null,
        evaluator: answer.evaluator || receipt.evaluator,
        p: Number(p),
        y: receipt.outcome.success === true
          ? (answer.value ? 1 : 0)
          : (receipt.outcome.actual_class != null
            ? (String(receipt.outcome.actual_class) === String(answer.value) ? 1 : 0)
            : null),
        human_corrected: receipt.outcome.human_corrected,
        calibration_id: answer.calibration_id ?? null,
      });
    }
  }
  return {
    schema: DECISION_CALIBRATION_SCHEMA,
    kind: 'dataset_export',
    note: 'Not automatically used for training. Requires privacy review, splits, and label quality.',
    rows: rows.filter((r) => r.y != null),
  };
}
