'use client';

import { createContext, useContext, useState, useEffect } from 'react';

interface CartItem {
  product: any;
  quantity: number;
}

interface CartContextType {
  cart: { items: CartItem[]; total: number } | null;
  addToCart: (product: any, quantity: number) => void;
  removeFromCart: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<{ items: CartItem[]; total: number } | null>(null);

  useEffect(() => {
    const savedCart = localStorage.getItem('cart');
    if (savedCart) {
      setCart(JSON.parse(savedCart));
    } else {
      setCart({ items: [], total: 0 });
    }
  }, []);

  const addToCart = (product: any, quantity: number) => {
    setCart(prev => {
      if (!prev) return { items: [], total: 0 };
      const existingItem = prev.items.find(item => item.product.id === product.id);
      let newItems;
      if (existingItem) {
        newItems = prev.items.map(item =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      } else {
        newItems = [...prev.items, { product, quantity }];
      }
      const newTotal = newItems.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
      const newCart = { items: newItems, total: newTotal };
      localStorage.setItem('cart', JSON.stringify(newCart));
      return newCart;
    });
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => {
      if (!prev) return { items: [], total: 0 };
      const newItems = prev.items.filter(item => item.product.id !== productId);
      const newTotal = newItems.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
      const newCart = { items: newItems, total: newTotal };
      localStorage.setItem('cart', JSON.stringify(newCart));
      return newCart;
    });
  };

  const updateQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }
    setCart(prev => {
      if (!prev) return { items: [], total: 0 };
      const newItems = prev.items.map(item =>
        item.product.id === productId ? { ...item, quantity } : item
      );
      const newTotal = newItems.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
      const newCart = { items: newItems, total: newTotal };
      localStorage.setItem('cart', JSON.stringify(newCart));
      return newCart;
    });
  };

  const clearCart = () => {
    setCart({ items: [], total: 0 });
    localStorage.removeItem('cart');
  };

  return (
    <CartContext.Provider value={{ cart, addToCart, removeFromCart, updateQuantity, clearCart }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
