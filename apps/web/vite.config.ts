import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";

const rootNodeModules = (path: string) =>
  fileURLToPath(new URL(`../../node_modules/${path}`, import.meta.url));

export default defineConfig({
  define: {
    global: "globalThis"
  },
  plugins: [react()],
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: [
      { find: /^buffer$/, replacement: rootNodeModules("buffer/index.js") },
      { find: /^events$/, replacement: rootNodeModules("events/events.js") },
      { find: /^process$/, replacement: rootNodeModules("process/browser.js") },
      { find: /^react$/, replacement: rootNodeModules("react/index.js") },
      { find: /^react-dom$/, replacement: rootNodeModules("react-dom/index.js") },
      { find: /^react-dom\/client$/, replacement: rootNodeModules("react-dom/client.js") },
      { find: /^snarkjs$/, replacement: rootNodeModules("snarkjs/build/browser.esm.js") },
      { find: /^util$/, replacement: rootNodeModules("util/util.js") }
    ]
  },
  worker: {
    format: "es"
  }
});
