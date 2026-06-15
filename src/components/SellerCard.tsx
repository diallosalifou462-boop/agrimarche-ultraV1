'use client';

import Image from 'next/image';

interface Props {

  seller: {

    id: string;

    name: string;

    photo: string;

    region: string;

    verified: boolean;

    rating: number;

    totalReviews: number;

    totalSales: number;

    phone: string;

  };

}

export default function SellerCard({
  seller,
}: Props) {

  return (

    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5">

      {/* TOP */}

      <div className="flex items-center gap-4">

        {/* PHOTO */}

        <div className="relative w-20 h-20 rounded-full overflow-hidden border-4 border-green-100">

          <Image
            src={seller.photo}
            alt={seller.name}
            fill
            sizes="(max-width: 768px) 100vw, 33vw"
            className="object-cover"
          />

        </div>

        {/* INFOS */}

        <div className="flex-1">

          <div className="flex items-center gap-2 flex-wrap">

            <h2 className="text-xl font-bold text-gray-900">

              {seller.name}

            </h2>

            {seller.verified && (

              <span className="bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded-full font-semibold">

                ✔ Vérifié

              </span>

            )}

          </div>

          <p className="text-sm text-gray-500 mt-1">

            📍 {seller.region}

          </p>

        </div>

      </div>

      {/* STATS */}

      <div className="grid grid-cols-3 gap-3 mt-6">

        <div className="bg-gray-50 rounded-2xl p-3 text-center">

          <p className="text-2xl font-bold text-yellow-500">

            {seller.rating}

          </p>

          <p className="text-xs text-gray-500">

            Note

          </p>

        </div>

        <div className="bg-gray-50 rounded-2xl p-3 text-center">

          <p className="text-2xl font-bold text-green-600">

            {seller.totalSales}

          </p>

          <p className="text-xs text-gray-500">

            Ventes

          </p>

        </div>

        <div className="bg-gray-50 rounded-2xl p-3 text-center">

          <p className="text-2xl font-bold text-blue-600">

            {seller.totalReviews}

          </p>

          <p className="text-xs text-gray-500">

            Avis

          </p>

        </div>

      </div>

      {/* DESCRIPTION */}

      <div className="bg-green-50 rounded-2xl p-4 mt-5">

        <p className="text-sm text-gray-700 leading-relaxed">

          🌾 Producteur agricole présent sur AgriMarché.
          Produits frais, livraison rapide et service fiable.

        </p>

      </div>

      {/* ACTIONS */}

      <div className="grid grid-cols-2 gap-3 mt-5">

        <a
          href={`https://wa.me/${seller.phone}`}
          target="_blank"
          rel="noopener noreferrer"
        >

          <button className="w-full bg-[#25D366] hover:bg-[#128C7E] text-white py-3 rounded-2xl font-bold transition">

            💬 WhatsApp

          </button>

        </a>

        <button className="w-full bg-green-600 hover:bg-green-700 text-white py-3 rounded-2xl font-bold transition">

          🏪 Boutique

        </button>

      </div>

    </div>

  );

}