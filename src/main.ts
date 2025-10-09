import { Buffer } from 'buffer'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'

// Make Buffer available globally for browser compatibility
if (typeof window !== 'undefined') {
  ;(window as any).Buffer = Buffer
}

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.mount('#app')
