'use client';

import { useState, useCallback, useRef } from 'react';
import Image from 'next/image';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '@/lib/firebase/firebase';
import { compressImage } from '@/lib/utils/imageCompression';

interface ProductImageUploadProps {
  sellerId: string;          // UID du vendeur — requis pour respecter les Storage rules
  productId: string;         // ID du produit (peut être un ID temporaire à la création)
  onUploadComplete: (urls: string[]) => void;
  maxImages?: number;
  existingImages?: string[];
}

export function ProductImageUpload({
  sellerId,
  productId,
  onUploadComplete,
  maxImages = 5,
  existingImages = [],
}: ProductImageUploadProps) {
  const [images, setImages]       = useState<string[]>(existingImages);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress]   = useState<Record<string, number>>({});
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (!sellerId || !productId) {
        setError('Impossible d\'uploader : sellerId ou productId manquant.');
        return;
      }

      const remaining = maxImages - images.length;
      if (files.length > remaining) {
        setError(`Maximum ${maxImages} images. ${remaining} emplacement(s) disponible(s).`);
        return;
      }

      setError(null);
      setUploading(true);
      const uploadedUrls: string[] = [];

      for (const file of files) {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
          setError(`Format non supporté : ${file.name}`);
          continue;
        }
        if (file.size > 5 * 1024 * 1024) {
          setError(`Fichier trop lourd (max 5 MB) : ${file.name}`);
          continue;
        }

        try {
          const compressed = await compressImage(file, { maxWidth: 1200, maxHeight: 1200, quality: 0.8 });

          // ✅ Chemin conforme aux Storage rules :
          // /products/{sellerId}/{productId}/{fileName}
          const uniqueName = `${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
          const filePath = `products/${sellerId}/${productId}/${uniqueName}`;
          const storageRef = ref(storage, filePath);

          const task = uploadBytesResumable(storageRef, compressed, {
            contentType: 'image/jpeg',
          });

          await new Promise<void>((resolve, reject) => {
            task.on(
              'state_changed',
              (snap) => {
                const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
                setProgress((prev) => ({ ...prev, [file.name]: pct }));
              },
              reject,
              resolve
            );
          });

          const url = await getDownloadURL(storageRef);
          uploadedUrls.push(url);

          setProgress((prev) => {
            const next = { ...prev };
            delete next[file.name];
            return next;
          });
        } catch (err: any) {
          console.error('Upload error:', err);
          // Message explicite selon le code Firebase Storage
          if (err.code === 'storage/unauthorized') {
            setError('Accès refusé. Vérifiez que votre compte vendeur est activé.');
          } else {
            setError(`Erreur upload : ${file.name}`);
          }
        }
      }

      if (uploadedUrls.length > 0) {
        setImages((prev) => {
          const updated = [...prev, ...uploadedUrls];
          onUploadComplete(updated);
          return updated;
        });
      }
      setUploading(false);
    },
    [images.length, maxImages, onUploadComplete, sellerId, productId]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      uploadFiles(Array.from(e.dataTransfer.files));
    },
    [uploadFiles]
  );

  const removeImage = (index: number) => {
    setImages((prev) => {
      const updated = prev.filter((_, i) => i !== index);
      onUploadComplete(updated);
      return updated;
    });
  };

  const disabled = uploading || images.length >= maxImages;

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded-lg">
          {error}
        </div>
      )}

      {/* Zone de drop */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        onClick={() => !disabled && inputRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-colors
          ${isDragging ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-green-400 bg-gray-50'}
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => uploadFiles(Array.from(e.target.files ?? []))}
          disabled={disabled}
        />
        <div className="text-4xl mb-3">{uploading ? '⏳' : '📸'}</div>
        <p className="text-gray-600 font-medium">
          {isDragging ? 'Déposez les images' : 'Glissez-déposez ou cliquez'}
        </p>
        <p className="text-xs text-gray-400 mt-1">
          JPG · PNG · WEBP — max 5 MB par image — {images.length}/{maxImages} images
        </p>
      </div>

      {/* Barres de progression */}
      {Object.entries(progress).map(([name, pct]) => (
        <div key={name} className="bg-white rounded-xl border border-gray-100 p-3 shadow-sm">
          <div className="flex justify-between text-xs text-gray-500 mb-1.5">
            <span className="truncate max-w-xs">{name}</span>
            <span>{pct}%</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      ))}

      {/* Galerie */}
      {images.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
          {images.map((url, i) => (
            <div key={i} className="relative group aspect-square">
              <Image
                src={url}
                alt={`Image ${i + 1}`}
                fill
                className="object-cover rounded-xl"
                sizes="120px"
              />
              {i === 0 && (
                <span className="absolute top-1 left-1 bg-green-600 text-white text-xs px-1.5 py-0.5 rounded-md font-medium">
                  Principal
                </span>
              )}
              <button
                onClick={() => removeImage(i)}
                className="absolute top-1 right-1 bg-red-500 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition shadow"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

