// Test script to verify ruleset evaluation against input-sample.html
// Run with: npx tsx src/test/testRuleset.ts

import { normalizeValue, evaluateStock, StockData } from '../lib/ruleset'

// Data extracted from input-sample.html
// Column order: Symbol, Price, ATH, Net Foreign, Net Foreign MA10, Net Foreign MA20, 
//               1W Foreign Flow, 1M Foreign Flow, Foreign Streak, Bandar A/D, 
//               Bandar Value, Bandar MA10, Bandar MA20, Insider

const rawData = [
  {
    symbol: 'ADRO',
    price: '2,210',
    netForeignBuySell: '-',  // NULL
    netForeignBuySellMA10: '45.57 B',
    netForeignBuySellMA20: '43.57 B',
    oneWeekNetForeignFlow: '40.73 B',
    oneMonthNetForeignFlow: '871.45 B',
    netForeignBuyStreak: '-', // NULL
    bandarAccumDist: '-30.79',  // Negative
    bandarValue: '(3,219.88 B)',  // Negative (parentheses)
    bandarValueMA10: '(3,262.06 B)',  // Negative
    bandarValueMA20: '(3,383.86 B)',  // Negative
  },
  {
    symbol: 'ANTM',
    price: '4,210',
    netForeignBuySell: '-',  // NULL
    netForeignBuySellMA10: '(96.73 B)',  // Negative
    netForeignBuySellMA20: '6.09 B',
    oneWeekNetForeignFlow: '(1,052.68 B)',  // Negative
    oneMonthNetForeignFlow: '121.86 B',
    netForeignBuyStreak: '1.00',
    bandarAccumDist: '16.44',  // Positive
    bandarValue: '(815.39 B)',  // Negative
    bandarValueMA10: '(441.84 B)',  // Negative
    bandarValueMA20: '(523.54 B)',  // Negative
  },
  {
    symbol: 'BBCA',
    price: '7,400',
    netForeignBuySell: '(25.24 B)',  // Negative
    netForeignBuySellMA10: '(1,197.23 B)',  // Negative
    netForeignBuySellMA20: '(610.90 B)',  // Negative
    oneWeekNetForeignFlow: '(8,117.87 B)',  // Negative
    oneMonthNetForeignFlow: '(12,218.07 B)',  // Negative
    netForeignBuyStreak: '-',  // NULL
    bandarAccumDist: '15.58',  // Positive
    bandarValue: '(20,237.92 B)',  // Negative
    bandarValueMA10: '(17,159.43 B)',  // Negative
    bandarValueMA20: '(15,977.01 B)',  // Negative
  },
  {
    symbol: 'BBNI',
    price: '4,490',
    netForeignBuySell: '(121.61 B)',  // Negative
    netForeignBuySellMA10: '(87.14 B)',  // Negative
    netForeignBuySellMA20: '(35.53 B)',  // Negative
    oneWeekNetForeignFlow: '(569.73 B)',  // Negative
    oneMonthNetForeignFlow: '(710.55 B)',  // Negative
    netForeignBuyStreak: '-',  // NULL
    bandarAccumDist: '-11.80',  // Negative
    bandarValue: '(4,927.96 B)',  // Negative
    bandarValueMA10: '(4,676.14 B)',  // Negative
    bandarValueMA20: '(4,688.50 B)',  // Negative
  },
  {
    symbol: 'BBRI',
    price: '3,810',
    netForeignBuySell: '177.65 B',  // Positive!
    netForeignBuySellMA10: '(33.04 B)',  // Negative
    netForeignBuySellMA20: '26.15 B',  // Positive
    oneWeekNetForeignFlow: '(790.38 B)',  // Negative
    oneMonthNetForeignFlow: '523.08 B',  // Positive
    netForeignBuyStreak: '2.00',  // >= 2
    bandarAccumDist: '14.31',  // Positive
    bandarValue: '(22,156.30 B)',  // Negative
    bandarValueMA10: '(21,945.38 B)',  // Negative
    bandarValueMA20: '(22,168.84 B)',  // Negative
  },
  {
    symbol: 'BMRI',
    price: '4,820',
    netForeignBuySell: '32.23 B',  // Positive
    netForeignBuySellMA10: '(303.00 B)',  // Negative
    netForeignBuySellMA20: '(207.69 B)',  // Negative
    oneWeekNetForeignFlow: '(2,719.10 B)',  // Negative
    oneMonthNetForeignFlow: '(4,153.70 B)',  // Negative
    netForeignBuyStreak: '1.00',
    bandarAccumDist: '-5.19',  // Negative
    bandarValue: '(14,810.70 B)',  // Negative
    bandarValueMA10: '(13,856.41 B)',  // Negative
    bandarValueMA20: '(13,629.18 B)',  // Negative
  },
  {
    symbol: 'TLKM',
    price: '3,600',
    netForeignBuySell: '(277.45 B)',  // Negative
    netForeignBuySellMA10: '(103.33 B)',  // Negative
    netForeignBuySellMA20: '(24.02 B)',  // Negative
    oneWeekNetForeignFlow: '(1,107.81 B)',  // Negative
    oneMonthNetForeignFlow: '(480.34 B)',  // Negative
    netForeignBuyStreak: '-',  // NULL
    bandarAccumDist: '5.72',  // Positive
    bandarValue: '(21.16 B)',  // Negative
    bandarValueMA10: '262.78 B',  // Positive!
    bandarValueMA20: '166.40 B',  // Positive!
  },
]

console.log('='.repeat(80))
console.log('STOCKBIT PERSONAL SCREENER - RULESET TEST')
console.log('='.repeat(80))
console.log('')

// Process each stock
const results = rawData.map(raw => {
  const data: StockData = {
    symbol: raw.symbol,
    price: normalizeValue(raw.price),
    netForeignBuySell: normalizeValue(raw.netForeignBuySell),
    netForeignBuySellMA10: normalizeValue(raw.netForeignBuySellMA10),
    netForeignBuySellMA20: normalizeValue(raw.netForeignBuySellMA20),
    oneWeekNetForeignFlow: normalizeValue(raw.oneWeekNetForeignFlow),
    oneMonthNetForeignFlow: normalizeValue(raw.oneMonthNetForeignFlow),
    netForeignBuyStreak: normalizeValue(raw.netForeignBuyStreak),
    bandarAccumDist: normalizeValue(raw.bandarAccumDist),
    bandarValue: normalizeValue(raw.bandarValue),
    bandarValueMA10: normalizeValue(raw.bandarValueMA10),
    bandarValueMA20: normalizeValue(raw.bandarValueMA20),
  }
  
  return evaluateStock(data)
})

// Print results
results.forEach(result => {
  const status = result.entryReady ? '✅ ENTRY READY' : '❌ NOT READY'
  console.log(`\n${'─'.repeat(60)}`)
  console.log(`${result.symbol} - ${status} (Score: ${result.score})`)
  console.log(`${'─'.repeat(60)}`)
  
  console.log('\nParsed Values:')
  console.log(`  Net Foreign: ${result.data.netForeignBuySell?.toLocaleString() ?? 'NULL'}`)
  console.log(`  Net Foreign MA10: ${result.data.netForeignBuySellMA10?.toLocaleString() ?? 'NULL'}`)
  console.log(`  Net Foreign MA20: ${result.data.netForeignBuySellMA20?.toLocaleString() ?? 'NULL'}`)
  console.log(`  1W Foreign Flow: ${result.data.oneWeekNetForeignFlow?.toLocaleString() ?? 'NULL'}`)
  console.log(`  Foreign Streak: ${result.data.netForeignBuyStreak ?? 'NULL'}`)
  console.log(`  Bandar A/D: ${result.data.bandarAccumDist ?? 'NULL'}`)
  console.log(`  Bandar Value: ${result.data.bandarValue?.toLocaleString() ?? 'NULL'}`)
  console.log(`  Bandar MA10: ${result.data.bandarValueMA10?.toLocaleString() ?? 'NULL'}`)
  console.log(`  Bandar MA20: ${result.data.bandarValueMA20?.toLocaleString() ?? 'NULL'}`)
  
  if (result.passedConditions.length > 0) {
    console.log('\n✓ Passed:')
    result.passedConditions.forEach(c => console.log(`  - ${c}`))
  }
  
  if (result.failedConditions.length > 0) {
    console.log('\n✗ Failed:')
    result.failedConditions.forEach(c => console.log(`  - ${c}`))
  }
})

// Summary
console.log('\n' + '='.repeat(80))
console.log('SUMMARY')
console.log('='.repeat(80))

const entryReady = results.filter(r => r.entryReady)
const notReady = results.filter(r => !r.entryReady)

console.log(`\n✅ Entry Ready: ${entryReady.length}`)
entryReady.forEach(r => console.log(`   - ${r.symbol} (Score: ${r.score})`))

console.log(`\n❌ Not Ready: ${notReady.length}`)
notReady.forEach(r => console.log(`   - ${r.symbol}`))

console.log('\n' + '='.repeat(80))
