'use client';

// src/hooks/useCart.ts
//
// ✅ REFONTE : useCart() était un simple hook — chaque page qui l'appelait
// (main/products, cart, checkout, product/[id]...) obtenait sa PROPRE copie
// indépendante du panier, synchronisée seulement via localStorage/Firestore
// en arrière-plan. Résultat : ajouter un produit sur une page ne se
// répercutait pas ailleurs (badge du header, page panier) tant que ces
// composants n'étaient pas remontés — d'où "produit ajouté introuvable" et
// "le compteur se vide en changeant de page".
//
// Le panier est maintenant un CONTEXT React unique, monté une seule fois à
// la racine de l'app (voir CartProvider à ajouter dans app/layout.tsx).
// Toute page qui appelle useCart() lit désormais le MÊME état partagé.
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from 'react';
import { useAuth } from '@/hooks/useAuth';
import {
  doc,
  getDoc,
  setDoc,
} from 'firebase/firestore';

import { db } from '@/lib/firebase/firebase';
import type {
  Cart,
  CartItem,
  Product,
} from '@/types';

const emptyCart: Cart = {
  items: [],
  total: 0,
  itemCount: 0,
};

const GUEST_KEY = 'agrimarche_cart_guest';

function calculateCart(items: CartItem[]): Cart {
  const total = items.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0
  );
  const itemCount = items.reduce(
    (sum, item) => sum + item.quantity,
    0
  );
  return { items, total, itemCount };
}

// ✅ VALIDATION
function validateItems(raw: unknown): CartItem[] {
  if (!Array.isArray(raw)) return [];

  return raw.filter(
    (item): item is CartItem =>
      item !== null &&
      typeof item === 'object' &&
      typeof (item as any).quantity === 'number' &&
      (item as any).quantity > 0 &&
      (item as any).product !== null &&
      typeof (item as any).product === 'object' &&
      typeof (item as any).product.id === 'string' &&
      typeof (item as any).product.price === 'number'
  );
}

// ✅ Firestore refuse tout champ `undefined` dans un document (setDoc plante
//    entièrement, même avec merge:true). On nettoie récursivement avant
//    chaque écriture pour qu'un produit incomplet ne casse jamais le panier.
function sanitizeForFirestore<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function readLocal(key: string): CartItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const saved = localStorage.getItem(key);
    if (!saved) return [];
    const raw = JSON.parse(saved);
    // nouveau format { items, total, itemCount }
    if (raw?.items) return validateItems(raw.items);
    // ancien format: tableau brut
    if (Array.isArray(raw)) return validateItems(raw);
    return [];
  } catch {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
    return [];
  }
}

interface CartContextValue {
  cart: Cart;
  isLoading: boolean;
  addToCart: (product: Product, quantity?: number) => void;
  removeFromCart: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  // ✅ On utilise l'état d'auth déjà résolu par l'app, jamais auth.currentUser
  //    directement (qui peut être null pendant la restauration async de la session).
  const { user, loading: authLoading } = useAuth() as {
    user: { uid: string } | null;
    loading: boolean;
  };

  const userId = user?.uid || 'guest';
  const CART_KEY = `agrimarche_cart_${userId}`;

  const [cart, setCart] = useState<Cart>(emptyCart);
  // ✅ true tant que le panier n'a pas encore été hydraté (localStorage/Firestore).
  //    Permet à l'UI de distinguer "panier pas encore chargé" de "panier réellement vide",
  //    et donc d'éviter le flash "écran vide -> vrai contenu" au montage.
  const [isLoading, setIsLoading] = useState(true);

  const itemsRef = useRef<CartItem[]>([]);
  // ✅ Refs toujours à jour : les callbacks mémoïsés (useCallback) ne capturent
  //    plus une valeur figée de la clé / de l'utilisateur.
  const cartKeyRef = useRef(CART_KEY);
  const userIdRef = useRef(userId);
  cartKeyRef.current = CART_KEY;
  userIdRef.current = userId;

  // ✅ HYDRATE — se relance à chaque changement d'utilisateur (login/logout),
  //    pas seulement une fois au montage du Provider (qui n'a lieu qu'une
  //    seule fois de toute façon, puisqu'il est monté à la racine de l'app).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (authLoading) return; // attendre que Firebase ait fini de restaurer la session

    let cancelled = false;
    setIsLoading(true);

    (async () => {
      // panier "invité" éventuellement présent avant la connexion
      const guestItems = readLocal(GUEST_KEY);

      if (user) {
        try {
          const snap = await getDoc(doc(db, 'carts', user.uid));
          let items = snap.exists()
            ? validateItems((snap.data() as any).items)
            : [];

          const localItems = readLocal(CART_KEY);
          if (localItems.length) {
            localItems.forEach((li) => {
              const existing = items.find((i) => i.product.id === li.product.id);
              if (existing) {
                existing.quantity = Math.max(existing.quantity, li.quantity);
              } else {
                items.push(li);
              }
            });
          }

          // ✅ fusionner le panier invité dans le panier utilisateur au lieu de le perdre
          if (guestItems.length) {
            guestItems.forEach((gi) => {
              const existing = items.find((i) => i.product.id === gi.product.id);
              if (existing) {
                existing.quantity = Math.min(
                  existing.quantity + gi.quantity,
                  existing.product.stock || 999
                );
              } else {
                items.push(gi);
              }
            });
            try { localStorage.removeItem(GUEST_KEY); } catch { /* ignore */ }
          }

          if (cancelled) return;
          itemsRef.current = items;
          setCart(calculateCart(items));

          // re-sauvegarder l'état fusionné (local + guest fusionnés avec Firestore)
          if (guestItems.length || localItems.length) {
            const updated = calculateCart(items);
            try { localStorage.setItem(CART_KEY, JSON.stringify(updated)); } catch { /* ignore */ }
            setDoc(doc(db, 'carts', user.uid), sanitizeForFirestore(updated), { merge: true }).catch(console.error);
          }
        } catch (e) {
          console.error(e);
          // repli local en cas d'erreur Firestore
          const items = readLocal(CART_KEY);
          if (!cancelled) {
            itemsRef.current = items;
            setCart(calculateCart(items));
          }
        }
      } else {
        const items = guestItems;
        if (!cancelled) {
          itemsRef.current = items;
          setCart(calculateCart(items));
        }
      }

      if (!cancelled) setIsLoading(false);
    })();

    return () => { cancelled = true; };
  }, [user?.uid, authLoading, CART_KEY]);

  // ✅ PERSIST — utilise toujours la clé / l'utilisateur courant via les refs,
  //    jamais une valeur figée par une closure de useCallback.
  const persist = useCallback((items: CartItem[]) => {
    itemsRef.current = items;
    const updated = calculateCart(items);
    setCart(updated);

    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(cartKeyRef.current, JSON.stringify(updated));
      } catch {
        // ignore
      }
    }

    if (
      typeof window !== 'undefined' &&
      navigator.onLine &&
      userIdRef.current !== 'guest'
    ) {
      setDoc(
        doc(db, 'carts', userIdRef.current),
        sanitizeForFirestore(updated),
        { merge: true }
      ).catch(console.error);
    }
  }, []);

  // ✅ ADD TO CART
  const addToCart = useCallback(
    (product: Product, quantity = 1) => {
      const prev = itemsRef.current;

      const existing = prev.find((i) => i.product.id === product.id);

      // ✅ SAFE STOCK CHECK
      if ((product.stock || 0) <= 0) return;

      const newItems = existing
        ? prev.map((i) =>
            i.product.id === product.id
              ? {
                  ...i,
                  quantity: Math.min(
                    i.quantity + quantity,
                    product.stock || 0
                  ),
                }
              : i
          )
        : [
            ...prev,
            {
              product,
              quantity: Math.min(quantity, product.stock || 0),
            },
          ];

      persist(newItems);
    },
    [persist]
  );

  // ✅ REMOVE
  const removeFromCart = useCallback(
    (productId: string) => {
      persist(itemsRef.current.filter((i) => i.product.id !== productId));
    },
    [persist]
  );

  // ✅ UPDATE QTY
  const updateQuantity = useCallback(
    (productId: string, quantity: number) => {
      if (quantity <= 0) {
        removeFromCart(productId);
        return;
      }

      const newItems = itemsRef.current.map((i) =>
        i.product.id !== productId
          ? i
          : {
              ...i,
              quantity: Math.min(quantity, i.product.stock || 0),
            }
      );

      persist(newItems);
    },
    [persist, removeFromCart]
  );

  // ✅ CLEAR CART
  const clearCart = useCallback(() => {
    persist([]);
  }, [persist]);

  return (
    <CartContext.Provider
      value={{ cart, isLoading, addToCart, removeFromCart, updateQuantity, clearCart }}
    >
      {children}
    </CartContext.Provider>
  );
}

// ✅ Hook consommateur — même nom/même import qu'avant (`@/hooks/useCart`),
// donc aucune autre page n'a besoin d'être modifiée. Doit être appelé
// depuis un composant descendant de <CartProvider>.
export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error('useCart() doit être utilisé à l\'intérieur de <CartProvider>. Vérifie que CartProvider entoure bien l\'app dans app/layout.tsx.');
  }
  return ctx;
}
