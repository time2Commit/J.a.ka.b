import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@jakab/db", "@jakab/shared"],
  serverExternalPackages: ["pg"],
};

export default createNextIntlPlugin("./src/i18n/request.ts")(nextConfig);
