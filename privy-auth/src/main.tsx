import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PrivyProvider } from '@privy-io/react-auth'
import './index.css'
import App from './App.tsx'
import { TelegramAutoLogin } from './components/TelegramAutoLogin.tsx'

// Expand Telegram Mini App to full height immediately
if (window.Telegram?.WebApp) {
  window.Telegram.WebApp.ready()
  window.Telegram.WebApp.expand()
  window.Telegram.WebApp.setHeaderColor('#0f0f1a')
  window.Telegram.WebApp.setBackgroundColor('#0f0f1a')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PrivyProvider
      appId={import.meta.env.VITE_PRIVY_APP_ID ?? 'clxxxxxxxxxxxxxxxxxxxxx'}
      config={{
        loginMethods: ['google', 'telegram'],
        appearance: {
          theme: 'dark',
          accentColor: '#7c3aed',
          logo: undefined,
        },
        embeddedWallets: {
          ethereum: {
            createOnLogin: 'users-without-wallets',
          },
        },
      }}
    >
      <TelegramAutoLogin />
      <App />
    </PrivyProvider>
  </StrictMode>,
)
