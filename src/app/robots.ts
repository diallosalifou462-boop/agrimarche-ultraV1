// app/robots.ts

import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/admin/',
        '/seller/register/',
        '/auth/',
        '/checkout/',
      ],
    },
    sitemap: 'https://agrimarche.sn/sitemap.xml',
    host: 'https://agrimarche.sn',
  };
}