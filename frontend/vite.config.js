import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

function parseAllowedHosts(frontendUrl) {
  return frontendUrl
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      try {
        return new URL(entry).hostname;
      } catch {
        return entry;
      }
    })
    .filter((host) => host && host !== "localhost" && host !== "127.0.0.1");
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const port = Number(process.env.PORT || env.PORT || 6101);
  const apiProxyTarget =
    process.env.API_PROXY_TARGET || env.API_PROXY_TARGET || "http://localhost:6102";
  const frontendUrl =
    process.env.FRONTEND_URL ||
    env.FRONTEND_URL ||
    "http://localhost:6101";
  const allowedHosts = parseAllowedHosts(frontendUrl);

  const apiProxy = {
    "/api": {
      target: apiProxyTarget,
      changeOrigin: true,
    },
  };

  const sharedServer = {
    host: "0.0.0.0",
    port,
    allowedHosts,
    proxy: apiProxy,
  };

  return {
    plugins: [react()],
    server: sharedServer,
    preview: sharedServer,
  };
});
