import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  platform: "node",
  target: "node18",
  clean: true,
  minify: false,
  sourcemap: true,
  dts: false,
  splitting: false,
  treeshake: true,
  outDir: "dist",
  outExtension() {
    return {
      js: ".js",
    };
  },
});
