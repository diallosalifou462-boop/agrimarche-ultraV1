"use strict";
'use client';
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = CategoryPage;
const link_1 = __importDefault(require("next/link"));
const image_1 = __importDefault(require("next/image"));
const navigation_1 = require("next/navigation");
const products_1 = require("@/data/products");
function CategoryPage() {
    const { category } = (0, navigation_1.useParams)();
    const filteredProducts = products_1.products.filter((product) => product.category
        .toLowerCase()
        .replace(/\s+/g, '-') ===
        category.toLowerCase());
    return (<div className="min-h-screen bg-gray-50">

      {/* HEADER */}
      <div className="bg-white border-b border-gray-100 px-4 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">

          <link_1.default href="/main/products" className="text-2xl font-bold text-emerald-600">
            🌿 AgriMarché
          </link_1.default>

        </div>
      </div>

      {/* CONTENT */}
      <div className="max-w-7xl mx-auto px-4 py-8">

        <h1 className="text-3xl font-bold text-gray-800 mb-8 capitalize">
          Catégorie : {category}
        </h1>

        {filteredProducts.length === 0 ? (<div className="bg-white rounded-2xl p-10 text-center shadow">

            <p className="text-gray-500 text-lg">
              Aucun produit trouvé.
            </p>

          </div>) : (<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">

            {filteredProducts.map((product) => {
                var _a;
                return (<link_1.default key={product.id} href={`/product/${product.id}`} className="bg-white rounded-2xl overflow-hidden shadow hover:shadow-xl transition">

                <div className="relative aspect-square bg-gray-100">

                  {((_a = product.images) === null || _a === void 0 ? void 0 : _a[0]) ? (<image_1.default src={product.images[0]} alt={product.name} fill className="object-cover"/>) : (<div className="w-full h-full flex items-center justify-center text-6xl">
                      🌿
                    </div>)}

                </div>

                <div className="p-4">

                  <h2 className="font-bold text-gray-800">
                    {product.name}
                  </h2>

                  <p className="text-emerald-600 font-bold mt-2">
                    {product.price.toLocaleString()} FCFA
                  </p>

                  <p className="text-sm text-gray-400">
                    / {product.unit}
                  </p>

                </div>

              </link_1.default>);
            })}

          </div>)}

      </div>

    </div>);
}
