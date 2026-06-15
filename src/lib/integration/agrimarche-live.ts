
import { collection, addDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';

export type OrderStatus =
  | 'pending'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled';

export const REGIONS_SENEGAL = [
  { id: 'dakar', name: 'Dakar', fee: 1000 },
  { id: 'thies', name: 'Thiès', fee: 1500 },
  { id: 'saintlouis', name: 'Saint-Louis', fee: 2000 },
];

class AgrimarcheLive {
  async createOrder(data: any) {
    try {
      const docRef = await addDoc(collection(db, 'orders'), {
        ...data,
        status: 'pending',
        createdAt: new Date(),
      });

      return {
        success: true,
        orderId: docRef.id,
      };
    } catch (error) {
      console.error(error);

      return {
        success: false,
      };
    }
  }

  async updateOrderStatus() {
    return { success: true };
  }

  async uploadImage() {
    return {
      success: true,
      url: '/placeholder.jpg',
    };
  }

  listenToNotifications(userId: string, callback: any) {
    callback([]);
  }

  listenToSellerOrders(sellerId: string, callback: any) {
    callback([]);
  }

  listenToClientOrders(clientId: string, callback: any) {
    callback([]);
  }

  listenToSellerEarnings(sellerId: string, callback: any) {
    callback({
      totalEarnings: 0,
      monthlyEarnings: {},
    });
  }

  getMonthlyStats() {
    return [];
  }
}

export const agrimarche = new AgrimarcheLive();
