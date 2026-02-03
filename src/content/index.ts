// Content script - injected into stockbit.com/watchlist
// Highlights rows based on ruleset evaluation

import { evaluateStock, EvaluationResult, RulesetType, DEFAULT_RULESET } from '../lib/ruleset'
import { findWatchlistTable, extractColumnHeaders, parseRow } from '../lib/tableParser'

console.log('[Stockbit Screener] Content script loaded on:', window.location.href)

// Current ruleset setting
let currentRuleset: RulesetType = DEFAULT_RULESET

// Styles for highlighting
const STYLES = {
  pass: 'background-color: rgba(16, 185, 129, 0.15) !important; border-left: 4px solid #10B981 !important;',
  fail: 'background-color: rgba(239, 68, 68, 0.15) !important; border-left: 4px solid #EF4444 !important;',
  neutral: 'background-color: rgba(245, 158, 11, 0.15) !important; border-left: 4px solid #F59E0B !important;'
}

// Data attribute to mark processed rows (survives React re-renders better than WeakSet)
const PROCESSED_ATTR = 'data-screener-processed'
const PROCESSED_RULESET_ATTR = 'data-screener-ruleset'
const PROCESSED_HASH_ATTR = 'data-screener-hash' // Hash of row data to detect changes

// Debounce timer
let processDebounceTimer: ReturnType<typeof setTimeout> | null = null
const DEBOUNCE_DELAY = 300 // ms

// Stability check - wait for DOM to stabilize
let lastMutationTime = 0
const STABILITY_DELAY = 200 // ms - wait this long after last mutation

/**
 * Check if a cell has actual numeric data (not empty or loading)
 */
function cellHasData(cell: HTMLTableCellElement): boolean {
  const text = cell.textContent?.trim() || ''
  // Check if cell has actual content (not empty, not just dashes, not loading text)
  if (!text || text === '-' || text === '--' || text.toLowerCase() === 'loading') {
    return false
  }
  return true
}

/**
 * Check if a row is ready to be processed (has valid data loaded)
 */
function isRowReady(row: HTMLTableRowElement): boolean {
  // Check if symbol cell exists and has content
  const firstCell = row.querySelector('td')
  if (!firstCell) return false

  // Look for the symbol element
  const symbolElement = firstCell.querySelector('p[family="bold"][weight="700"]')
  if (!symbolElement || !symbolElement.textContent?.trim()) return false

  // Check if row is not in loading/skeleton state
  if (row.classList.contains('ant-table-placeholder') ||
      row.querySelector('.ant-skeleton') ||
      row.querySelector('[class*="loading"]') ||
      row.querySelector('[class*="skeleton"]')) {
    return false
  }

  // Check if row has multiple cells (data columns)
  const cells = row.querySelectorAll('td')
  if (cells.length < 3) return false

  // Check if at least some data cells have actual content (not just the symbol)
  // This ensures the numeric data has loaded
  let dataCellsWithContent = 0
  for (let i = 1; i < cells.length && i < 5; i++) {
    if (cellHasData(cells[i] as HTMLTableCellElement)) {
      dataCellsWithContent++
    }
  }

  // Require at least 2 data cells to have content
  if (dataCellsWithContent < 2) {
    return false
  }

  return true
}

/**
 * Generate a simple hash of row content to detect data changes
 */
function getRowDataHash(row: HTMLTableRowElement): string {
  const cells = row.querySelectorAll('td')
  let content = ''
  cells.forEach((cell, index) => {
    // Skip first cell (symbol) as it shouldn't change
    if (index > 0 && index < 8) {
      content += (cell.textContent?.trim() || '') + '|'
    }
  })
  // Simple hash - just use the content string length + first/last chars
  return `${content.length}-${content.slice(0, 20)}-${content.slice(-20)}`
}

/**
 * Check if row needs processing (not processed or ruleset changed or data changed)
 */
function needsProcessing(row: HTMLTableRowElement, forceReprocess: boolean): boolean {
  if (forceReprocess) return true

  const processed = row.getAttribute(PROCESSED_ATTR)
  if (!processed) return true

  // Check if ruleset changed since last processing
  const processedRuleset = row.getAttribute(PROCESSED_RULESET_ATTR)
  if (processedRuleset !== currentRuleset) return true

  // Check if data changed since last processing
  const processedHash = row.getAttribute(PROCESSED_HASH_ATTR)
  const currentHash = getRowDataHash(row)
  if (processedHash !== currentHash) return true

  return false
}

/**
 * Mark row as processed
 */
function markRowProcessed(row: HTMLTableRowElement): void {
  row.setAttribute(PROCESSED_ATTR, Date.now().toString())
  row.setAttribute(PROCESSED_RULESET_ATTR, currentRuleset)
  row.setAttribute(PROCESSED_HASH_ATTR, getRowDataHash(row))
}

// Tooltip definitions for condition codes (with value placeholders)
const CONDITION_TOOLTIPS: Record<string, { desc: string; valueKey?: string }> = {
  // Group A - Streak
  'A1': { desc: 'Net Foreign Buy Streak >= 2 hari', valueKey: 'streak' },
  'A2': { desc: 'Net Foreign Buy Streak >= 3 hari (bonus)', valueKey: 'streak' },

  // Group B - Foreign Flow
  'B1': { desc: 'Net Foreign Buy/Sell > 0 (positif)', valueKey: 'foreign' },
  'B2': { desc: 'Net Foreign > MA10', valueKey: 'foreignVsMa10' },
  'B3': { desc: 'Net Foreign > MA20', valueKey: 'foreignVsMa20' },

  // Group C - MA Comparison
  'C1': { desc: 'Net Foreign MA10 > 0 (tren positif)', valueKey: 'ma10' },
  'C2': { desc: 'Net Foreign MA20 > 0 (tren positif)', valueKey: 'ma20' },

  // Group D - Bandar
  'D1': { desc: 'Bandar Accum/Dist > 0 (akumulasi)', valueKey: 'bandarAD' },
  'D2': { desc: 'Bandar Value > 0 (net buy)', valueKey: 'bandarVal' },
  'D3': { desc: 'Bandar Value > MA10', valueKey: 'bandarVsMa10' },

  // Group E - Hard Reject
  'E1': { desc: 'REJECT: Bandar distribusi', valueKey: 'bandarAD' },
  'E2': { desc: 'REJECT: Foreign negatif + Streak rendah', valueKey: 'foreignStreak' },

  // Weekly/Monthly Flow
  'W1': { desc: '1 Week Foreign Flow > 0', valueKey: 'weekFlow' },
  'M1': { desc: '1 Month Foreign Flow > 0', valueKey: 'monthFlow' },
}

/**
 * Get tooltip text for a condition code with actual values
 */
function getConditionTooltip(condition: string, data: import('../lib/ruleset').StockData): string {
  const code = condition.split(':')[0]
  const tooltipDef = CONDITION_TOOLTIPS[code]

  if (!tooltipDef) return condition

  let tooltip = tooltipDef.desc

  // Add actual values based on valueKey
  const valueKey = tooltipDef.valueKey
  if (valueKey) {
    const values: Record<string, string> = {
      streak: `Streak: ${data.netForeignBuyStreak ?? '-'} hari`,
      foreign: `Foreign: ${formatValue(data.netForeignBuySell)}`,
      ma10: `MA10: ${formatValue(data.netForeignBuySellMA10)}`,
      ma20: `MA20: ${formatValue(data.netForeignBuySellMA20)}`,
      foreignVsMa10: `Foreign: ${formatValue(data.netForeignBuySell)} vs MA10: ${formatValue(data.netForeignBuySellMA10)}`,
      foreignVsMa20: `Foreign: ${formatValue(data.netForeignBuySell)} vs MA20: ${formatValue(data.netForeignBuySellMA20)}`,
      bandarAD: `B.Accum/Dist: ${data.bandarAccumDist?.toFixed(2) ?? '-'}`,
      bandarVal: `Bandar Value: ${formatValue(data.bandarValue)}`,
      bandarVsMa10: `Bandar: ${formatValue(data.bandarValue)} vs MA10: ${formatValue(data.bandarValueMA10)}`,
      foreignStreak: `Foreign: ${formatValue(data.netForeignBuySell)}, Streak: ${data.netForeignBuyStreak ?? '-'}`,
      weekFlow: `1W Flow: ${formatValue(data.oneWeekNetForeignFlow)}`,
      monthFlow: `1M Flow: ${formatValue(data.oneMonthNetForeignFlow)}`,
    }
    tooltip += `\n📊 ${values[valueKey] || ''}`
  }

  return tooltip
}

/**
 * Apply styling to a row based on evaluation result
 */
function styleRow(row: HTMLTableRowElement, result: EvaluationResult): void {
  const style = result.entryReady ? STYLES.pass : STYLES.fail
  row.setAttribute('style', style)

  // Add score panel to show status
  const firstCell = row.querySelector('td')
  if (firstCell) {
    // Remove existing panel
    const existingPanel = firstCell.querySelector('.screener-panel')
    if (existingPanel) existingPanel.remove()

    // Create score panel
    const panel = document.createElement('div')
    panel.className = 'screener-panel'

    const bgColor = result.entryReady ? '#10B981' : '#EF4444'
    const borderColor = result.entryReady ? '#059669' : '#DC2626'

    // Build conditions HTML with tooltips
    const passedConditionsHtml = result.passedConditions.map(c => `
      <span
        title="${getConditionTooltip(c, result.data).replace(/"/g, '&quot;')}"
        style="
          background: #10B98120;
          color: #059669;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 9px;
          font-weight: 500;
          cursor: help;
        ">✓ ${c.split(':')[0]}</span>
    `).join('')

    const failedConditionsHtml = result.failedConditions.map(c => `
      <span
        title="${getConditionTooltip(c, result.data).replace(/"/g, '&quot;')}"
        style="
          background: #EF444420;
          color: #DC2626;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 9px;
          font-weight: 500;
          cursor: help;
        ">✗ ${c.split(':')[0]}</span>
    `).join('')

    panel.innerHTML = `
      <div style="
        display: flex;
        flex-direction: column;
        gap: 4px;
        margin-top: 8px;
        padding: 8px 10px;
        background: linear-gradient(135deg, ${bgColor}15 0%, ${bgColor}08 100%);
        border: 1px solid ${borderColor}40;
        border-radius: 8px;
        font-size: 11px;
      ">
        <!-- Header -->
        <div style="
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-bottom: 6px;
          border-bottom: 1px solid ${borderColor}30;
        ">
          <span
            title="${result.entryReady
              ? 'Semua kondisi entry terpenuhi. Saham ini layak untuk dipertimbangkan entry.'
              : 'Belum memenuhi semua kondisi entry. Tunggu konfirmasi lebih lanjut.'}"
            style="
              display: inline-flex;
              align-items: center;
              gap: 4px;
              font-weight: 700;
              color: ${bgColor};
              cursor: help;
            ">
            ${result.entryReady ? '✅' : '❌'}
            ${result.entryReady ? 'ENTRY READY' : 'NOT READY'}
          </span>
          <span
            title="Skor total dari semua kondisi yang terpenuhi. Semakin tinggi semakin baik."
            style="
              background: ${bgColor};
              color: white;
              padding: 2px 8px;
              border-radius: 10px;
              font-weight: 700;
              font-size: 10px;
              cursor: help;
            ">Score: ${result.score}</span>
        </div>

        <!-- Conditions -->
        <div style="display: flex; flex-wrap: wrap; gap: 3px; margin-top: 2px;">
          ${passedConditionsHtml}
          ${failedConditionsHtml}
        </div>

        <!-- Key Values -->
        <div style="
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 4px;
          margin-top: 4px;
          padding-top: 6px;
          border-top: 1px solid ${borderColor}20;
          font-size: 9px;
          color: #666;
        ">
          <div title="Net Foreign Buy/Sell hari ini
${(result.data.netForeignBuySell ?? 0) > 0 ? '✅ Positif = Foreign net BUY' : '❌ Negatif = Foreign net SELL'}
📊 MA10: ${formatValue(result.data.netForeignBuySellMA10)}
📊 MA20: ${formatValue(result.data.netForeignBuySellMA20)}" style="cursor: help;">
            <span style="color: #999;">Foreign:</span>
            <span style="color: ${(result.data.netForeignBuySell ?? 0) > 0 ? '#10B981' : '#EF4444'}; font-weight: 600;">
              ${formatValue(result.data.netForeignBuySell)}
            </span>
          </div>
          <div title="Foreign Buy Streak (hari berturut-turut)
${(result.data.netForeignBuyStreak ?? 0) >= 2 ? '✅ >= 2 hari (OK untuk entry)' : '❌ < 2 hari (belum cukup)'}
${(result.data.netForeignBuyStreak ?? 0) >= 3 ? '🌟 >= 3 hari (bonus point!)' : ''}" style="cursor: help;">
            <span style="color: #999;">Streak:</span>
            <span style="color: ${(result.data.netForeignBuyStreak ?? 0) >= 2 ? '#10B981' : '#EF4444'}; font-weight: 600;">
              ${result.data.netForeignBuyStreak ?? '-'}
            </span>
          </div>
          <div title="Bandar Accumulation/Distribution
${(result.data.bandarAccumDist ?? 0) > 0 ? '✅ Positif = Bandar AKUMULASI' : '❌ Negatif = Bandar DISTRIBUSI (hindari!)'}
📊 Bandar Value: ${formatValue(result.data.bandarValue)}
📊 Bandar MA10: ${formatValue(result.data.bandarValueMA10)}" style="cursor: help;">
            <span style="color: #999;">B.A/D:</span>
            <span style="color: ${(result.data.bandarAccumDist ?? 0) > 0 ? '#10B981' : '#EF4444'}; font-weight: 600;">
              ${result.data.bandarAccumDist?.toFixed(2) ?? '-'}
            </span>
          </div>
        </div>
      </div>
    `

    // Append panel to the first cell container
    const container = firstCell.querySelector('.sc-50150f6d-0') || firstCell
    container.appendChild(panel)
  }
}

/**
 * Format large numbers for display
 */
function formatValue(value: number | null): string {
  if (value === null) return '-'
  const absValue = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  if (absValue >= 1_000_000_000_000) {
    return `${sign}${(absValue / 1_000_000_000_000).toFixed(1)}T`
  } else if (absValue >= 1_000_000_000) {
    return `${sign}${(absValue / 1_000_000_000).toFixed(1)}B`
  } else if (absValue >= 1_000_000) {
    return `${sign}${(absValue / 1_000_000).toFixed(1)}M`
  }
  return value.toLocaleString()
}

/**
 * Check if table has valid headers and some data rows
 */
function isTableReady(table: HTMLTableElement): boolean {
  const headers = extractColumnHeaders(table)
  // Should have at least symbol and a few data columns
  if (headers.length < 3 || !headers.includes('symbol')) {
    return false
  }

  // Check if there's at least one data row with content
  const rows = table.querySelectorAll('tbody tr')
  if (rows.length === 0) return false

  // Check if at least one row has a symbol (data is loading)
  for (const row of rows) {
    const tr = row as HTMLTableRowElement
    if (tr.classList.contains('ant-table-placeholder')) continue

    const symbolElement = tr.querySelector('td p[family="bold"][weight="700"]')
    if (symbolElement?.textContent?.trim()) {
      return true
    }
  }

  return false
}

/**
 * Process all rows in the table
 */
function processTable(forceReprocess = false): void {
  const table = findWatchlistTable()

  if (!table) {
    console.log('[Stockbit Screener] No watchlist table found')
    return
  }

  // Check if table is ready
  if (!isTableReady(table)) {
    console.log('[Stockbit Screener] Table not ready, will retry...')
    scheduleProcess(forceReprocess)
    return
  }

  console.log(`[Stockbit Screener] Found watchlist table, processing with ${currentRuleset} ruleset...`)

  const headers = extractColumnHeaders(table)
  console.log('[Stockbit Screener] Headers:', headers)

  const rows = table.querySelectorAll('tbody tr')
  let passCount = 0
  let failCount = 0
  let skippedCount = 0
  let notReadyCount = 0

  rows.forEach((row) => {
    const tr = row as HTMLTableRowElement

    // Skip placeholder/empty rows
    if (tr.classList.contains('ant-table-placeholder')) return

    // Check if row needs processing
    if (!needsProcessing(tr, forceReprocess)) {
      skippedCount++
      return
    }

    // Check if row is ready (data loaded)
    if (!isRowReady(tr)) {
      notReadyCount++
      return
    }

    const data = parseRow(tr, headers)

    if (!data.symbol) {
      notReadyCount++
      return
    }

    const result = evaluateStock(data, currentRuleset)

    console.log(`[Stockbit Screener] ${data.symbol}:`, {
      ruleset: currentRuleset,
      entryReady: result.entryReady,
      score: result.score,
      failed: result.failedConditions,
      data: {
        netForeignBuySell: data.netForeignBuySell,
        netForeignBuySellMA10: data.netForeignBuySellMA10,
        netForeignBuyStreak: data.netForeignBuyStreak,
        bandarAccumDist: data.bandarAccumDist,
        bandarValue: data.bandarValue,
      }
    })

    styleRow(tr, result)
    markRowProcessed(tr)

    if (result.entryReady) passCount++
    else failCount++
  })

  console.log(`[Stockbit Screener] Processed ${passCount + failCount} stocks: ${passCount} passed, ${failCount} failed, ${skippedCount} already processed, ${notReadyCount} not ready (${currentRuleset})`)

  // If there are rows not ready, schedule another processing
  if (notReadyCount > 0) {
    console.log(`[Stockbit Screener] ${notReadyCount} rows not ready, scheduling retry...`)
    scheduleProcess(forceReprocess)
  }
}

/**
 * Schedule a debounced process
 */
function scheduleProcess(forceReprocess = false): void {
  if (processDebounceTimer) {
    clearTimeout(processDebounceTimer)
  }

  processDebounceTimer = setTimeout(() => {
    processDebounceTimer = null

    // Wait for DOM to stabilize (no mutations for STABILITY_DELAY ms)
    const timeSinceLastMutation = Date.now() - lastMutationTime
    if (timeSinceLastMutation < STABILITY_DELAY) {
      console.log('[Stockbit Screener] DOM still changing, waiting for stability...')
      scheduleProcess(forceReprocess)
      return
    }

    processTable(forceReprocess)
  }, DEBOUNCE_DELAY)
}

// Global observer instance
let observer: MutationObserver | null = null

/**
 * Check if a mutation is relevant to the watchlist table
 */
function isRelevantMutation(mutation: MutationRecord): boolean {
  // Check added nodes
  if (mutation.type === 'childList') {
    for (const node of mutation.addedNodes) {
      if (node instanceof HTMLElement) {
        // Check if table, row, or cell was added
        if (node.tagName === 'TABLE' || node.tagName === 'TBODY' ||
            node.tagName === 'TR' || node.tagName === 'TD' ||
            node.tagName === 'P' || node.tagName === 'SPAN' ||
            node.querySelector('table') || node.querySelector('tbody') ||
            node.querySelector('tr') || node.querySelector('td')) {
          return true
        }
        // Check for ant-table related elements
        if (node.classList?.contains('ant-table') ||
            node.classList?.contains('ant-table-body') ||
            node.classList?.contains('ant-table-row')) {
          return true
        }
        // Check if node is inside a table cell
        if (node.closest('td')) {
          return true
        }
      }
      // Also check text nodes being added to table cells
      if (node.nodeType === Node.TEXT_NODE) {
        const parent = node.parentElement
        if (parent?.closest('td')) {
          return true
        }
      }
    }
    // Also check removed nodes (row might have been replaced)
    for (const node of mutation.removedNodes) {
      if (node instanceof HTMLElement) {
        if (node.tagName === 'TR' || node.tagName === 'TBODY') {
          return true
        }
      }
    }
  }

  // Check character data changes (text content updates)
  if (mutation.type === 'characterData') {
    const parent = mutation.target.parentElement
    if (parent?.closest('table') || parent?.closest('td')) {
      return true
    }
  }

  // Check attribute changes on rows
  if (mutation.type === 'attributes') {
    const target = mutation.target as HTMLElement
    if (target.tagName === 'TR' || target.closest('tr')) {
      // Ignore our own attribute changes
      if (mutation.attributeName === PROCESSED_ATTR ||
          mutation.attributeName === PROCESSED_RULESET_ATTR ||
          mutation.attributeName === PROCESSED_HASH_ATTR) {
        return false
      }
      return true
    }
  }

  return false
}

/**
 * Setup mutation observer to handle dynamic content
 */
function setupObserver(): void {
  if (observer) return // Already set up

  observer = new MutationObserver((mutations) => {
    let shouldProcess = false

    for (const mutation of mutations) {
      if (isRelevantMutation(mutation)) {
        shouldProcess = true
        break
      }
    }

    if (shouldProcess) {
      lastMutationTime = Date.now()
      scheduleProcess()
    }
  })

  // Watch for table container changes with more comprehensive options
  const tableContainer = document.querySelector('.ant-table-wrapper') ||
                         document.querySelector('.ant-table') ||
                         document.body

  observer.observe(tableContainer, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['class', 'style'] // Watch for class/style changes on rows
  })

  console.log('[Stockbit Screener] Realtime mode ENABLED: Mutation observer started')
}

/**
 * Teardown mutation observer
 */
function teardownObserver(): void {
  if (observer) {
    observer.disconnect()
    observer = null
    console.log('[Stockbit Screener] Realtime mode DISABLED: Mutation observer stopped')
  }
  teardownScrollListener()
}

// Scroll listener for virtual scrolling tables
let scrollListenerAdded = false
let scrollDebounceTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Handle scroll events to process newly visible rows
 */
function handleScroll(): void {
  if (scrollDebounceTimer) {
    clearTimeout(scrollDebounceTimer)
  }

  scrollDebounceTimer = setTimeout(() => {
    scrollDebounceTimer = null
    scheduleProcess()
  }, 150)
}

/**
 * Setup scroll listener for virtual scrolling
 */
function setupScrollListener(): void {
  if (scrollListenerAdded) return

  // Find the scrollable container
  const scrollContainer = document.querySelector('.ant-table-body') ||
                          document.querySelector('.ant-table-content') ||
                          document.querySelector('[class*="ant-table"]')?.closest('[style*="overflow"]')

  if (scrollContainer) {
    scrollContainer.addEventListener('scroll', handleScroll, { passive: true })
    scrollListenerAdded = true
    console.log('[Stockbit Screener] Scroll listener added')
  }

  // Also listen to window scroll as fallback
  window.addEventListener('scroll', handleScroll, { passive: true })
}

/**
 * Teardown scroll listener
 */
function teardownScrollListener(): void {
  if (!scrollListenerAdded) return

  const scrollContainer = document.querySelector('.ant-table-body') ||
                          document.querySelector('.ant-table-content')

  if (scrollContainer) {
    scrollContainer.removeEventListener('scroll', handleScroll)
  }
  window.removeEventListener('scroll', handleScroll)
  scrollListenerAdded = false

  if (scrollDebounceTimer) {
    clearTimeout(scrollDebounceTimer)
    scrollDebounceTimer = null
  }
}

/**
 * Wait for table to be ready with exponential backoff
 */
function waitForTable(callback: () => void, maxAttempts = 20): void {
  let attempts = 0
  let delay = 200 // Start with 200ms

  const check = () => {
    attempts++
    const table = findWatchlistTable()

    if (table && isTableReady(table)) {
      console.log(`[Stockbit Screener] Table found and ready after ${attempts} attempts`)
      callback()
      return
    }

    if (attempts >= maxAttempts) {
      console.log('[Stockbit Screener] Max attempts reached, table not found')
      // Even if table not found, setup observer in case it loads later
      return
    }

    // Exponential backoff with cap
    delay = Math.min(delay * 1.5, 2000)
    console.log(`[Stockbit Screener] Table not ready, retry in ${delay}ms (attempt ${attempts}/${maxAttempts})`)
    setTimeout(check, delay)
  }

  check()
}

/**
 * Initialize the content script
 */
async function init(): Promise<void> {
  console.log('[Stockbit Screener] Initializing...')

  // Check if we're on the watchlist page
  if (!window.location.href.includes('stockbit.com/watchlist')) {
    console.log('[Stockbit Screener] Not on watchlist page, skipping...')
    return
  }

  // Get settings
  const { realtimeMode, ruleset } = await chrome.storage.sync.get(['realtimeMode', 'ruleset'])
  const isRealtime = realtimeMode !== undefined ? realtimeMode : true
  currentRuleset = ruleset || DEFAULT_RULESET

  console.log(`[Stockbit Screener] Settings loaded: realtime=${isRealtime}, ruleset=${currentRuleset}`)

  // Wait for table to load with better retry logic
  waitForTable(() => {
    // Initial delay to let all data load
    setTimeout(() => {
      processTable()

      // Schedule additional processing passes to catch late-loading data
      setTimeout(() => processTable(), 1000)
      setTimeout(() => processTable(), 2500)

      if (isRealtime) {
        setupObserver()
        setupScrollListener()
      }
    }, 800) // Wait 800ms after table found for data to settle
  })

  // Also setup observer early if realtime mode, to catch dynamic loading
  if (isRealtime) {
    // Delay observer setup slightly to avoid catching initial page load noise
    setTimeout(() => {
      setupObserver()
      setupScrollListener()
    }, 1500)
  }
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  console.log('[Stockbit Screener] Message received:', message)

  if (message.type === 'SCAN_TABLE') {
    // Force reprocess all rows
    processTable(true)
    sendResponse({ success: true })
  }

  if (message.type === 'GET_RESULTS') {
    const table = findWatchlistTable()
    if (!table) {
      sendResponse({ error: 'No table found' })
      return
    }

    const headers = extractColumnHeaders(table)
    const rows = table.querySelectorAll('tbody tr')
    const results: EvaluationResult[] = []

    rows.forEach((row) => {
      const data = parseRow(row as HTMLTableRowElement, headers)
      if (data.symbol) {
        results.push(evaluateStock(data, currentRuleset))
      }
    })

    sendResponse({ results, ruleset: currentRuleset })
  }

  if (message.type === 'SET_REALTIME_MODE') {
    if (message.enabled) {
      setupObserver()
      setupScrollListener()
    } else {
      teardownObserver()
    }
    sendResponse({ success: true })
  }

  if (message.type === 'SET_RULESET') {
    const newRuleset = message.ruleset as RulesetType
    if (newRuleset !== currentRuleset) {
      console.log(`[Stockbit Screener] Switching ruleset: ${currentRuleset} -> ${newRuleset}`)
      currentRuleset = newRuleset
      // Force reprocess all rows with new ruleset
      processTable(true)
    }
    sendResponse({ success: true, ruleset: currentRuleset })
  }

  return true
})

// Track current URL for SPA navigation detection
let currentUrl = window.location.href

/**
 * Handle SPA navigation - re-init when URL changes to watchlist
 */
function handleNavigation(): void {
  if (currentUrl !== window.location.href) {
    const wasOnWatchlist = currentUrl.includes('stockbit.com/watchlist')
    currentUrl = window.location.href
    const isOnWatchlist = currentUrl.includes('stockbit.com/watchlist')

    console.log('[Stockbit Screener] URL changed:', currentUrl)

    // If navigated to watchlist, re-initialize
    if (isOnWatchlist && !wasOnWatchlist) {
      console.log('[Stockbit Screener] Navigated to watchlist, re-initializing...')
      // Clear processed rows to allow re-processing
      init()
    }

    // If navigated away from watchlist, teardown observer
    if (!isOnWatchlist && wasOnWatchlist) {
      teardownObserver()
    }
  }
}

/**
 * Setup URL change detection for SPA navigation
 */
function setupNavigationListener(): void {
  // Listen for popstate (back/forward button)
  window.addEventListener('popstate', handleNavigation)

  // Intercept pushState and replaceState for SPA navigation
  const originalPushState = history.pushState.bind(history)
  const originalReplaceState = history.replaceState.bind(history)

  history.pushState = function(...args) {
    originalPushState(...args)
    handleNavigation()
  }

  history.replaceState = function(...args) {
    originalReplaceState(...args)
    handleNavigation()
  }

  console.log('[Stockbit Screener] Navigation listener setup complete')
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setupNavigationListener()
    init()
  })
} else {
  setupNavigationListener()
  init()
}

export {}
