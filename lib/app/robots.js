"use strict";
// app/robots.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = robots;
function robots() {
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
