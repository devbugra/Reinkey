import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Depo kökü dışındaki package-lock.json'un yanlışlıkla seçilmesini engeller.
  turbopack: { root: path.resolve(import.meta.dirname) },
  poweredByHeader: false,
};

export default nextConfig;
