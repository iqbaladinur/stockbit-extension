// Ruleset types and evaluation logic
// Supports multiple ruleset versions

export interface StockData {
  symbol: string
  price: number | null
  netForeignBuySell: number | null
  netForeignBuySellMA10: number | null
  netForeignBuySellMA20: number | null
  oneWeekNetForeignFlow: number | null
  oneMonthNetForeignFlow: number | null
  netForeignBuyStreak: number | null
  bandarAccumDist: number | null
  bandarValue: number | null
  bandarValueMA10: number | null
  bandarValueMA20: number | null
}

export interface EvaluationResult {
  symbol: string
  entryReady: boolean
  score: number
  failedConditions: string[]
  passedConditions: string[]
  data: StockData
  ruleset: RulesetType
}

// Ruleset types
export type RulesetType = 'standard' | 'strict'

export interface RulesetInfo {
  id: RulesetType
  name: string
  version: string
  description: string
}

// Available rulesets
export const RULESETS: Record<RulesetType, RulesetInfo> = {
  standard: {
    id: 'standard',
    name: 'Standard',
    version: 'v2.0',
    description: 'Balanced entry conditions with moderate streak requirement'
  },
  strict: {
    id: 'strict',
    name: 'Strict',
    version: 'v2.1',
    description: 'Stricter conditions with acceleration filter and higher streak'
  }
}

export const DEFAULT_RULESET: RulesetType = 'standard'

/**
 * Normalize value from Stockbit format
 * - Wrapped in parentheses → NEGATIVE
 * - "-" → NULL
 * - Otherwise parse as number
 */
export function normalizeValue(rawValue: string): number | null {
  const trimmed = rawValue.trim()

  // "-" means NULL
  if (trimmed === '-' || trimmed === '') {
    return null
  }

  // Check for parentheses (negative value)
  const isNegative = trimmed.startsWith('(') && trimmed.endsWith(')')

  // Remove parentheses if present
  let cleaned = isNegative ? trimmed.slice(1, -1) : trimmed

  // Remove commas, B suffix (billion), M suffix (million)
  cleaned = cleaned.replace(/,/g, '')

  let multiplier = 1
  if (cleaned.endsWith(' B') || cleaned.endsWith('B')) {
    multiplier = 1_000_000_000
    cleaned = cleaned.replace(/\s?B$/, '')
  } else if (cleaned.endsWith(' M') || cleaned.endsWith('M')) {
    multiplier = 1_000_000
    cleaned = cleaned.replace(/\s?M$/, '')
  }

  const value = parseFloat(cleaned)

  if (isNaN(value)) {
    return null
  }

  return isNegative ? -Math.abs(value * multiplier) : value * multiplier
}

/**
 * Evaluate stock using Standard ruleset (v2.0)
 * - Streak >= 2
 * - Group C: Either MA20 > 0
 */
function evaluateStockStandard(data: StockData): EvaluationResult {
  const passedConditions: string[] = []
  const failedConditions: string[] = []

  // GROUP E — HARD REJECT (Distribution) - Check first
  const E1 = data.bandarAccumDist !== null && data.bandarAccumDist < 0
  const E2 = data.netForeignBuySell !== null && data.netForeignBuySell < 0 &&
             data.netForeignBuyStreak !== null && data.netForeignBuyStreak === 0

  const hardReject = E1 || E2

  if (E1) failedConditions.push('E1: Bandar Accum/Dist < 0')
  if (E2) failedConditions.push('E2: Net Foreign < 0 AND Streak = 0')

  // GROUP A — Foreign Participation (Short Term)
  const A1 = data.netForeignBuySell !== null && data.netForeignBuySell > 0
  const A2 = data.netForeignBuySellMA10 !== null && data.netForeignBuySellMA10 > 0
  const A3 = data.oneWeekNetForeignFlow !== null && data.oneWeekNetForeignFlow > 0

  if (A1) passedConditions.push('A1: Net Foreign > 0')
  else failedConditions.push('A1: Net Foreign > 0')

  if (A2) passedConditions.push('A2: Net Foreign MA10 > 0')
  else failedConditions.push('A2: Net Foreign MA10 > 0')

  if (A3) passedConditions.push('A3: 1 Week Foreign Flow > 0')
  else failedConditions.push('A3: 1 Week Foreign Flow > 0')

  // GROUP B — Bandar Accumulation
  const B1 = data.bandarAccumDist !== null && data.bandarAccumDist > 0
  const B2 = data.bandarValue !== null && data.bandarValue > 0

  if (B1) passedConditions.push('B1: Bandar Accum/Dist > 0')
  else failedConditions.push('B1: Bandar Accum/Dist > 0')

  if (B2) passedConditions.push('B2: Bandar Value > 0')
  else failedConditions.push('B2: Bandar Value > 0')

  // GROUP C — Mid-Term Confirmation (at least one must be true)
  const C1 = data.netForeignBuySellMA20 !== null && data.netForeignBuySellMA20 > 0
  const C2 = data.bandarValueMA20 !== null && data.bandarValueMA20 > 0

  if (C1 || C2) {
    if (C1) passedConditions.push('C1: Net Foreign MA20 > 0')
    if (C2) passedConditions.push('C2: Bandar Value MA20 > 0')
  } else {
    failedConditions.push('C: Need either MA20 Foreign or Bandar > 0')
  }

  // GROUP D — Continuity Filter
  const D1 = data.netForeignBuyStreak !== null && data.netForeignBuyStreak >= 2

  if (D1) passedConditions.push('D1: Net Foreign Streak >= 2')
  else failedConditions.push('D1: Net Foreign Streak >= 2')

  // FINAL LOGIC
  const entryReady = A1 && A2 && A3 && B1 && B2 && (C1 || C2) && D1 && !hardReject

  // SCORING SYSTEM
  let score = 0
  if (data.bandarValueMA20 !== null && data.bandarValueMA20 > 0) score += 2
  if (data.netForeignBuySellMA20 !== null && data.netForeignBuySellMA20 > 0) score += 2
  if (data.netForeignBuyStreak !== null && data.netForeignBuyStreak >= 3) score += 1
  if (data.bandarValueMA10 !== null && data.bandarValueMA10 > 0) score += 1

  return {
    symbol: data.symbol,
    entryReady,
    score,
    failedConditions,
    passedConditions,
    data,
    ruleset: 'standard'
  }
}

/**
 * Evaluate stock using Strict ruleset (v2.1)
 * - Added B3: Bandar Value MA10 > 0
 * - Stricter C: Both MA20 >= 0, at least one > 0
 * - Streak >= 3
 * - Added F1: Acceleration filter (Net Foreign > MA10)
 */
function evaluateStockStrict(data: StockData): EvaluationResult {
  const passedConditions: string[] = []
  const failedConditions: string[] = []

  // GROUP E — HARD REJECT (Distribution) - Check first
  const E1 = data.bandarAccumDist !== null && data.bandarAccumDist < 0
  const E2 = data.netForeignBuySell !== null && data.netForeignBuySell < 0 &&
             data.netForeignBuyStreak !== null && data.netForeignBuyStreak === 0

  const hardReject = E1 || E2

  if (E1) failedConditions.push('E1: Bandar Accum/Dist < 0')
  if (E2) failedConditions.push('E2: Net Foreign < 0 AND Streak = 0')

  // GROUP A — Foreign Participation (Short Term)
  const A1 = data.netForeignBuySell !== null && data.netForeignBuySell > 0
  const A2 = data.netForeignBuySellMA10 !== null && data.netForeignBuySellMA10 > 0
  const A3 = data.oneWeekNetForeignFlow !== null && data.oneWeekNetForeignFlow > 0

  if (A1) passedConditions.push('A1: Net Foreign > 0')
  else failedConditions.push('A1: Net Foreign > 0')

  if (A2) passedConditions.push('A2: Net Foreign MA10 > 0')
  else failedConditions.push('A2: Net Foreign MA10 > 0')

  if (A3) passedConditions.push('A3: 1 Week Foreign Flow > 0')
  else failedConditions.push('A3: 1 Week Foreign Flow > 0')

  // GROUP B — Bandar Accumulation (With Confirmation)
  const B1 = data.bandarAccumDist !== null && data.bandarAccumDist > 0
  const B2 = data.bandarValue !== null && data.bandarValue > 0
  const B3 = data.bandarValueMA10 !== null && data.bandarValueMA10 > 0

  if (B1) passedConditions.push('B1: Bandar Accum/Dist > 0')
  else failedConditions.push('B1: Bandar Accum/Dist > 0')

  if (B2) passedConditions.push('B2: Bandar Value > 0')
  else failedConditions.push('B2: Bandar Value > 0')

  if (B3) passedConditions.push('B3: Bandar Value MA10 > 0')
  else failedConditions.push('B3: Bandar Value MA10 > 0')

  // GROUP C — Mid-Term Alignment (Strict)
  // Both >= 0 AND at least one > 0
  const C1_gte0 = data.netForeignBuySellMA20 !== null && data.netForeignBuySellMA20 >= 0
  const C2_gte0 = data.bandarValueMA20 !== null && data.bandarValueMA20 >= 0
  const C1_gt0 = data.netForeignBuySellMA20 !== null && data.netForeignBuySellMA20 > 0
  const C2_gt0 = data.bandarValueMA20 !== null && data.bandarValueMA20 > 0

  const groupC = C1_gte0 && C2_gte0 && (C1_gt0 || C2_gt0)

  if (groupC) {
    passedConditions.push('C: Both MA20 >= 0, at least one > 0')
    if (C1_gt0) passedConditions.push('C1: Net Foreign MA20 > 0')
    if (C2_gt0) passedConditions.push('C2: Bandar Value MA20 > 0')
  } else {
    failedConditions.push('C: Need both MA20 >= 0 & one > 0')
  }

  // GROUP D — Continuity Filter (Stricter: >= 3)
  const D1 = data.netForeignBuyStreak !== null && data.netForeignBuyStreak >= 3

  if (D1) passedConditions.push('D1: Net Foreign Streak >= 3')
  else failedConditions.push('D1: Net Foreign Streak >= 3')

  // GROUP F — Acceleration Filter
  const F1 = data.netForeignBuySell !== null &&
             data.netForeignBuySellMA10 !== null &&
             data.netForeignBuySell > data.netForeignBuySellMA10

  if (F1) passedConditions.push('F1: Acceleration (Foreign > MA10)')
  else failedConditions.push('F1: Acceleration (Foreign > MA10)')

  // FINAL LOGIC
  const entryReady = A1 && A2 && A3 && B1 && B2 && B3 && groupC && D1 && F1 && !hardReject

  // SCORING SYSTEM v2.1
  let score = 0
  // Tier 1 (+2 each)
  if (data.bandarValueMA20 !== null && data.bandarValueMA20 > 0) score += 2
  if (data.netForeignBuySellMA20 !== null && data.netForeignBuySellMA20 > 0) score += 2
  if (F1) score += 2 // Acceleration

  // Tier 2 (+1 each)
  if (data.netForeignBuyStreak !== null && data.netForeignBuyStreak >= 5) score += 1
  if (data.bandarValueMA10 !== null && data.bandarValueMA10 > 0) score += 1
  // 1W > 1M flow comparison (if both available)
  if (data.oneWeekNetForeignFlow !== null &&
      data.oneMonthNetForeignFlow !== null &&
      data.oneWeekNetForeignFlow > data.oneMonthNetForeignFlow) {
    score += 1
  }

  return {
    symbol: data.symbol,
    entryReady,
    score,
    failedConditions,
    passedConditions,
    data,
    ruleset: 'strict'
  }
}

/**
 * Evaluate stock data against the selected ruleset
 */
export function evaluateStock(data: StockData, ruleset: RulesetType = DEFAULT_RULESET): EvaluationResult {
  switch (ruleset) {
    case 'strict':
      return evaluateStockStrict(data)
    case 'standard':
    default:
      return evaluateStockStandard(data)
  }
}
