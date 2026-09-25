import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/multi-timers/',
  build: {
    target: ['es2022', 'safari16.4'],
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'calendar', test: /node_modules\/(?:@js-temporal|jsbi)\// },
            {
              name: 'react',
              test: /node_modules\/(?:react|react-dom|scheduler)\//,
            },
          ],
        },
      },
    },
  },
})
