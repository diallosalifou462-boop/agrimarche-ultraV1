export interface ProductData {
  id: string;
  name: string;
  description?: string;
  price: number;
  unit: string;
 category: string;
  farmer?: string;
  farmerPhone?: string;
  farmerVerified?: boolean;
  images?: string[];
  stock?: number;
  exactLocation?: string;
  region?: string;
  lat?: number;
  lng?: number;
  sellerId?: string;
}