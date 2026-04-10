import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
  ],
  // Privy has optional Solana peer deps that aren't installed — treat them as external
  build: {
    rollupOptions: {
      external: [
        '@solana/kit',
        '@solana-program/system',
        '@solana-program/token',
        'permissionless',
        'permissionless/accounts',
        'permissionless/clients/pimlico',
      ],
    },
  },
})
