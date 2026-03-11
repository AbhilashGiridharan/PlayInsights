import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // When deployed to GitHub Pages under a sub-path, set the base here:
  // base: "/playwright-results-dashboard/",
  base: "./",
  build: {
    outDir: "dist",
    rollupOptions: {
      output: {
        // Code-split chart.js for better Lighthouse score
        manualChunks: {
          "chart-vendor": ["chart.js", "react-chartjs-2"],
        },
      },
    },
  },
});
