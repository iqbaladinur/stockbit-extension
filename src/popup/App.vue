<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'

type RulesetType = 'standard' | 'strict'

interface RulesetInfo {
  id: RulesetType
  name: string
  version: string
  description: string
}

const RULESETS: Record<RulesetType, RulesetInfo> = {
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

interface EvaluationResult {
  symbol: string
  entryReady: boolean
  score: number
  failedConditions: string[]
  passedConditions: string[]
  ruleset?: RulesetType
}

const isOnWatchlist = ref(false)
const results = ref<EvaluationResult[]>([])
const loading = ref(false)
const error = ref('')
const realtimeMode = ref(true)
const selectedRuleset = ref<RulesetType>('standard')

const passedStocks = computed(() => results.value.filter(r => r.entryReady))
const failedStocks = computed(() => results.value.filter(r => !r.entryReady))
const copySuccess = ref(false)

const llmFriendlyData = computed(() => {
  if (results.value.length === 0) return ''

  const ruleset = RULESETS[selectedRuleset.value]
  const passed = passedStocks.value
  const failed = failedStocks.value

  let output = `# Stock Screening Results - ${new Date().toLocaleDateString('id-ID')}
## Ruleset: ${ruleset.name} (${ruleset.version})
${ruleset.description}

---

## Summary
- Total Stocks Scanned: ${results.value.length}
- Entry Ready: ${passed.length}
- Not Ready: ${failed.length}

---

## Entry Ready Stocks (${passed.length})
${passed.length > 0 ? passed.map(s => `- **${s.symbol}** | Score: ${s.score}/6 | Passed: ${s.passedConditions.join(', ')}`).join('\n') : 'None'}

---

## Not Ready Stocks (${failed.length})
${failed.length > 0 ? failed.map(s => `- **${s.symbol}** | Score: ${s.score}/6 | Failed: ${s.failedConditions.join(', ')} | Passed: ${s.passedConditions.join(', ')}`).join('\n') : 'None'}

---

## Scoring Criteria (${ruleset.name}):
${selectedRuleset.value === 'standard' ? `- A1: Net Foreign Buy/Sell > 0
- A2: Net Foreign MA10 > 0
- A3: 1 Week Foreign Flow > 0
- B1: Bandar Accum/Dist > 0
- B2: Bandar Value > 0
- C: MA20 Foreign OR Bandar MA20 > 0
- D1: Net Foreign Streak >= 2` : `- A1: Net Foreign Buy/Sell > 0
- A2: Net Foreign MA10 > 0
- A3: 1 Week Foreign Flow > 0
- B1: Bandar Accum/Dist > 0
- B2: Bandar Value > 0
- B3: Bandar Value MA10 > 0
- C: Both MA20 >= 0 AND at least one > 0
- D1: Net Foreign Streak >= 3
- F1: Acceleration (Foreign > MA10)`}

---

## Prompt untuk Analisis:
Berdasarkan data screening di atas, tolong analisis dan berikan rekomendasi:

1. Dari saham yang "Entry Ready", mana yang memiliki score tertinggi dan kondisi paling ideal untuk entry?
2. Dari saham yang "Not Ready", adakah yang hampir memenuhi syarat (hanya gagal 1-2 kondisi minor) dan masih bisa dipertimbangkan untuk forced entry dengan risiko terukur?
3. Berikan ranking prioritas entry berdasarkan kekuatan akumulasi foreign dan bandar.
4. Identifikasi red flags atau warning signs dari data di atas.

Catatan: Foreign buy menunjukkan minat institusi asing, Bandar accumulation menunjukkan smart money lokal sedang mengumpulkan saham.
`

  return output
})

async function copyToClipboard() {
  try {
    await navigator.clipboard.writeText(llmFriendlyData.value)
    copySuccess.value = true
    setTimeout(() => {
      copySuccess.value = false
    }, 2000)
  } catch (e) {
    console.error('Failed to copy:', e)
  }
}

function askChatGPT() {
  const prompt = encodeURIComponent(llmFriendlyData.value)
  chrome.tabs.create({ url: `https://chat.openai.com/?q=${prompt}` })
}

function askClaude() {
  const prompt = encodeURIComponent(llmFriendlyData.value)
  chrome.tabs.create({ url: `https://claude.ai/new?q=${prompt}` })
}

async function checkPage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (tab?.url?.includes('stockbit.com/watchlist')) {
    isOnWatchlist.value = true
  }
}

async function loadSettings() {
  const { realtimeMode: saved, ruleset: savedRuleset } = await chrome.storage.sync.get(['realtimeMode', 'ruleset'])
  realtimeMode.value = saved !== undefined ? saved : true
  selectedRuleset.value = savedRuleset || 'standard'
}

async function changeRuleset(ruleset: RulesetType) {
  selectedRuleset.value = ruleset
  await chrome.storage.sync.set({ ruleset })

  // Notify content script about the change
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (tab?.id) {
    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: 'SET_RULESET',
        ruleset
      })
      // Clear results so user can re-scan with new ruleset
      results.value = []
    } catch (e) {
      console.error('Failed to notify content script:', e)
    }
  }
}

async function toggleRealtimeMode() {
  realtimeMode.value = !realtimeMode.value
  await chrome.storage.sync.set({ realtimeMode: realtimeMode.value })
  
  // Notify content script about the change
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (tab?.id) {
    try {
      await chrome.tabs.sendMessage(tab.id, { 
        type: 'SET_REALTIME_MODE', 
        enabled: realtimeMode.value 
      })
    } catch (e) {
      console.error('Failed to notify content script:', e)
    }
  }
}

async function scanTable() {
  loading.value = true
  error.value = ''
  
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    
    if (!tab?.id) {
      error.value = 'Cannot access current tab'
      return
    }
    
    // First trigger a scan
    await chrome.tabs.sendMessage(tab.id, { type: 'SCAN_TABLE' })
    
    // Then get results
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_RESULTS' })
    
    if (response.error) {
      error.value = response.error
    } else {
      results.value = response.results || []
    }
  } catch (e) {
    error.value = 'Failed to scan table. Make sure you are on stockbit.com/watchlist'
    console.error(e)
  } finally {
    loading.value = false
  }
}

function openWatchlist() {
  chrome.tabs.create({ url: 'https://stockbit.com/watchlist' })
}

onMounted(() => {
  checkPage()
  loadSettings()
})
</script>

<template>
  <div class="w-[380px] min-h-[300px] bg-gradient-to-br from-slate-900 to-slate-800 text-white p-5">
    <!-- Header -->
    <header class="mb-5">
      <div class="flex items-center gap-3 mb-2">
        <div class="w-10 h-10 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/25">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
        </div>
        <div>
          <h1 class="text-lg font-bold tracking-tight">Personal Screener</h1>
          <p class="text-xs text-slate-400">Stockbit Watchlist Analyzer</p>
        </div>
      </div>
    </header>

    <!-- Not on watchlist -->
    <div v-if="!isOnWatchlist" class="text-center py-6">
      <div class="text-4xl mb-4">📊</div>
      <p class="text-slate-300 mb-4">Open Stockbit Watchlist to start scanning</p>
      <button 
        @click="openWatchlist"
        class="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white font-semibold py-3 px-6 rounded-xl transition-all duration-200 shadow-lg shadow-emerald-500/25"
      >
        Open Watchlist
      </button>
    </div>

    <!-- On watchlist -->
    <div v-else>
      <!-- Ruleset Selector -->
      <div class="mb-4 bg-slate-800/50 p-3 rounded-xl border border-slate-700">
        <div class="flex items-center gap-2 mb-2">
          <div class="p-1.5 rounded-lg bg-blue-500/20 text-blue-400">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </div>
          <div class="text-sm">
            <div class="font-medium text-slate-200">Ruleset Mode</div>
            <div class="text-[10px] text-slate-400 leading-tight">Choose screening criteria strictness</div>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-2 mt-3">
          <button
            v-for="rs in Object.values(RULESETS)"
            :key="rs.id"
            @click="changeRuleset(rs.id)"
            class="relative p-2.5 rounded-lg border-2 transition-all duration-200 text-left"
            :class="selectedRuleset === rs.id
              ? 'border-blue-500 bg-blue-500/20'
              : 'border-slate-600 bg-slate-700/30 hover:border-slate-500'"
          >
            <div class="flex items-center justify-between mb-1">
              <span class="font-semibold text-sm" :class="selectedRuleset === rs.id ? 'text-blue-300' : 'text-slate-300'">
                {{ rs.name }}
              </span>
              <span class="text-[10px] px-1.5 py-0.5 rounded"
                :class="selectedRuleset === rs.id ? 'bg-blue-500/30 text-blue-300' : 'bg-slate-600 text-slate-400'">
                {{ rs.version }}
              </span>
            </div>
            <p class="text-[10px] text-slate-400 leading-tight">{{ rs.description }}</p>
            <div v-if="selectedRuleset === rs.id" class="absolute top-1.5 right-1.5 w-2 h-2 bg-blue-400 rounded-full"></div>
          </button>
        </div>
      </div>

      <!-- Realtime Toggle -->
      <div class="flex items-center justify-between mb-4 bg-slate-800/50 p-3 rounded-xl border border-slate-700">
        <div class="flex items-center gap-2">
          <div class="p-1.5 rounded-lg" :class="realtimeMode ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700/50 text-slate-400'">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div class="text-sm">
            <div class="font-medium text-slate-200">Realtime Mode</div>
            <div class="text-[10px] text-slate-400 leading-tight">Auto-scan when data changes</div>
          </div>
        </div>
        
        <button 
          @click="toggleRealtimeMode"
          class="relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
          :class="realtimeMode ? 'bg-emerald-500' : 'bg-slate-600'"
        >
          <span 
            class="absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform duration-200 shadow-sm"
            :class="realtimeMode ? 'translate-x-5' : 'translate-x-0'"
          ></span>
        </button>
      </div>

      <!-- Scan Button -->
      <button 
        @click="scanTable"
        :disabled="loading"
        class="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 disabled:opacity-50 text-white font-semibold py-3 px-4 rounded-xl transition-all duration-200 shadow-lg shadow-emerald-500/25 mb-4"
      >
        <span v-if="loading">🔄 Scanning...</span>
        <span v-else>🔍 Scan Watchlist Now</span>
      </button>

      <!-- Error -->
      <div v-if="error" class="bg-red-500/20 border border-red-500/50 rounded-lg p-3 mb-4 text-sm text-red-300">
        {{ error }}
      </div>

      <!-- Results Summary -->
      <div v-if="results.length > 0" class="space-y-3">
        <!-- AI Export Buttons -->
        <div class="bg-slate-800/50 p-3 rounded-xl border border-slate-700">
          <div class="flex items-center gap-2 mb-2">
            <div class="p-1.5 rounded-lg bg-purple-500/20 text-purple-400">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <div class="text-sm">
              <div class="font-medium text-slate-200">AI Analysis</div>
              <div class="text-[10px] text-slate-400 leading-tight">Export data untuk analisis AI</div>
            </div>
          </div>

          <div class="grid grid-cols-3 gap-2 mt-3">
            <!-- Copy Button -->
            <button
              @click="copyToClipboard"
              class="flex flex-col items-center justify-center gap-1.5 py-2.5 px-2 rounded-lg border-2 transition-all duration-200"
              :class="copySuccess
                ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                : 'bg-slate-700/30 border-slate-600 text-slate-300 hover:border-slate-500 hover:bg-slate-700/50'"
            >
              <svg v-if="!copySuccess" xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <svg v-else xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
              <span class="text-[10px] font-medium">{{ copySuccess ? 'Copied!' : 'Copy' }}</span>
            </button>

            <!-- ChatGPT Button -->
            <button
              @click="askChatGPT"
              class="flex flex-col items-center justify-center gap-1.5 py-2.5 px-2 rounded-lg border-2 transition-all duration-200 bg-green-500/10 border-green-500/50 text-green-300 hover:bg-green-500/20 hover:border-green-500"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.8956zm16.5963 3.8558L13.1038 8.364l2.0201-1.1685a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.4046-.6813zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z"/>
              </svg>
              <span class="text-[10px] font-medium">ChatGPT</span>
            </button>

            <!-- Claude Button -->
            <button
              @click="askClaude"
              class="flex flex-col items-center justify-center gap-1.5 py-2.5 px-2 rounded-lg border-2 transition-all duration-200 bg-orange-500/10 border-orange-500/50 text-orange-300 hover:bg-orange-500/20 hover:border-orange-500"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M4.709 15.955l4.72-2.647.08-.23-.08-.144-4.72-2.647-.209.126v5.416l.209.126zm7.291-2.877l4.72 2.647.209-.126V10.183l-.209-.126-4.72 2.647-.08.144.08.23zm-2.564-1.227l4.72-2.647.08-.23-.08-.144-4.72-2.647-.209.126v5.416l.209.126zm0 7.508l4.72-2.647.08-.23-.08-.144-4.72-2.647-.209.126v5.416l.209.126zM12 2L2.5 7.5v9L12 22l9.5-5.5v-9L12 2z"/>
              </svg>
              <span class="text-[10px] font-medium">Claude</span>
            </button>
          </div>
        </div>

        <!-- Stats -->
        <div class="grid grid-cols-2 gap-3">
          <div class="bg-emerald-500/20 border border-emerald-500/30 rounded-xl p-3 text-center">
            <div class="text-2xl font-bold text-emerald-400">{{ passedStocks.length }}</div>
            <div class="text-xs text-emerald-300">Entry Ready</div>
          </div>
          <div class="bg-red-500/20 border border-red-500/30 rounded-xl p-3 text-center">
            <div class="text-2xl font-bold text-red-400">{{ failedStocks.length }}</div>
            <div class="text-xs text-red-300">Not Ready</div>
          </div>
        </div>

        <!-- Entry Ready List -->
        <div v-if="passedStocks.length > 0" class="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-4">
          <h3 class="text-sm font-bold text-emerald-400 mb-2 flex items-center gap-2">
            <span class="w-2 h-2 bg-emerald-400 rounded-full"></span>
            Entry Ready Stocks
          </h3>
          <div class="space-y-1 max-h-[120px] overflow-y-auto">
            <div 
              v-for="stock in passedStocks" 
              :key="stock.symbol"
              class="flex items-center justify-between text-sm py-1"
            >
              <span class="font-semibold">{{ stock.symbol }}</span>
              <span class="bg-emerald-500/30 text-emerald-300 px-2 py-0.5 rounded text-xs">
                Score: {{ stock.score }}
              </span>
            </div>
          </div>
        </div>

        <!-- Not Ready List (collapsed) -->
        <details v-if="failedStocks.length > 0" class="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl">
          <summary class="p-4 cursor-pointer text-sm font-bold text-red-400 flex items-center gap-2">
            <span class="w-2 h-2 bg-red-400 rounded-full"></span>
            Not Ready ({{ failedStocks.length }})
          </summary>
          <div class="px-4 pb-4 space-y-1 max-h-[120px] overflow-y-auto">
            <div 
              v-for="stock in failedStocks" 
              :key="stock.symbol"
              class="flex items-center justify-between text-sm py-1"
            >
              <span class="font-semibold text-slate-400">{{ stock.symbol }}</span>
              <span class="text-xs text-red-400">
                {{ stock.failedConditions.length }} failures
              </span>
            </div>
          </div>
        </details>
      </div>

      <!-- Instructions -->
      <div v-else class="text-center text-slate-400 text-sm py-4">
        <p>Click "Scan Watchlist" to analyze your stocks</p>
        <p class="mt-2 text-xs text-slate-500">
          ✅ Green = Entry Ready<br>
          ❌ Red = Not Ready
        </p>
      </div>

      <!-- Legend / Help -->
      <details class="mt-4 bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl">
        <summary class="p-3 cursor-pointer text-sm font-bold text-slate-300 flex items-center gap-2">
          <span>📖</span> Panduan Indikator & Score ({{ RULESETS[selectedRuleset].name }})
        </summary>
        <div class="px-3 pb-3 text-xs space-y-3">
          <!-- Entry Conditions - Standard -->
          <div v-if="selectedRuleset === 'standard'" class="border-b border-slate-700/50 pb-3">
            <h4 class="font-bold text-emerald-400 mb-2">✅ Entry Ready jika SEMUA terpenuhi:</h4>
            <div class="space-y-1 text-slate-400">
              <div><span class="text-amber-400 font-mono">A1</span> Net Foreign Buy/Sell &gt; 0</div>
              <div><span class="text-amber-400 font-mono">A2</span> Net Foreign MA10 &gt; 0</div>
              <div><span class="text-amber-400 font-mono">A3</span> 1 Week Foreign Flow &gt; 0</div>
              <div><span class="text-amber-400 font-mono">B1</span> Bandar Accum/Dist &gt; 0</div>
              <div><span class="text-amber-400 font-mono">B2</span> Bandar Value &gt; 0</div>
              <div><span class="text-amber-400 font-mono">C</span> MA20 Foreign ATAU Bandar MA20 &gt; 0</div>
              <div><span class="text-amber-400 font-mono">D1</span> Net Foreign Streak ≥ 2</div>
            </div>
          </div>

          <!-- Entry Conditions - Strict -->
          <div v-else class="border-b border-slate-700/50 pb-3">
            <h4 class="font-bold text-emerald-400 mb-2">✅ Entry Ready jika SEMUA terpenuhi:</h4>
            <div class="space-y-1 text-slate-400">
              <div><span class="text-amber-400 font-mono">A1</span> Net Foreign Buy/Sell &gt; 0</div>
              <div><span class="text-amber-400 font-mono">A2</span> Net Foreign MA10 &gt; 0</div>
              <div><span class="text-amber-400 font-mono">A3</span> 1 Week Foreign Flow &gt; 0</div>
              <div><span class="text-amber-400 font-mono">B1</span> Bandar Accum/Dist &gt; 0</div>
              <div><span class="text-amber-400 font-mono">B2</span> Bandar Value &gt; 0</div>
              <div><span class="text-amber-400 font-mono">B3</span> Bandar Value MA10 &gt; 0 <span class="text-blue-400">(NEW)</span></div>
              <div><span class="text-amber-400 font-mono">C</span> Both MA20 ≥ 0 DAN salah satu &gt; 0 <span class="text-blue-400">(STRICT)</span></div>
              <div><span class="text-amber-400 font-mono">D1</span> Net Foreign Streak ≥ 3 <span class="text-blue-400">(HIGHER)</span></div>
              <div><span class="text-amber-400 font-mono">F1</span> Acceleration: Foreign &gt; MA10 <span class="text-blue-400">(NEW)</span></div>
            </div>
          </div>

          <!-- Hard Reject -->
          <div class="border-b border-slate-700/50 pb-3">
            <h4 class="font-bold text-red-400 mb-2">🚫 Hard Reject jika:</h4>
            <div class="space-y-1 text-slate-400">
              <div><span class="text-red-400 font-mono">E1</span> Kolom <span class="text-slate-300 bg-slate-700/50 px-1 rounded">Bandar Accum/Dist</span> &lt; 0</div>
              <div><span class="text-red-400 font-mono">E2</span> Kolom <span class="text-slate-300 bg-slate-700/50 px-1 rounded">Net Foreign Buy/Sell</span> &lt; 0 dan Streak = 0</div>
            </div>
          </div>

          <!-- Score System - Standard -->
          <div v-if="selectedRuleset === 'standard'" class="border-b border-slate-700/50 pb-3">
            <h4 class="font-bold text-blue-400 mb-2">🏆 Scoring System (0-6):</h4>
            <div class="space-y-1 text-slate-400">
              <div><span class="text-blue-400">+2</span> Bandar Value MA20 &gt; 0</div>
              <div><span class="text-blue-400">+2</span> Net Foreign MA20 &gt; 0</div>
              <div><span class="text-blue-400">+1</span> Net Foreign Streak ≥ 3</div>
              <div><span class="text-blue-400">+1</span> Bandar Value MA10 &gt; 0</div>
            </div>
          </div>

          <!-- Score System - Strict -->
          <div v-else class="border-b border-slate-700/50 pb-3">
            <h4 class="font-bold text-blue-400 mb-2">🏆 Scoring System (0-9):</h4>
            <div class="space-y-1 text-slate-400">
              <div class="text-slate-500 text-[10px] mb-1">Tier 1 (+2 each):</div>
              <div><span class="text-blue-400">+2</span> Bandar Value MA20 &gt; 0</div>
              <div><span class="text-blue-400">+2</span> Net Foreign MA20 &gt; 0</div>
              <div><span class="text-blue-400">+2</span> Acceleration (F1 pass)</div>
              <div class="text-slate-500 text-[10px] mt-2 mb-1">Tier 2 (+1 each):</div>
              <div><span class="text-blue-400">+1</span> Net Foreign Streak ≥ 5</div>
              <div><span class="text-blue-400">+1</span> Bandar Value MA10 &gt; 0</div>
              <div><span class="text-blue-400">+1</span> 1W Flow &gt; 1M Flow</div>
            </div>
          </div>

          <!-- Key Values -->
          <div>
            <h4 class="font-bold text-purple-400 mb-2">📊 Key Values:</h4>
            <div class="space-y-1 text-slate-400">
              <div><span class="text-purple-400">Foreign</span> = Net Foreign Buy/Sell hari ini</div>
              <div><span class="text-purple-400">Streak</span> = Berapa hari berturut-turut foreign buy</div>
              <div><span class="text-purple-400">B.A/D</span> = Bandar Accumulation/Distribution</div>
            </div>
          </div>

          <!-- Philosophy -->
          <div class="mt-3 p-2 bg-slate-700/30 rounded-lg text-slate-500 italic">
            💡 "Foreign confirms direction. Bandar builds structure. Flow leads price."
          </div>
        </div>
      </details>
    </div>

    <!-- Footer -->
    <footer class="mt-5 pt-4 border-t border-slate-700/50">
      <p class="text-xs text-slate-500 text-center">
        Using Ruleset {{ RULESETS[selectedRuleset].version }} ({{ RULESETS[selectedRuleset].name }}) — Foreign + Bandar Accumulation
      </p>
    </footer>
  </div>
</template>

<style scoped>
details summary::-webkit-details-marker {
  display: none;
}
details summary::marker {
  display: none;
}
details[open] summary {
  border-bottom: 1px solid rgba(71, 85, 105, 0.3);
  margin-bottom: 0.5rem;
}
</style>
