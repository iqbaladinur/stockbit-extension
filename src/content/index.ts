// Content script - injected into web pages

console.log('[Content Script] Loaded on:', window.location.href)

// Example: Listen for messages from background or popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  console.log('[Content Script] Message received:', message)
  
  if (message.type === 'GET_PAGE_DATA') {
    const pageData = {
      title: document.title,
      url: window.location.href,
      timestamp: new Date().toISOString()
    }
    sendResponse(pageData)
  }
  
  return true
})

// Example function to send message to background
function sendToBackground(message: unknown) {
  chrome.runtime.sendMessage(message, (response) => {
    console.log('[Content Script] Response from background:', response)
  })
}

// Add type for global scope
export { sendToBackground }
