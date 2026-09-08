import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import { sentryTanstackStart } from '@sentry/tanstackstart-react/vite'

const sentryOrg = process.env.SENTRY_ORG
const sentryProject = process.env.SENTRY_PROJECT
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN

export default defineConfig({
  server: {
    port: 3000,
    watch: {
      ignored: ['**/convex/_generated/**'],
    },
  },
  plugins: [
    tailwindcss(),
    tanstackStart(),
    nitro(),
    viteReact(),
    ...(!!sentryOrg && !!sentryProject && !!sentryAuthToken
      ? [
          sentryTanstackStart({
            org: sentryOrg,
            project: sentryProject,
            authToken: sentryAuthToken,
          }),
        ]
      : []),
  ],
  resolve: {
    tsconfigPaths: true,
  },
})
