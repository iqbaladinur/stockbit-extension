// Ruleset types and evaluation logic
// Based on ruleset.md v2.0

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
}

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
 * Evaluate stock data against the ruleset
 */
export function evaluateStock(data: StockData): EvaluationResult {
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
    data
  }
}
