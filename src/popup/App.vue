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
