// Background service worker for Chrome Extension

console.log('[Background] Service worker started')

// Listen for extension install event
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[Background] Extension installed:', details.reason)
  
  if (details.reason === 'install') {
    console.log('[Background] First time installation - Welcome!')
  } else if (details.reason === 'update') {
    console.log('[Background] Extension updated to version:', chrome.runtime.getManifest().version)
  }
})

// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Background] Message received:', message)
  console.log('[Background] Sender:', sender)
  
  // Handle different message types
  if (message.type === 'GET_TAB_INFO') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      sendResponse({ tab: tabs[0] })
    })
    return true // Keep the message channel open for async response
  }
  
  sendResponse({ received: true })
})

export {}
