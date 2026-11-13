import { defineConfig } from "vite";

export default defineConfig({
  root: "src",
  publicDir: "../public",
  appType: "mpa",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rolldownOptions: {
      input: [
        "src/index.html",
        "src/computer/index.html",
        "src/tv/index.html",
        "src/room/index.html",
      ],
    },
  },
});
