'use client';

import { useState, useCallback, useRef } from 'react';
import { ImagePlus, X, Loader2, Camera } from 'lucide-react';
import Image from 'next/image';

interface ImageUploaderProps {
  existingImages?: string[];
  onImagesUpload: (urls: string[]) => void;
  onImageDelete?: (url: string, index: number) => void;
  maxImages?: number;
  uploading?: boolean;
}

export function ImageUploader({ 
  existingImages = [], 
  onImagesUpload, 
  onImageDelete,
  maxImages = 6,
  uploading: externalUploading = false
}: ImageUploaderProps) {
  const [images, setImages] = useState<string[]>(existingImages);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const remainingSlots = maxImages - images.length;

  const handleFileSelect = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (remainingSlots <= 0) {
      alert(`Maximum ${maxImages} photos`);
      return;
    }

    // Filtrage immédiat - pas de traitement lourd
    const validFiles = Array.from(files)
      .slice(0, remainingSlots)
      .filter(file => {
        if (!file.type.startsWith('image/')) {
          alert(`${file.name} n'est pas une image`);
          return false;
        }
        if (file.size > 3 * 1024 * 1024) { // 3Mo max
          alert(`${file.name} dépasse 3Mo`);
          return false;
        }
        return true;
      });

    if (validFiles.length === 0) return;

    setUploading(true);

    // Preview immédiate
    const previewUrls = validFiles.map(file => URL.createObjectURL(file));
    setImages([...images, ...previewUrls]);

    // Simuler upload (à connecter à Firebase)
    setTimeout(() => {
      onImagesUpload(previewUrls);
      setUploading(false);
    }, 500);
  }, [images, remainingSlots, maxImages, onImagesUpload]);

  const handleDelete = useCallback((index: number) => {
    const imageToDelete = images[index];
    if (imageToDelete.startsWith('blob:')) {
      URL.revokeObjectURL(imageToDelete);
    }
    const newImages = images.filter((_, i) => i !== index);
    setImages(newImages);
    if (onImageDelete && !imageToDelete.startsWith('blob:')) {
      onImageDelete(imageToDelete, index);
    }
  }, [images, onImageDelete]);

  return (
    <div className="space-y-3">
      {/* Bouton d'upload - Simple et visible */}
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={remainingSlots === 0 || uploading || externalUploading}
        className="w-full border-2 border-dashed border-emerald-300 rounded-xl p-4 text-center hover:border-emerald-500 hover:bg-emerald-50 transition disabled:opacity-50"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={(e) => handleFileSelect(e.target.files)}
          className="hidden"
        />
        <div className="flex items-center justify-center gap-2">
          {(uploading || externalUploading) ? (
            <Loader2 size={20} className="animate-spin text-emerald-600" />
          ) : (
            <Camera size={20} className="text-emerald-600" />
          )}
          <span className="text-emerald-600 font-medium">
            {uploading ? 'Upload...' : 'Ajouter des photos'}
          </span>
        </div>
        <p className="text-xs text-gray-400 mt-1">
          JPG, PNG, WEBP max 3Mo • {remainingSlots}/{maxImages} restantes
        </p>
      </button>

      {/* Grille d'images - Simple */}
      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {images.map((url, index) => (
            <div key={index} className="relative group aspect-square rounded-lg overflow-hidden bg-gray-100">
              <Image
                src={url}
                alt={`Photo ${index + 1}`}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 33vw, 25vw"
              />
              <button
                onClick={() => handleDelete(index)}
                className="absolute top-1 right-1 p-1 bg-red-500 rounded-full opacity-0 group-hover:opacity-100 transition"
              >
                <X size={12} className="text-white" />
              </button>
              {index === 0 && (
                <span className="absolute bottom-1 left-1 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded">
                  Principal
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}