/** @type {import("next").NextConfig} */

const isCapacitorBuild = process.env.CAPACITOR_BUILD === "true";

const nextConfig = {
  reactStrictMode: true,
  ...(isCapacitorBuild ? { output: "export" } : {}),

  typescript: {
    ignoreBuildErrors: true,
  },

  images: {
    unoptimized: isCapacitorBuild,
    remotePatterns: [
      { protocol: "https", hostname: "firebasestorage.googleapis.com" },
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "i.ibb.co" },
      { protocol: "https", hostname: "i.imgur.com" },
    ],
  },
};

module.exports = nextConfig;
