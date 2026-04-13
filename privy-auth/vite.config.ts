import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    nodePolyfills({ include: ['buffer'] }),
    tailwindcss(),
    react(),
  ],
  // Privy has optional Solana peer deps that aren't installed — treat them as external
  // Note: permissionless must be bundled (not external) for browser ERC-4337 smart wallet support
  build: {
    rollupOptions: {
      external: [
        '@solana/kit',
        '@solana-program/system',
        '@solana-program/token',
      ],
    },
  },
})
