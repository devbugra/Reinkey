/**
 * `next` komutunu .env.local yüklenmiş olarak çalıştırır.
 *
 * Next.js portu yalnızca ortamdaki PORT'tan okur; .env.local'ı ise port
 * seçildikten sonra yükler. Bu yüzden port .env.local'da tutulacaksa dosya
 * önceden yüklenmeli. Ortamda zaten tanımlı olan değer dosyadakini ezer
 * (örn. `PORT=4000 npm run dev`).
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const nextBin = createRequire(import.meta.url).resolve("next/dist/bin/next");
const child = spawn(process.execPath, [nextBin, ...process.argv.slice(2)], {
  stdio: "inherit",
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
