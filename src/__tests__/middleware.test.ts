// src/__tests__/middleware.test.ts
import { middleware } from '../../middleware';
import { NextRequest } from 'next/server';

function makeRequest(pathname: string, cookies: Record<string, string> = {}): NextRequest {
  const url = `https://agrimarche.com${pathname}`;
  const req = new NextRequest(url);
  Object.entries(cookies).forEach(([name, value]) => {
    req.cookies.set(name, value);
  });
  return req;
}

describe('middleware', () => {
  describe('Security headers', () => {
    it("ajoute les headers de sécurité sur toutes les routes", () => {
      const req = makeRequest('/main/products', { 'firebase-auth-token': 'token123' });
      const res = middleware(req);
      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(res.headers.get('X-Frame-Options')).toBe('SAMEORIGIN');
    });
  });

  describe('Auth guard', () => {
    it("redirige vers /auth/login si non authentifié sur /dashboard", () => {
      const req = makeRequest('/dashboard/seller/dashboard');
      const res = middleware(req);
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toContain('/auth/login');
    });

    it("redirige vers /auth/login si non authentifié sur /cart", () => {
      const req = makeRequest('/cart');
      const res = middleware(req);
      expect(res.status).toBe(307);
    });

    it("laisse passer si token présent sur route protégée", () => {
      const req = makeRequest('/dashboard/seller/dashboard', {
        'firebase-auth-token': 'valid-token',
      });
      const res = middleware(req);
      expect(res.status).toBe(200);
    });

    it("redirige /auth/login vers /main/products si déjà connecté", () => {
      const req = makeRequest('/auth/login', { 'firebase-auth-token': 'valid-token' });
      const res = middleware(req);
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toContain('/main/products');
    });

    it("laisse passer /main/products sans auth", () => {
      const req = makeRequest('/main/products');
      const res = middleware(req);
      expect(res.status).toBe(200);
    });
  });

  describe('PWA headers', () => {
    it("ajoute Service-Worker-Allowed sur /sw.js", () => {
      const req = makeRequest('/sw.js');
      const res = middleware(req);
      expect(res.headers.get('Service-Worker-Allowed')).toBe('/');
      expect(res.headers.get('Cache-Control')).toContain('no-cache');
    });

    it("ajoute Content-Type sur /manifest.json", () => {
      const req = makeRequest('/manifest.json');
      const res = middleware(req);
      expect(res.headers.get('Content-Type')).toBe('application/manifest+json');
    });
  });
});

