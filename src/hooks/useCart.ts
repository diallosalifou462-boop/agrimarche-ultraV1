'use client';

// src/hooks/useCart.ts
import {
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import { useAuth } from '@/hooks/useAuth';
import {
  doc,
  setDoc,
} from 'firebase/firestore';

import {
  db,
  auth,
} from '@/lib/firebase/firebase';
  import { getDoc } from 'firebase/firestore';
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

function calculateCart(
  items: CartItem[]
): Cart {
  const total = items.reduce(
    (sum, item) =>
      sum +
      item.product.price *
        item.quantity,
    0
  );

  const itemCount = items.reduce(
    (sum, item) =>
      sum + item.quantity,
    0
  );

  return {
    items,
    total,
    itemCount,
  };
}

// ✅ VALIDATION
function validateItems(
  raw: unknown
): CartItem[] {
  if (!Array.isArray(raw))
    return [];

  return raw.filter(
    (
      item
    ): item is CartItem =>
      item !== null &&
      typeof item === 'object' &&
      typeof item.quantity ===
        'number' &&
      item.quantity > 0 &&
      item.product !== null &&
      typeof item.product ===
        'object' &&
      typeof item.product.id ===
        'string' &&
      typeof item.product.price ===
        'number'
  );
}

export function useCart() {
  const userId =
  auth.currentUser?.uid ||
  'guest';

const CART_KEY =
  `agrimarche_cart_${userId}`;
  const [cart, setCart] =
    useState<Cart>(emptyCart);

  const itemsRef = useRef<
    CartItem[]
  >([]);

  // ✅ HYDRATE
  useEffect(() => {
    if (
      typeof window ===
      'undefined'
    )
      return;
      if (auth.currentUser) {

  getDoc(
    doc(
      db,
      'carts',
      auth.currentUser.uid
    )
  ).then((snap) => {

    if (snap.exists()) {

      const data = snap.data();

      const items =
        validateItems(
          data.items
        );

      itemsRef.current =
        items;

      setCart(
        calculateCart(items)
      );

    }

  });

  return;
}
    try {
      const saved =
        localStorage.getItem(
          CART_KEY
        );
      if (saved) {
        const raw =
          JSON.parse(saved);

        // ✅ nouveau format
        if (raw?.items) {
          const items =
            validateItems(
              raw.items
            );

          itemsRef.current =
            items;

          setCart(
            calculateCart(
              items
            )
          );
        }

        // ✅ ancien format
        else if (
          Array.isArray(raw)
        ) {
          const items =
            validateItems(raw);

          itemsRef.current =
            items;

          setCart(
            calculateCart(
              items
            )
          );
        }
      }
    } catch {
      try {
        localStorage.removeItem(
          CART_KEY
        );
      } catch {
        // ignore
      }
    }
  }, []);

  // ✅ PERSIST
  const persist = useCallback(
    (items: CartItem[]) => {
      itemsRef.current = items;

      const updated =
        calculateCart(items);

      setCart(updated);

      // ✅ LOCAL STORAGE
      if (
        typeof window !==
        'undefined'
      ) {
        try {
          localStorage.setItem(
            CART_KEY,
            JSON.stringify(
              updated
            )
          );
        } catch {
          // ignore
        }
      }

      // ✅ FIRESTORE
      if (
        typeof window !==
          'undefined' &&
        navigator.onLine &&
        auth.currentUser
      ) {
        setDoc(
          doc(
            db,
            'carts',
            auth.currentUser.uid
          ),
          updated,
          { merge: true }
        ).catch(
          console.error
        );
      }
    },
    []
  );

  // ✅ ADD TO CART
  const addToCart =
    useCallback(
      (
        product: Product,
        quantity = 1
      ) => {
        const prev =
          itemsRef.current;

        const existing =
          prev.find(
            (i) =>
              i.product.id ===
              product.id
          );

        // ✅ SAFE STOCK CHECK
        if (
          (product.stock || 0) <= 0
        )
          return;

        const newItems =
          existing
            ? prev.map((i) =>
                i.product.id ===
                product.id
                  ? {
                      ...i,
                      quantity:
                        Math.min(
                          i.quantity +
                            quantity,
                          product.stock || 0
                        ),
                    }
                  : i
              )
            : [
                ...prev,
                {
                  product,
                  quantity:
                    Math.min(
                      quantity,
                      product.stock || 0
                    ),
                },
              ];

        persist(newItems);
      },
      [persist]
    );

  // ✅ REMOVE
  const removeFromCart =
    useCallback(
      (productId: string) => {
        persist(
          itemsRef.current.filter(
            (i) =>
              i.product.id !==
              productId
          )
        );
      },
      [persist]
    );

  // ✅ UPDATE QTY
  const updateQuantity =
    useCallback(
      (
        productId: string,
        quantity: number
      ) => {
        if (quantity <= 0) {
          removeFromCart(
            productId
          );

          return;
        }

        const newItems =
          itemsRef.current.map(
            (i) =>
              i.product.id !==
              productId
                ? i
                : {
                    ...i,
                    quantity:
                      Math.min(
                        quantity,
                        i.product.stock || 0
                      ),
                  }
          );

        persist(newItems);
      },
      [persist, removeFromCart]
    );

  // ✅ CLEAR CART
  const clearCart =
    useCallback(() => {
      persist([]);
    }, [persist]);

  // ✅ RETURN
  return {
    cart,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
  };
}