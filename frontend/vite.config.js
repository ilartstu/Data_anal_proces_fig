import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// During `npm run dev` the API is proxied to the backend container/service.
// In the production image nginx serves the build and proxies /api itself.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.VITE_API_TARGET || "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
