import { createApp } from 'vue'
import App from './App.vue'
import './styles.css'
import { load } from './store'
import { initErrorHandlers } from './utils/errorLog'
import { installCompatPolyfills } from './utils/compat'
installCompatPolyfills()
load()
const app = createApp(App)
initErrorHandlers(app)
app.mount('#app')
