import type { ProductData } from "@/lib/types/product";

export class ProductCache {
  async getProducts(): Promise<ProductData[]> {
    return [];
  }

  async saveProducts(products: ProductData[]): Promise<void> {
    return;
  }
}

export const productCache = new ProductCache();