import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // In production (GitHub Pages) the site lives at /InsightsDemo/
  // In dev the Vite dev-server serves from /
  base: mode === "production" ? "/InsightsDemo/" : "/",
  build: {
    outDir: "dist",
    rollupOptions: {
      output: {
        // Code-split chart.js for better Lighthouse score
        manualChunks: {
          "chart-vendor": ["chart.js", "react-chartjs-2"],
          "react-vendor": ["react", "react-dom"],
        },
      },
    },
  },
}));
