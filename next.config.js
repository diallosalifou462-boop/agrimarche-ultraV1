/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      // Firebase Storage
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
      },
      // Unsplash (si tu utilises des images de test)
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      // Cloudinary (optionnel)
      {
        protocol: 'https',
        hostname: '*.cloudinary.com',
      },
      // Imgbb, imgur (optionnel)
      {
        protocol: 'https',
        hostname: 'i.ibb.co',
      },
      {
        protocol: 'https',
        hostname: 'i.imgur.com',
      },
    ],
  },
};

module.exports = nextConfig;