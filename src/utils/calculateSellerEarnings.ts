// @ts-nocheck
// src/utils/calculateSellerEarnings.ts

export function calculateSellerEarnings(orders = []) {
  return orders.reduce((total, order) => {
    if (order.status !== 'cancelled') {
      return total + (order.total || 0);
    }
    return total;
  }, 0);
}