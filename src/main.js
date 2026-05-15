import { createApp } from 'vue'
import './styles/main.css'
import App from './App.vue'

createApp(App).mount('#app')

// PWA service worker registration
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
