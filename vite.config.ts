import path from "node:path";
import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";

function injectBackendUrl(): Plugin {
  return {
    name: "inject-backend-url",
    transformIndexHtml(html) {
      const backendUrl = process.env.VITE_BACKEND_URL;
      if (!backendUrl) {
        throw new Error(
          "VITE_BACKEND_URL is not set. Add it to your .env file (see .env.template).",
        );
      }
      return html.replaceAll("__BACKEND_URL__", backendUrl);
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), injectBackendUrl()],
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
        target: `http://127.0.0.1:${process.env.PORT || "8080"}`,
        changeOrigin: true,
      },
      "/api/v1/stream": {
        target: `http://127.0.0.1:${process.env.PORT || "8080"}`,
        changeOrigin: true,
      },
      "/auth/refresh": {
        target: `http://127.0.0.1:${process.env.PORT || "8080"}`,
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
