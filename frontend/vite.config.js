import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiProxy = {
  "/api": {
    target: process.env.API_PROXY_TARGET || "http://localhost:6102",
    changeOrigin: true,
  },
};

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 6101,
    allowedHosts: ["ai-interview.myselfproject.org"],
    proxy: apiProxy,
  },
  preview: {
    host: "0.0.0.0",
    port: 6101,
    allowedHosts: ["ai-interview.myselfproject.org", "ai_interview.myselfproject.org"],
    proxy: apiProxy,
  },
});
