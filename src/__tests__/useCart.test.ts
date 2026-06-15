// src/__tests__/useCart.test.ts
// Tests unitaires du hook useCart — logique panier sans Firebase

import { renderHook, act } from '@testing-library/react';

// ─── Mocks ───────────────────────────────────────────────────────────────────
jest.mock('@/lib/firebase/firebase', () => ({
  auth: { currentUser: null },
  db: {},
}));

jest.mock('firebase/firestore', () => ({
  doc: jest.fn(),
  setDoc: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/pwa/offline-sync', () => ({
  offlineSync: { queueCartUpdate: jest.fn() },
}));

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// ─── Import après les mocks ───────────────────────────────────────────────────
import { useCart } from '@/hooks/useCart';
import { Product } from '@/types';

const makeProduct = (overrides: Partial<Product> = {}): Product => ({
  id: 'prod-1',
  name: 'Tomates fraîches',
  description: 'Tomates locales du Sénégal',
  price: 1000,
  images: [],
  category: 'légumes',
  categoryId: 'cat-1',
  sellerId: 'seller-1',
  sellerName: 'Mamadou',
  sellerRating: 4.5,
  stock: 50,
  unit: 'kg',
  tags: [],
  rating: 4.5,
  reviewCount: 10,
  isOrganic: false,
  location: 'Dakar',
  status: 'active',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

// ─── Tests ────────────────────────────────────────────────────────────────────
describe('useCart', () => {
  beforeEach(() => {
    localStorageMock.clear();
    jest.clearAllMocks();
  });

  it('démarre avec un panier vide', () => {
    const { result } = renderHook(() => useCart());
    expect(result.current.cart.items).toHaveLength(0);
    expect(result.current.cart.total).toBe(0);
    expect(result.current.cart.itemCount).toBe(0);
  });

  it('ajoute un produit au panier', () => {
    const { result } = renderHook(() => useCart());
    const product = makeProduct();

    act(() => {
      result.current.addToCart(product, 2);
    });

    expect(result.current.cart.items).toHaveLength(1);
    expect(result.current.cart.items[0].quantity).toBe(2);
    expect(result.current.cart.total).toBe(2000);
    expect(result.current.cart.itemCount).toBe(2);
  });

  it("ne dépasse pas le stock disponible", () => {
    const { result } = renderHook(() => useCart());
    const product = makeProduct({ stock: 3 });

    act(() => {
      result.current.addToCart(product, 10); // tente d'ajouter 10, stock = 3
    });

    expect(result.current.cart.items[0].quantity).toBe(3);
  });

  it('cumule la quantité si le produit est déjà dans le panier', () => {
    const { result } = renderHook(() => useCart());
    const product = makeProduct();

    act(() => { result.current.addToCart(product, 1); });
    act(() => { result.current.addToCart(product, 2); });

    expect(result.current.cart.items).toHaveLength(1);
    expect(result.current.cart.items[0].quantity).toBe(3);
  });

  it('supprime un produit du panier', () => {
    const { result } = renderHook(() => useCart());
    const product = makeProduct();

    act(() => { result.current.addToCart(product); });
    act(() => { result.current.removeFromCart(product.id); });

    expect(result.current.cart.items).toHaveLength(0);
    expect(result.current.cart.total).toBe(0);
  });

  it('met à jour la quantité', () => {
    const { result } = renderHook(() => useCart());
    const product = makeProduct();

    act(() => { result.current.addToCart(product, 5); });
    act(() => { result.current.updateQuantity(product.id, 2); });

    expect(result.current.cart.items[0].quantity).toBe(2);
    expect(result.current.cart.total).toBe(2000);
  });

  it('supprime le produit si quantité = 0', () => {
    const { result } = renderHook(() => useCart());
    const product = makeProduct();

    act(() => { result.current.addToCart(product, 3); });
    act(() => { result.current.updateQuantity(product.id, 0); });

    expect(result.current.cart.items).toHaveLength(0);
  });

  it('vide le panier', () => {
    const { result } = renderHook(() => useCart());
    const p1 = makeProduct({ id: 'p1' });
    const p2 = makeProduct({ id: 'p2', price: 2000 });

    act(() => {
      result.current.addToCart(p1, 2);
      result.current.addToCart(p2, 1);
    });

    act(() => { result.current.clearCart(); });

    expect(result.current.cart.items).toHaveLength(0);
    expect(result.current.cart.total).toBe(0);
  });

  it('gère plusieurs produits différents', () => {
    const { result } = renderHook(() => useCart());
    const p1 = makeProduct({ id: 'p1', price: 1000 });
    const p2 = makeProduct({ id: 'p2', price: 2500 });

    act(() => {
      result.current.addToCart(p1, 2);
      result.current.addToCart(p2, 1);
    });

    expect(result.current.cart.items).toHaveLength(2);
    expect(result.current.cart.total).toBe(4500);
    expect(result.current.cart.itemCount).toBe(3);
  });
});
