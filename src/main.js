import { createApp } from 'vue'
import App from './App.vue'
import './styles.css'
import { load } from './store'
load()
createApp(App).mount('#app')
