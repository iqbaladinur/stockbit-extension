<script setup lang="ts">
import { ref } from 'vue'

const count = ref(0)
const appName = 'Stockbit Personal Screener'

const increment = () => {
  count.value++
}
</script>

<template>
  <div class="w-[350px] min-h-[200px] bg-gradient-to-br from-slate-900 to-slate-800 text-white p-6">
    <!-- Header -->
    <header class="mb-6">
      <div class="flex items-center gap-3 mb-2">
        <div class="w-10 h-10 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/25">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
        </div>
        <div>
          <h1 class="text-lg font-bold tracking-tight">{{ appName }}</h1>
          <p class="text-xs text-slate-400">Your personal stock analyzer</p>
        </div>
      </div>
    </header>

    <!-- Main Content -->
    <main class="space-y-4">
      <!-- Status Card -->
      <div class="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-2xl p-4">
        <div class="flex items-center justify-between mb-3">
          <span class="text-sm text-slate-400">Extension Status</span>
          <span class="flex items-center gap-1.5 text-xs text-emerald-400">
            <span class="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></span>
            Active
          </span>
        </div>
        <p class="text-2xl font-bold text-white">Ready to Scan</p>
      </div>

      <!-- Counter Demo -->
      <div class="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-2xl p-4">
        <p class="text-sm text-slate-400 mb-3">Demo Counter</p>
        <div class="flex items-center gap-4">
          <button 
            @click="increment"
            class="flex-1 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white font-semibold py-3 px-4 rounded-xl transition-all duration-200 shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 hover:scale-[1.02] active:scale-[0.98]"
          >
            Click Me
          </button>
          <div class="text-3xl font-bold text-emerald-400 min-w-[60px] text-center">
            {{ count }}
          </div>
        </div>
      </div>
    </main>

    <!-- Footer -->
    <footer class="mt-6 pt-4 border-t border-slate-700/50">
      <p class="text-xs text-slate-500 text-center">
        Built with Vue 3 + Tailwind CSS
      </p>
    </footer>
  </div>
</template>

<style scoped>
/* Custom animations if needed */
</style>
