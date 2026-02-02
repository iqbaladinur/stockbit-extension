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

// Track processed rows to avoid duplicate processing
const processedRows = new WeakSet<HTMLTableRowElement>()

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
          <span style="
            display: inline-flex;
            align-items: center;
            gap: 4px;
            font-weight: 700;
            color: ${bgColor};
          ">
            ${result.entryReady ? '✅' : '❌'} 
            ${result.entryReady ? 'ENTRY READY' : 'NOT READY'}
          </span>
          <span style="
            background: ${bgColor};
            color: white;
            padding: 2px 8px;
            border-radius: 10px;
            font-weight: 700;
            font-size: 10px;
          ">Score: ${result.score}</span>
        </div>
        
        <!-- Conditions -->
        <div style="display: flex; flex-wrap: wrap; gap: 3px; margin-top: 2px;">
          ${result.passedConditions.map(c => `
            <span style="
              background: #10B98120;
              color: #059669;
              padding: 2px 6px;
              border-radius: 4px;
              font-size: 9px;
              font-weight: 500;
            ">✓ ${c.split(':')[0]}</span>
          `).join('')}
          ${result.failedConditions.map(c => `
            <span style="
              background: #EF444420;
              color: #DC2626;
              padding: 2px 6px;
              border-radius: 4px;
              font-size: 9px;
              font-weight: 500;
            ">✗ ${c.split(':')[0]}</span>
          `).join('')}
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
          <div>
            <span style="color: #999;">Foreign:</span>
            <span style="color: ${(result.data.netForeignBuySell ?? 0) > 0 ? '#10B981' : '#EF4444'}; font-weight: 600;">
              ${formatValue(result.data.netForeignBuySell)}
            </span>
          </div>
          <div>
            <span style="color: #999;">Streak:</span>
            <span style="color: ${(result.data.netForeignBuyStreak ?? 0) >= 2 ? '#10B981' : '#EF4444'}; font-weight: 600;">
              ${result.data.netForeignBuyStreak ?? '-'}
            </span>
          </div>
          <div>
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
 * Process all rows in the table
 */
function processTable(forceReprocess = false): void {
  const table = findWatchlistTable()

  if (!table) {
    console.log('[Stockbit Screener] No watchlist table found')
    return
  }

  console.log(`[Stockbit Screener] Found watchlist table, processing with ${currentRuleset} ruleset...`)

  const headers = extractColumnHeaders(table)
  console.log('[Stockbit Screener] Headers:', headers)

  const rows = table.querySelectorAll('tbody tr')
  let passCount = 0
  let failCount = 0

  rows.forEach((row) => {
    const tr = row as HTMLTableRowElement

    // Skip if already processed (unless force reprocess)
    if (!forceReprocess && processedRows.has(tr)) return

    const data = parseRow(tr, headers)

    if (!data.symbol) return

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
    processedRows.add(tr)

    if (result.entryReady) passCount++
    else failCount++
  })

  console.log(`[Stockbit Screener] Processed ${passCount + failCount} stocks: ${passCount} passed, ${failCount} failed (${currentRuleset})`)
}

// Global observer instance
let observer: MutationObserver | null = null

/**
 * Setup mutation observer to handle dynamic content
 */
function setupObserver(): void {
  if (observer) return // Already set up

  observer = new MutationObserver((mutations) => {
    let shouldProcess = false
    
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement) {
            // Check if table or row was added
            if (node.tagName === 'TABLE' || node.tagName === 'TR' || 
                node.querySelector('table') || node.querySelector('tr')) {
              shouldProcess = true
            }
          }
        })
      }
    })
    
    if (shouldProcess) {
      // Debounce processing
      setTimeout(processTable, 100)
    }
  })
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
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

  // Wait for table to load
  const checkTable = setInterval(() => {
    const table = findWatchlistTable()
    if (table) {
      clearInterval(checkTable)
      processTable()

      if (isRealtime) {
        setupObserver()
      }
    }
  }, 500)

  // Stop checking after 30 seconds
  setTimeout(() => {
    clearInterval(checkTable)
  }, 30000)
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  console.log('[Stockbit Screener] Message received:', message)

  if (message.type === 'SCAN_TABLE') {
    processTable()
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
