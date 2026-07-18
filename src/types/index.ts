// src/types/index.ts

export type UserRole = 'buyer' | 'seller' | 'admin' | 'delivery';

export interface User {
  id: string;
  email: string;
  displayName: string;
  photoURL?: string;
  role: UserRole;
  phone?: string;
  address?: Address;
  createdAt: Date;
  updatedAt: Date;
}

export interface Address {
  street: string;
  city: string;
  region: string;
  country: string;
  coordinates?: { lat: number; lng: number };
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  icon: string;
  parentId?: string;
  children?: Category[];
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  originalPrice?: number;
  images: string[];
  category: string;
  categoryId: string;
  sellerId: string;
  sellerName: string;
  sellerRating: number;
  stock: number;
  unit: string;
  minOrder?: number;
  tags: string[];
  rating: number;
  reviewCount: number;
  isOrganic: boolean;
  location: string;
  status: 'active' | 'inactive' | 'out_of_stock';
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductFilters {
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  location?: string;
  isOrganic?: boolean;
  sortBy?: 'price_asc' | 'price_desc' | 'newest' | 'popular' | 'rating';
  search?: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface Cart {
  items: CartItem[];
  total: number;
  itemCount: number;
}

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'refunded';

export interface Order {
  id: string;
  userId: string;
  items: CartItem[];
  total: number;
  status: OrderStatus;
  deliveryAddress: Address;
  paymentMethod: string;
  paymentStatus: 'pending' | 'paid' | 'failed' | 'refunded';
  trackingCode?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Review {
  id: string;
  productId: string;
  userId: string;
  userName: string;
  rating: number;
  comment: string;
  images?: string[];
  helpful: number;
  createdAt: Date;
}

export interface Notification {
  id: string;
  userId: string;
  type: 'order' | 'promo' | 'system' | 'delivery';
  title: string;
  body: string;
  read: boolean;
  url?: string;
  createdAt: Date;
}

export interface SellerStats {
  orders: number;
  ordersChange: number;
  productsSold: number;
  productsSoldChange: number;
  rating: number;
  ratingChange: number;
}

export interface SellerEarnings {
  total: number;
  change: number;
  history: Array<{ date: string; amount: number }>;
}

