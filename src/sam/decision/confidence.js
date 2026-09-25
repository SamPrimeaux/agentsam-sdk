/**
 * Confidence / support helpers.
 *
 * confidence_estimate = distribution concentration (NOT P(correct))
 * support = check proposition strength in [0,1]
 * probabilities = only when evaluator defines a probabilistic interpretation
 * calibrated_probability = only with calibration_id after empirical fit
 */

/**
 * Normalized entropy concentration in [0,1].
 * 1 = fully concentrated on one option; 0 = uniform.
 * @param {Record<string, number>} scores  non-negative weights
 */
export function concentrationFromScores(scores) {
  const entries = Object.entries(scores || {}).filter(([, v]) => Number.isFinite(v) && v >= 0);
  if (!entries.length) return 0;
  const sum = entries.reduce((n, [, v]) => n + v, 0);
  if (!(sum > 0)) return 0;
  if (entries.length === 1) return 1;
  const probs = entries.map(([, v]) => v / sum);
  const entropy = -probs.reduce((n, p) => (p > 0 ? n + p * Math.log(p) : n), 0);
  const maxEntropy = Math.log(entries.length);
  if (!(maxEntropy > 0)) return 1;
  return clamp01(1 - entropy / maxEntropy);
}

/**
 * Softmax → probabilities that sum to 1 (within floating tolerance).
 * @param {Record<string, number>} scores
 * @param {number} [temperature]
 */
export function softmax(scores, temperature = 1) {
  const entries = Object.entries(scores || {});
  if (!entries.length) return {};
  const t = temperature > 0 ? temperature : 1;
  const max = Math.max(...entries.map(([, v]) => Number(v) || 0));
  const exps = entries.map(([k, v]) => [k, Math.exp(((Number(v) || 0) - max) / t)]);
  const sum = exps.reduce((n, [, e]) => n + e, 0) || 1;
  /** @type {Record<string, number>} */
  const out = {};
  for (const [k, e] of exps) out[k] = e / sum;
  return out;
}

/**
 * Expected score from a probability distribution over ordered levels.
 * @param {Array<{ index: number }>} levels
 * @param {Record<string, number>} probabilities  keyed by level index string
 */
export function expectedScore(levels, probabilities) {
  let sum = 0;
  for (const level of levels) {
    const p = Number(probabilities[String(level.index)] ?? probabilities[level.index] ?? 0);
    sum += level.index * (Number.isFinite(p) ? p : 0);
  }
  return sum;
}

/**
 * Assert probabilities sum ≈ 1.
 * @param {Record<string, number>} probs
 * @param {number} [tolerance]
 */
export function assertProbabilitiesSumToOne(probs, tolerance = 1e-6) {
  const sum = Object.values(probs || {}).reduce((n, v) => n + (Number(v) || 0), 0);
  if (Math.abs(sum - 1) > tolerance) {
    const err = new Error(`probabilities_sum=${sum}`);
    err.code = 'probabilities_invalid';
    throw err;
  }
  return true;
}

export function clamp01(n) {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/**
 * Build answer envelope with strict raw vs calibrated labeling.
 * @param {object} partial
 */
export function buildAnswer(partial) {
  const answer = {
    schema: 'agentsam.decision-answer.v1',
    type: partial.type,
    question_id: partial.question_id,
    value: partial.value,
    scores: partial.scores ?? null,
    levels: partial.levels ?? null,
    support: partial.support ?? null,
    confidence_estimate: partial.confidence_estimate ?? null,
    probabilities: partial.probabilities ?? null,
    calibrated_probability: partial.calibrated_probability ?? null,
    calibration_id: partial.calibration_id ?? null,
    evaluator: partial.evaluator ?? null,
    evidence: Array.isArray(partial.evidence) ? partial.evidence : [],
    warnings: Array.isArray(partial.warnings) ? partial.warnings : [],
  };

  if (answer.probabilities) {
    assertProbabilitiesSumToOne(answer.probabilities);
  }
  if (answer.calibrated_probability != null && !answer.calibration_id) {
    const err = new Error('calibrated_probability requires calibration_id');
    err.code = 'calibration_required';
    throw err;
  }
  // Never allow callers to smuggle calibrated claims without id via alias fields
  if ('probability' in (partial || {}) || 'probability_true' in (partial || {})) {
    if (!answer.calibration_id && answer.probabilities == null) {
      // Accept probability_true only when calibration_id present; otherwise map to support
      if (partial.probability_true != null && answer.support == null) {
        answer.support = clamp01(Number(partial.probability_true));
        answer.warnings = [
          ...answer.warnings,
          'probability_true_mapped_to_support_without_calibration',
        ];
      }
    }
  }
  return answer;
}
