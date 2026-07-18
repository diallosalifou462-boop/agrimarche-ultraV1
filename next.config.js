/** @type {import('next').NextConfig} */

// Ce flag n'est actif QUE quand on build pour Capacitor (voir scripts/build-capacitor.js).
// Le déploiement normal sur Vercel (site web + routes API) ignore cette condition
// et tourne donc toujours en mode serveur classique.
const isCapacitorBuild = process.env.CAPACITOR_BUILD === 'true';

const nextConfig = {
  reactStrictMode: true,
  ...(isCapacitorBuild ? { output: 'export' } : {}),

  images: {
    unoptimized: isCapacitorBuild,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "firebasestorage.googleapis.com",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
      {
        protocol: "https",
        hostname: "i.ibb.co",
      },
      {
        protocol: "https",
        hostname: "i.imgur.com",
      },
    ],
  },
};

module.exports = nextConfig;
