import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import './index.css'

/* Real addresses since the move to Cloudflare Pages (6 Oct 2026):
   1namo.com/shop/p/x, not 1namo.com/#/shop/p/x. Every link shared in the
   hash-router months — WhatsApp, reels, referral codes, notifications —
   still works: an address that arrives as #/something is rewritten to
   /something before the router reads it. */
if (window.location.hash.startsWith('#/')) {
  window.history.replaceState(null, '', window.location.hash.slice(1))
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
