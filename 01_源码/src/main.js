import { createApp } from 'vue'
import App from './App.vue'
import './styles.css'
import { load } from './store'
import { initErrorHandlers } from './utils/errorLog'
load()
const app = createApp(App)
initErrorHandlers(app)
app.mount('#app')
