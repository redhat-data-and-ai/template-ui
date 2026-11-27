import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";

// https://vitejs.dev/config/
const proxyTarget = `http://127.0.0.1:${process.env.PORT || 8080}`;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    lib: {
      entry: path.resolve(__dirname, "src/frontend/main.tsx"),
      name: "template-ui",
      fileName: (format) => `main.${format}.js`,
    },
    rollupOptions: {
      external: [],
      output: {
        globals: {},
        format: "umd",
        dir: path.resolve(__dirname, "dist/frontend"),
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src/frontend"),
    },
  },
  server: {
    proxy: {
      "/api": {
        target: proxyTarget,
        changeOrigin: true,
      },
      "/auth": {
        target: proxyTarget,
        changeOrigin: true,
      },
      "/login": {
        target: proxyTarget,
        changeOrigin: true,
      },
    },
  },
  define: {
    "process.env": {
      ENVIRONMENT: process.env.ENVIRONMENT,
    }, // Polyfill process.env with an empty object
  },
});
