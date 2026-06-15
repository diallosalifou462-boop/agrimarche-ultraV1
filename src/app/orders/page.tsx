'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

function formatPrice(amount: number) {
  return amount.toLocaleString() + ' FCFA';
}

export default function OrdersPage() {

  const [orders, setOrders] =
    useState<any[]>([]);

  useEffect(() => {

    const savedOrders =
      JSON.parse(
        localStorage.getItem(
          'agrimarche_orders'
        ) || '[]'
      );

    setOrders(savedOrders);

  }, []);

  return (

    <div className="min-h-screen bg-gray-50">

      {/* HEADER */}

      <header className="bg-white border-b border-gray-100 sticky top-0 z-40 shadow-sm">

        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">

          <h1 className="text-2xl font-bold text-gray-900">
            📦 Mes commandes
          </h1>

          <Link href="/main/products">

            <button className="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-xl font-semibold transition">

              Continuer mes achats

            </button>

          </Link>

        </div>

      </header>

      {/* CONTENT */}

      <div className="max-w-3xl mx-auto p-4">

        {orders.length === 0 ? (

          <div className="bg-white rounded-2xl p-10 text-center shadow-sm mt-6">

            <div className="text-6xl mb-4">
              📦
            </div>

            <h2 className="text-xl font-bold text-gray-900 mb-2">
              Aucune commande
            </h2>

            <p className="text-gray-500 text-sm mb-6">
              Vos commandes apparaîtront ici.
            </p>

            <Link href="/main/products">

              <button className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-xl font-semibold">

                Commencer mes achats

              </button>

            </Link>

          </div>

        ) : (

          <div className="space-y-5 mt-6">

            {orders.map((order, index) => (

              <div
                key={index}
                className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100"
              >

                {/* TOP */}

                <div className="flex items-start justify-between mb-4">

                  <div>

                    <p className="font-bold text-gray-900">
                      {order.id}
                    </p>

                    <p className="text-sm text-gray-500">
                      📅 {order.date}
                    </p>

                  </div>

                  <span className="bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full text-xs font-semibold">

                    {order.status}

                  </span>

                </div>

                {/* INFOS */}

                <div className="space-y-2 text-sm mb-4">

                  <div className="flex justify-between">

                    <span className="text-gray-500">
                      Vendeur
                    </span>

                    <span className="font-medium text-gray-800">
                      {order.seller}
                    </span>

                  </div>

                  <div className="flex justify-between">

                    <span className="text-gray-500">
                      Livraison
                    </span>

                    <span className="font-medium text-gray-800">
                      {order.deliveryTime}
                    </span>

                  </div>

                  <div className="flex justify-between">

                    <span className="text-gray-500">
                      Paiement
                    </span>

                    <span className="font-medium text-gray-800">
                      À la livraison
                    </span>

                  </div>

                  <div className="flex justify-between">

                    <span className="text-gray-500">
                      Total
                    </span>

                    <span className="font-bold text-green-700">
                      {formatPrice(order.total)}
                    </span>

                  </div>

                </div>

                {/* ARTICLES */}

                <div className="border-t border-gray-100 pt-4">

                  <p className="font-semibold text-gray-800 mb-3">

                    🛒 Articles

                  </p>

                  <div className="space-y-2">

                    {order.items?.length > 0 ? (

                      order.items?.slice(0, 3).map(
                        (
                          item: any,
                          i: number
                        ) => (

                          <div
                            key={i}
                            className="flex items-center justify-between text-sm"
                          >

                            <span className="text-gray-700">

                              {item.product.name} × {item.quantity}

                            </span>

                            <span className="font-medium text-gray-900">

                              {formatPrice(
                                item.product.price *
                                  item.quantity
                              )}

                            </span>

                          </div>

                        )
                      )

                    ) : (

                      <p className="text-sm text-gray-400">

                        Aucun détail produit disponible

                      </p>

                    )}

                    {order.items?.length > 3 && (

                      <p className="text-xs text-gray-400">

                        +{order.items?.length - 3} autre(s) article(s)

                      </p>

                    )}

                  </div>

                </div>

                {/* ACTIONS */}

                <div className="flex flex-col sm:flex-row gap-3 mt-5">

                  <a
                    href={`https://wa.me/221779747073?text=Bonjour%20je%20souhaite%20suivre%20ma%20commande%20${order.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1"
                  >

                    <button className="w-full bg-[#25D366] hover:bg-[#128C7E] text-white py-3 rounded-xl font-semibold transition">

                      💬 Contacter le vendeur

                    </button>

                  </a>

                  <Link
                    href="/main/products"
                    className="flex-1"
                  >

                    <button className="w-full bg-green-50 hover:bg-green-100 text-green-700 py-3 rounded-xl font-semibold transition">

                      🛍️ Commander à nouveau

                    </button>

                  </Link>

                </div>

              </div>

            ))}

          </div>

        )}

      </div>

    </div>

  );

}