// pages/_app.js
import { useEffect } from 'react'
import '../styles/globals.css'

export default function App({ Component, pageProps }) {
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
  }, [])

  return <Component {...pageProps} />
}
