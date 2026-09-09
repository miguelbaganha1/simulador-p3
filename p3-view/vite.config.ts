import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            "p3-core": fileURLToPath(new URL("../p3-core/src/index.ts", import.meta.url)),
            "p3-system": fileURLToPath(new URL("../p3-system/src/index.ts", import.meta.url)),
        },
    },
});
