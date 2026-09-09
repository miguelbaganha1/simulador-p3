import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
    resolve: {
        alias: {
            "p3-core": fileURLToPath(new URL("./p3-core/src/index.ts", import.meta.url)),
            "p3-system": fileURLToPath(new URL("./p3-system/src/index.ts", import.meta.url)),
        },
    },
    test: {
        environment: "node",
        include: ["tests/**/*.test.ts"],
    },
});
