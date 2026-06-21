'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';

export default function SellerPage() {
  const { id } = useParams<{ id: string }>();

  const [products, setProducts] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // ✅ Produits du vendeur — lus depuis Firestore, plus depuis localStorage
  useEffect(() => {
    if (!id) return;

    const q = query(collection(db, 'products'), where('sellerId', '==', id));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        console.error('Erreur chargement produits vendeur:', err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [id]);

  // ✅ Avis du vendeur — lus depuis Firestore, plus depuis localStorage
  useEffect(() => {
    if (!id) return;

    const q = query(collection(db, 'reviews'), where('sellerId', '==', id));
    const unsub = onSnapshot(q, (snap) => {
      setReviews(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, (err) => {
      console.error('Erreur chargement avis vendeur:', err);
    });

    return () => unsub();
  }, [id]);

  const seller = products[0];

  const averageRating =
    reviews.length > 0
      ? (
          reviews.reduce((acc, r) => acc + (r.rating || 0), 0) / reviews.length
        ).toFixed(1)
      : '0';

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="text-6xl mb-4 animate-pulse">🌾</div>
          <p className="font-bold text-gray-700">Chargement...</p>
        </div>
      </div>
    );
  }

  if (!seller) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="text-6xl mb-4">🚜</div>
          <p className="font-bold text-gray-700">Vendeur introuvable</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* HEADER */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/main/products" className="text-green-700 font-bold text-2xl">
            🌾 AgriMarché
          </Link>
        </div>
      </div>

      {/* BANNER */}
      <div className="bg-gradient-to-r from-green-600 to-emerald-600 text-white">
        <div className="max-w-6xl mx-auto px-4 py-10">
          <div className="flex flex-col md:flex-row gap-6 items-center">
            <Image
              src={seller.sellerPhoto || '/avatar.png'}
              alt="seller"
              width={120}
              height={120}
              className="rounded-full object-cover border-4 border-white"
            />

            <div>
              <h1 className="text-3xl font-bold">{seller.sellerName}</h1>

              <p className="mt-2 text-green-100">📍 {seller.region}</p>

              <p className="mt-2">⭐ {averageRating} / 5</p>

              <p className="mt-1">📝 {reviews.length} avis</p>

              {seller.sellerPhone && (
                <a
                  href={`https://wa.me/${seller.sellerPhone}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <button className="mt-4 bg-white text-green-700 px-5 py-3 rounded-2xl font-bold">
                    💬 Contacter
                  </button>
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* PRODUITS */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">🌾 Produits du vendeur</h2>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {products.map((product) => (
            <Link
              key={product.id}
              href={`/product/${product.id}`}
              className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-lg transition"
            >
              <div className="aspect-square relative bg-gray-100">
                {product.images?.[0] && (
                  <Image
                    src={product.images[0]}
                    alt={product.name}
                    fill
                    sizes="(max-width: 768px) 100vw, 33vw"
                    className="object-cover"
                  />
                )}
              </div>

              <div className="p-3">
                <p className="font-bold text-gray-900 truncate">{product.name}</p>
                <p className="text-sm text-gray-500">{product.category}</p>
                <p className="text-green-700 font-bold mt-2">
                  {(product.price || 0).toLocaleString()} FCFA
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
