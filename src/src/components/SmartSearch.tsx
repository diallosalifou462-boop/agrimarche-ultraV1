'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { apiUrl } from '@/lib/api-config';

const SUGGESTIONS = [
  { text: 'Tomates fraîches Dakar', emoji: '🍅' },
  { text: 'Mangues bio Thiès', emoji: '🥭' },
  { text: 'Mil local Kaolack', emoji: '🌾' },
  { text: 'Oignons Podor', emoji: '🧅' },
  { text: 'Arachides grillées', emoji: '🥜' },
  { text: 'Piments locaux', emoji: '🌶️' },
  { text: 'Gombo frais', emoji: '🫛' },
  { text: 'Bissap séché', emoji: '🌺' },
];

interface SmartSearchProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

export function SmartSearch({ value, onChange, placeholder = "Rechercher des produits frais…" }: SmartSearchProps) {
  const [focused, setFocused] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [loadingAI, setLoadingAI] = useState(false);
  // ✅ CORRECTION : Utiliser NodeJS.Timeout au lieu de ReturnType<typeof setTimeout>
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // IA suggestions basées sur la saisie
  useEffect(() => {
    if (!value.trim() || value.length < 3) { 
      setAiSuggestions([]); 
      return; 
    }
    
    // Nettoyer le timeout précédent
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    
    debounceRef.current = setTimeout(async () => {
      setLoadingAI(true);
      try {
        const res = await fetch(apiUrl('/api/ai/agribot'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{ role: 'user', content: `Donne 4 suggestions de recherche courtes (3-5 mots chacune) pour "${value}" sur une marketplace agricole sénégalaise. Réponds UNIQUEMENT avec un JSON: {"suggestions": ["...", "...", "...", "..."]}` }],
            systemPrompt: 'Tu es un assistant pour une marketplace agricole sénégalaise. Réponds UNIQUEMENT avec du JSON valide sans backticks.'
          }),
        });
        const data = await res.json();
        if (data.suggestions) setAiSuggestions(data.suggestions.slice(0, 4));
        else if (data.response) {
          try { 
            const p = JSON.parse(data.response); 
            setAiSuggestions(p.suggestions ?? []); 
          } catch {}
        }
      } catch (error) {
        console.error('Erreur suggestions IA:', error);
      }
      setLoadingAI(false);
    }, 600);
    
    // Cleanup
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [value]);

  const showDropdown = focused && (value.length === 0 || aiSuggestions.length > 0);

  return (
    <div className="relative w-full">
      <div className={`flex items-center gap-2 bg-white border-2 rounded-2xl px-4 py-2.5 transition-all duration-200 ${focused ? 'border-green-400 shadow-lg shadow-green-100' : 'border-gray-200'}`}>
        <span className="text-gray-400 text-lg flex-shrink-0">🔍</span>
        <input
          ref={inputRef}
          value={value}
          onChange={e => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-sm text-gray-700 placeholder-gray-400 outline-none"
        />
        {value && (
          <button 
            onClick={() => { 
              onChange(''); 
              inputRef.current?.focus(); 
            }} 
            className="text-gray-400 hover:text-gray-600 transition"
            type="button"
          >
            ✕
          </button>
        )}
        {loadingAI && (
          <div className="w-4 h-4 border-2 border-green-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
        )}
      </div>

      {/* Dropdown suggestions */}
      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden z-50">
          {value.length === 0 ? (
            <>
              <p className="px-4 pt-3 pb-1 text-xs font-semibold text-gray-400">Recherches populaires</p>
              {SUGGESTIONS.map((s, i) => (
                <button
                  key={i}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChange(s.text);
                    setFocused(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-green-50 transition text-left"
                  type="button"
                >
                  <span className="text-lg">{s.emoji}</span>
                  <span className="text-sm text-gray-700">{s.text}</span>
                </button>
              ))}
            </>
          ) : (
            <>
              <p className="px-4 pt-3 pb-1 text-xs font-semibold text-green-600 flex items-center gap-1">
                <span className="w-3 h-3 bg-green-600 rounded-full flex items-center justify-center text-white text-[7px]">AI</span>
                Suggestions intelligentes
              </p>
              {aiSuggestions.map((s, i) => (
                <button
                  key={i}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChange(s);
                    setFocused(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-green-50 transition text-left"
                  type="button"
                >
                  <span className="text-green-500">🔍</span>
                  <span className="text-sm text-gray-700">{s}</span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
