import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: "autoUpdate",
        injectRegister: "auto",
        includeAssets: ["favicon.ico", "apple-touch-icon.png", "mask-icon.svg"],
        manifest: {
          name: "SafeAid Emergency Assistant",
          short_name: "SafeAid",
          description: "AI-powered emergency and health assistant with offline support.",
          theme_color: "#000000",
          background_color: "#000000",
          display: "standalone",
          start_url: "/",
          orientation: "portrait",
          icons: [
            {
              src: "https://png.pngtree.com/png-vector/20190417/ourmid/pngtree-vector-shield-icon-png-image_947000.jpg",
              sizes: "192x192",
              type: "image/jpg",
              purpose: "any maskable",
            },
            {
              src: "https://png.pngtree.com/png-vector/20190417/ourmid/pngtree-vector-shield-icon-png-image_947000.jpg",
              sizes: "512x512",
              type: "image/jpg",
              purpose: "any maskable",
            },
          ],
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,ico,png,svg}"],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: "CacheFirst",
              options: {
                cacheName: "google-fonts-cache",
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365, // 365 days
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
      }),
    ],
    define: {
      "process.env.GEMINI_API_KEY": JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "."),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== "true",
    },
  };
});
