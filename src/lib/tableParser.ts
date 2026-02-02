// Table parser for Stockbit watchlist
// Extracts data from ant-table structure

import { StockData, normalizeValue } from './ruleset'

// Column name mappings (from header text to StockData field)
const COLUMN_MAPPINGS: Record<string, keyof StockData> = {
  'symbol': 'symbol',
  'price': 'price',
  'net foreign buy / sell': 'netForeignBuySell',
  'net foreign buy / sell ma10': 'netForeignBuySellMA10',
  'net foreign buy / sell ma20': 'netForeignBuySellMA20',
  '1 week net foreign flow': 'oneWeekNetForeignFlow',
  '1 month net foreign flow': 'oneMonthNetForeignFlow',
  'net foreign buy streak': 'netForeignBuyStreak',
  'bandar accum/dist': 'bandarAccumDist',
  'bandar value': 'bandarValue',
  'bandar value ma 10': 'bandarValueMA10',
  'bandar value ma10': 'bandarValueMA10',
  'bandar value ma 20': 'bandarValueMA20',
  'bandar value ma20': 'bandarValueMA20',
}

/**
 * Extract column headers from table
 */
export function extractColumnHeaders(table: HTMLTableElement): string[] {
  const headers: string[] = []
  const headerRow = table.querySelector('thead tr')
  
  if (!headerRow) return headers
  
  const ths = headerRow.querySelectorAll('th')
  ths.forEach((th) => {
    // Get text from the <p> element inside
    const pElement = th.querySelector('p')
    const text = pElement?.textContent?.trim().toLowerCase() || ''
    headers.push(text)
  })
  
  return headers
}

/**
 * Map header name to field name
 */
function mapHeaderToField(header: string): keyof StockData | null {
  const normalized = header.toLowerCase().trim()
  return COLUMN_MAPPINGS[normalized] || null
}

/**
 * Extract symbol from the first cell
 */
function extractSymbol(cell: HTMLTableCellElement): string {
  // Symbol is in a <p> with weight="700" and family="bold"
  const symbolElement = cell.querySelector('p[family="bold"][weight="700"]')
  return symbolElement?.textContent?.trim() || ''
}

/**
 * Extract price from cell  
 */
function extractPrice(cell: HTMLTableCellElement): number | null {
  const priceElement = cell.querySelector('p[family="bold"]')
  const text = priceElement?.textContent?.trim() || ''
  return normalizeValue(text)
}

/**
 * Parse single row into StockData
 */
export function parseRow(row: HTMLTableRowElement, headers: string[]): StockData {
  const cells = row.querySelectorAll('td')
  
  const data: StockData = {
    symbol: '',
    price: null,
    netForeignBuySell: null,
    netForeignBuySellMA10: null,
    netForeignBuySellMA20: null,
    oneWeekNetForeignFlow: null,
    oneMonthNetForeignFlow: null,
    netForeignBuyStreak: null,
    bandarAccumDist: null,
    bandarValue: null,
    bandarValueMA10: null,
    bandarValueMA20: null,
  }
  
  cells.forEach((cell, index) => {
    const header = headers[index]
    
    if (!header) return
    
    // Special handling for Symbol (first column)
    if (header === 'symbol') {
      data.symbol = extractSymbol(cell as HTMLTableCellElement)
      return
    }
    
    // Special handling for Price
    if (header === 'price') {
      data.price = extractPrice(cell as HTMLTableCellElement)
      return
    }
    
    // Map other headers to fields
    const field = mapHeaderToField(header)
    if (field && field !== 'symbol' && field !== 'price') {
      const value = normalizeValue(cell.textContent || '')
      ;(data as unknown as Record<string, number | string | null>)[field] = value
    }
  })
  
  return data
}

/**
 * Parse all rows from table
 */
export function parseTable(table: HTMLTableElement): StockData[] {
  const headers = extractColumnHeaders(table)
  const rows = table.querySelectorAll('tbody tr')
  const results: StockData[] = []
  
  rows.forEach((row) => {
    const data = parseRow(row as HTMLTableRowElement, headers)
    if (data.symbol) {
      results.push(data)
    }
  })
  
  return results
}

/**
 * Find the watchlist table on the page
 */
export function findWatchlistTable(): HTMLTableElement | null {
  // Look for ant-table structure
  const tables = document.querySelectorAll('table')
  
  for (const table of tables) {
    // Check if it has ant-table-thead class
    const thead = table.querySelector('.ant-table-thead')
    if (thead) {
      return table
    }
  }
  
  return null
}
