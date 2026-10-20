import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './src/App.vue'
import { router } from './src/router'
import './src/styles/tokens.css'
import './src/styles/base.css'

createApp(App).use(createPinia()).use(router).mount('#app')
