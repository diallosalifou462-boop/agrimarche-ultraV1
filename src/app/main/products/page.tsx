'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { collection, onSnapshot, query, where, doc, updateDoc, increment } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { logEvent } from 'firebase/analytics';
import { analytics } from '@/lib/firebase/firebase';
import { useCart } from '@/hooks/useCart';
import { useAuth } from '@/hooks/useAuth';

const CATEGORIES = [
  { label: 'Tous',              icon: '✦',  color: '#C9A84C' },
  { label: 'Fruits',            icon: '', color: '#E8703A' },
  { label: 'Légumes',           icon: '', color: '#3D9A5C' },
  { label: 'Céréales',          icon: '', color: '#C9A84C' },
  { label: 'Tubercules',        icon: '', color: '#8B6914' },
  { label: 'Machines agricoles',icon: '', color: '#607080' },
  { label: 'Condiments',        icon: '', color: '#C0392B' },
  { label: 'Poissons',          icon: '', color: '#2980B9' },
  { label: 'Produits laitiers', icon: '', color: '#B0A090' },
  { label: 'Légumineuses',      icon: '', color: '#7D6A3E' },
  { label: 'Engrais',           icon: '', color: '#2ECC71' },
  { label: 'Elevage',  icon: '', color: '#E74C3C' },
];

const REGIONS_SENEGAL = [
  'Tout le Sénégal',
  'Dakar', 'Thiès', 'Diourbel', 'Fatick', 'Kaolack',
  'Kaffrine', 'Ziguinchor', 'Sédhiou', 'Kolda',
  'Tambacounda', 'Kédougou', 'Louga', 'Matam', 'Saint-Louis',
];

const WA_NUMBER = '221779747073';

function WaIcon({ s = 16 }: { s?: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.149-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.095 3.2 5.076 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
      <path d="M12 0C5.373 0 0 5.373 0 12c0 2.125.558 4.121 1.531 5.856L.073 23.27a.75.75 0 00.918.882l5.57-1.461A11.944 11.944 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75a9.73 9.73 0 01-4.964-1.363l-.355-.212-3.676.965.978-3.576-.232-.368A9.713 9.713 0 012.25 12C2.25 6.615 6.615 2.25 12 2.25S21.75 6.615 21.75 12 17.385 21.75 12 21.75z"/>
    </svg>
  );
}

// ✅ Type Product simplifié et compatible
interface ProductData {
  id: string;
  name: string;
  description?: string;
  price: number;
  unit: string;
  category: string;
  farmer?: string;
  farmerPhone?: string;
  farmerVerified?: boolean;
  images?: string[];
  stock?: number;
  exactLocation?: string;
  region?: string;
  lat?: number;
  lng?: number;
  sellerId?: string;
}

interface SellerRating { sellerId: string; averageRating: number; reviewCount: number; }


// ─────────────────────────────────────────────────────────────────────────────
// RECONNAISSANCE VOCALE — filtre de bruit + détection de murmure + amplification
// ─────────────────────────────────────────────────────────────────────────────

class AdaptiveNoiseFilter {
  private noiseProfile = new Float32Array(1024);
  private smoothingFactor = 0.9;
  private isTrained = false;

  train(noiseSample: Float32Array): void {
    for (let i = 0; i < noiseSample.length; i++) {
      this.noiseProfile[i] = this.smoothingFactor * this.noiseProfile[i] + (1 - this.smoothingFactor) * noiseSample[i];
    }
    this.isTrained = true;
  }

  filter(signal: Float32Array): Float32Array {
    if (!this.isTrained) return signal;
    const result = new Float32Array(signal.length);
    for (let i = 0; i < signal.length; i++) {
      result[i] = Math.max(0, signal[i] - this.noiseProfile[i % this.noiseProfile.length]);
    }
    return result;
  }
}

class WhisperDetector {
  private minDecibels = -120;
  private maxDecibels = 0;
  private smoothing = new Array(20).fill(0);
  private smoothingIndex = 0;

  detect(audioData: Float32Array): { isWhisper: boolean; confidence: number; volume: number } {
    let sum = 0;
    for (let i = 0; i < audioData.length; i++) sum += audioData[i] * audioData[i];
    const rms = Math.sqrt(sum / audioData.length);
    const dB = 20 * Math.log10(Math.max(rms, 0.000001));

    this.smoothing[this.smoothingIndex] = dB;
    this.smoothingIndex = (this.smoothingIndex + 1) % this.smoothing.length;
    const avgdB = this.smoothing.reduce((a, b) => a + b, 0) / this.smoothing.length;

    const volume = Math.max(0, Math.min(100, ((avgdB - this.minDecibels) / (this.maxDecibels - this.minDecibels)) * 100));
    const isWhisper = volume > 0 && volume < 15;
    const confidence = isWhisper ? Math.min(100, (15 - volume) * 10) : 0;

    return { isWhisper, confidence, volume };
  }
}

class AdaptiveVoiceAmplifier {
  private gain = 1.0;
  private maxGain = 5.0;
  private minGain = 0.5;
  private smoothing = 0.85;

  amplify(audioData: Float32Array, volume: number): Float32Array {
    // Cible de gain selon le volume détecté, puis lissage réel vers cette cible
    // (l'ancienne version mélangeait gain*s + gain*(1-s), ce qui s'annule toujours en gain — corrigé ici)
    let targetGain = this.gain;
    if (volume < 10) targetGain = Math.min(this.maxGain, this.gain + 0.1);
    else if (volume > 50) targetGain = Math.max(this.minGain, this.gain - 0.05);

    this.gain = this.gain * this.smoothing + targetGain * (1 - this.smoothing);

    const result = new Float32Array(audioData.length);
    for (let i = 0; i < audioData.length; i++) {
      result[i] = Math.max(-1, Math.min(1, audioData[i] * this.gain));
    }
    return result;
  }
}

class DivineVoiceRecognition {
  private recognition: any = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private mediaStream: MediaStream | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;

  private isListening = false;
  private restartAttempts = 0;
  private maxRestartAttempts = 6;
  private continuousMode = false;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private confidenceHistory: number[] = [];
  private lastVolumeCallbackAt = 0;

  private noiseFilter = new AdaptiveNoiseFilter();
  private whisperDetector = new WhisperDetector();
  private voiceAmplifier = new AdaptiveVoiceAmplifier();

  private onResultCallback: ((text: string, isFinal: boolean, confidence: number) => void) | null = null;
  private onVolumeCallback: ((volume: number, isWhisper: boolean) => void) | null = null;
  private onErrorCallback: ((error: string) => void) | null = null;

  // Vocabulaire métier (catégories + régions du Sénégal) pour corriger les transcriptions proches
  private commonWords = new Set<string>();

  constructor(extraVocabulary: string[] = []) {
    [
      'tomates', 'mil', 'oignons', 'mangues', 'bananes', 'ananas', 'papaye', 'orange', 'citron',
      'maïs', 'riz', 'sorgho', 'fonio', 'arachide', 'niébé', 'patate', 'manioc', 'igname', 'taro',
      'pomme de terre', 'poisson', 'thiof', 'sardinelle', 'yéboyé', 'soumbi', 'lait', 'yaourt',
      'beurre', 'fromage', 'dégué', 'engrais', 'urée', 'super phos', 'compost', 'fumier',
      ...extraVocabulary,
    ].forEach(w => this.commonWords.add(w.toLowerCase()));

    this.initRecognition();
  }

  private initRecognition(): void {
    if (typeof window === 'undefined') return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    this.recognition = new SpeechRecognition();
    this.recognition.lang = 'fr-FR';
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.maxAlternatives = 5;

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    if (!this.recognition) return;

    this.recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const alternatives: string[] = [];
        let bestConfidence = 0;

        for (let j = 0; j < result.length; j++) {
          alternatives.push(this.cleanText(result[j].transcript));
          bestConfidence = Math.max(bestConfidence, result[j].confidence || 0);
        }

        const text = this.enhanceTranscript(alternatives[0] || '', alternatives);
        if (!text) continue;

        if (result.isFinal) {
          this.confidenceHistory.push(bestConfidence);
          if (this.confidenceHistory.length > 10) this.confidenceHistory.shift();
          this.onResultCallback?.(text, true, bestConfidence);
          this.resetSilenceTimer();
        } else {
          this.onResultCallback?.(text, false, bestConfidence);
        }
      }
    };

    this.recognition.onerror = (event: any) => {
      const messages: Record<string, string> = {
        'not-allowed': '🔇 Permission microphone refusée',
        'no-speech': '🤫 Aucune parole détectée',
        'audio-capture': '🎤 Aucun microphone trouvé',
        network: '📡 Erreur réseau, reconnexion…',
        aborted: '⏹️ Écoute interrompue',
        'language-not-supported': '🌍 Langue non supportée',
        'service-not-allowed': '⛔ Service non autorisé',
      };
      this.onErrorCallback?.(messages[event.error] || `⚠️ Erreur : ${event.error}`);
      if (event.error !== 'not-allowed' && event.error !== 'audio-capture') this.restartListening();
      else this.stopListening();
    };

    this.recognition.onend = () => {
      this.isListening = false;
      if (this.continuousMode && this.restartAttempts < this.maxRestartAttempts) {
        setTimeout(() => { if (this.continuousMode && !this.isListening) this.startListening(true).catch(() => {}); }, 150);
      }
    };

    this.recognition.onstart = () => {
      this.isListening = true;
      this.restartAttempts = 0;
      this.startAudioProcessing();
    };
  }

  private enhanceTranscript(transcript: string, alternatives: string[]): string {
    const words = transcript.split(' ');
    const enhancedWords = words.map(word => {
      if (this.commonWords.has(word.toLowerCase())) return word;
      for (const alt of alternatives) {
        for (const altWord of alt.split(' ')) {
          if (this.commonWords.has(altWord.toLowerCase()) && this.levenshteinDistance(word.toLowerCase(), altWord.toLowerCase()) <= 2) {
            return altWord;
          }
        }
      }
      return word;
    });
    return enhancedWords.join(' ');
  }

  private levenshteinDistance(a: string, b: string): number {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    const matrix: number[][] = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        matrix[i][j] = b[i - 1] === a[j - 1]
          ? matrix[i - 1][j - 1]
          : Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
      }
    }
    return matrix[b.length][a.length];
  }

  startListening(continuous: boolean): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.recognition) { reject(new Error('Reconnaissance vocale non supportée sur ce navigateur')); return; }
      if (this.isListening) { resolve(); return; }

      this.continuousMode = continuous;
      this.recognition.continuous = continuous;

      this.requestMicrophonePermission()
        .then(() => { this.recognition.start(); resolve(); })
        .catch(reject);
    });
  }

  stopListening(): void {
    this.continuousMode = false;
    if (this.recognition && this.isListening) {
      try { this.recognition.stop(); } catch {}
    }
    this.isListening = false;
    this.stopAudioProcessing();
    if (this.silenceTimer) { clearTimeout(this.silenceTimer); this.silenceTimer = null; }
  }

  private restartListening(): void {
    if (this.restartAttempts >= this.maxRestartAttempts) {
      this.onErrorCallback?.('⚠️ Trop de tentatives de reconnexion');
      this.stopListening();
      return;
    }
    this.restartAttempts++;
    const delay = Math.min(1000 * Math.pow(1.5, this.restartAttempts), 5000);
    this.stopListening();
    setTimeout(() => { if (!this.isListening) this.startListening(this.continuousMode).catch(() => {}); }, delay);
  }

  private resetSilenceTimer(): void {
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    this.silenceTimer = setTimeout(() => { if (this.isListening) this.restartListening(); }, 8000);
  }

  private requestMicrophonePermission(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.mediaStream) { resolve(); return; }
      navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
        video: false,
      }).then(stream => { this.mediaStream = stream; resolve(); })
        .catch(error => reject(new Error('Permission microphone refusée : ' + error.message)));
    });
  }

  // Le ScriptProcessorNode est déprécié (remplacé par AudioWorklet) mais reste largement
  // supporté ; ici il ne sert qu'à la jauge de volume / détection de murmure, pas au flux
  // envoyé à la reconnaissance, donc le coût est négligeable.
  private startAudioProcessing(): void {
    if (!this.mediaStream) return;
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.8;

      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      source.connect(this.analyser);

      this.scriptProcessor = this.audioContext.createScriptProcessor(1024, 1, 1);
      this.scriptProcessor.onaudioprocess = (event) => {
        const inputData = event.inputBuffer.getChannelData(0);
        const whisper = this.whisperDetector.detect(inputData);
        const filtered = this.noiseFilter.filter(inputData);
        this.voiceAmplifier.amplify(filtered, whisper.volume);

        // Throttle : on ne pousse l'état React qu'~12x/s (et non à chaque bloc audio, ~47x/s)
        // pour rester fluide sur les téléphones d'entrée de gamme.
        const now = performance.now();
        if (now - this.lastVolumeCallbackAt > 80) {
          this.lastVolumeCallbackAt = now;
          this.onVolumeCallback?.(whisper.volume, whisper.isWhisper);
        }
      };

      this.analyser.connect(this.scriptProcessor);
      this.scriptProcessor.connect(this.audioContext.destination);
    } catch {
      // Traitement audio avancé indisponible (ex. navigateur restrictif) : la reconnaissance
      // de base continue de fonctionner sans jauge de volume / détection de murmure.
    }
  }

  private stopAudioProcessing(): void {
    if (this.scriptProcessor) { this.scriptProcessor.disconnect(); this.scriptProcessor = null; }
    if (this.audioContext) { this.audioContext.close(); this.audioContext = null; }
    if (this.mediaStream) { this.mediaStream.getTracks().forEach(t => t.stop()); this.mediaStream = null; }
  }

  private cleanText(text: string): string {
    return text.trim().replace(/\s+/g, ' ').replace(/[^a-zA-ZÀ-ÿ0-9\s\-',.?!]/g, '').replace(/\s+([,.?!])/g, '$1');
  }

  onResult(cb: (text: string, isFinal: boolean, confidence: number) => void) { this.onResultCallback = cb; }
  onVolume(cb: (volume: number, isWhisper: boolean) => void) { this.onVolumeCallback = cb; }
  onError(cb: (error: string) => void) { this.onErrorCallback = cb; }

  get isActive(): boolean { return this.isListening; }
  get isSupported(): boolean { return !!this.recognition; }

  destroy(): void { this.stopListening(); this.recognition = null; }
}

// ─────────────────────────────────────────────────────────────────────────────
export default function AgriMarket() {
  const router = useRouter();
  const { cart, addToCart } = useCart();
  const { user, logout } = useAuth();

  const [mounted,            setMounted]            = useState(false);
  const [products,           setProducts]           = useState<ProductData[]>([]);
  const [filtered,           setFiltered]           = useState<ProductData[]>([]);
  const [search,             setSearch]             = useState('');
  const [listening,          setListening]          = useState(false);
  const [voiceVolume,        setVoiceVolume]        = useState(0);
  const [voiceWhisper,       setVoiceWhisper]       = useState(false);
  const [voiceConfidence,    setVoiceConfidence]    = useState(0);
  const [voiceError,         setVoiceError]         = useState<string|null>(null);
  const [voiceSupported,     setVoiceSupported]     = useState(true);
  const [cat,                setCat]                = useState('Tous');
  const [sort,               setSort]               = useState<'default'|'asc'|'desc'>('default');
  const [wishlist,           setWishlist]           = useState<Set<string>>(new Set());
  const [showUserMenu,       setShowUserMenu]       = useState(false);
  const [showSort,           setShowSort]           = useState(false);
  const [location,           setLocation]           = useState<{address:string;lat:number;lng:number;precision:number;detailedAddress?:string;region?:string}|null>(null);
  const [locStatus,          setLocStatus]          = useState<'searching'|'found'|'error'>('searching');
  const [addedIds,           setAddedIds]           = useState<Set<string>>(new Set());
  const [selected,           setSelected]           = useState<ProductData|null>(null);
  const [imgIdx,             setImgIdx]             = useState(0);
  const [cardImgIdx,         setCardImgIdx]         = useState<Map<string,number>>(new Map());
  const [recImgIdx,          setRecImgIdx]          = useState<Map<string,number>>(new Map());
  const [scrolled,           setScrolled]           = useState(false);
  const [ratings,            setRatings]            = useState<Map<string,SellerRating>>(new Map());
  const [heroVisible,        setHeroVisible]        = useState(false);

  const drawerRef = useRef<HTMLDivElement>(null);
  const voiceRef  = useRef<DivineVoiceRecognition | null>(null);

  const getCardImg = (id: string) => cardImgIdx.get(id) || 0;
  const setCardImg = (id: string, idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setCardImgIdx(prev => { const m = new Map(prev); m.set(id, idx); return m; });
  };
  const getRecImg = (id: string) => recImgIdx.get(id) || 0;
  const setRecImg = (id: string, idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setRecImgIdx(prev => { const m = new Map(prev); m.set(id, idx); return m; });
  };

  const cartCount = cart?.itemCount || 0;

  useEffect(() => { setMounted(true); setTimeout(() => setHeroVisible(true), 100); }, []);
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', fn, { passive: true });
    return () => window.removeEventListener('scroll', fn);
  }, []);

  useEffect(() => {
    const vocab = [...CATEGORIES.map(c => c.label), ...REGIONS_SENEGAL];
    const engine = new DivineVoiceRecognition(vocab);
    voiceRef.current = engine;
    setVoiceSupported(engine.isSupported);

    engine.onResult((text, isFinal, confidence) => {
      setSearch(text);
      setVoiceConfidence(confidence);
      if (isFinal) {
        // Vibration de confirmation mais on garde l'écoute active (mode continu)
        // L'utilisateur arrête lui-même en appuyant sur le bouton micro.
        if (navigator.vibrate) navigator.vibrate([10, 5, 10]);
      }
    });

    engine.onVolume((volume, isWhisper) => {
      setVoiceVolume(volume);
      setVoiceWhisper(isWhisper);
    });

    engine.onError((message) => {
      setVoiceError(message);
      setListening(false);
      setVoiceVolume(0);
    });

    return () => engine.destroy();
  }, []);

  const startVoice = useCallback(() => {
    if (!voiceRef.current) return;
    setVoiceError(null);
    voiceRef.current.startListening(true)
      .then(() => setListening(true))
      .catch((e: Error) => { setVoiceError(e.message); setListening(false); });
  }, []);

  const stopVoice = useCallback(() => {
    voiceRef.current?.stopListening();
    setListening(false);
    setVoiceVolume(0);
  }, []);

  const toggleVoice = useCallback(() => { listening ? stopVoice() : startVoice(); }, [listening, startVoice, stopVoice]);

  useEffect(() => {
    const u = onSnapshot(collection(db, 'products'), snap => {
      const d = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as ProductData[];
      setProducts(d); setFiltered(d);
    });
    return () => u();
  }, []);

  // ── ANNONCES (Firestore collection 'ads') ──
  const [ads, setAds] = useState<any[]>([]);
  const [adIdx, setAdIdx] = useState(0);
  useEffect(() => {
    const u = onSnapshot(
      query(collection(db, 'ads'), where('active', '==', true)),
      snap => {
        const list = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a: any, b: any) => (b.priority ?? 0) - (a.priority ?? 0));
        setAds(list);
        setAdIdx(0);
      },
      // Erreur silencieuse — ads optionnelles, ne pas crasher si permission manquante
      (err) => { console.warn('ads listener ignoré:', err.code); }
    );
    return () => u();
  }, []);
  useEffect(() => {
    if (ads.length <= 1) return;
    const t = setInterval(() => setAdIdx(i => (i + 1) % ads.length), 4500);
    return () => clearInterval(t);
  }, [ads.length]);


  useEffect(() => {
    if (!products.length) return;

    // ✅ on garde les fonctions de désabonnement et on les appelle au
    //    nettoyage de l'effet — avant, aucun `unsub` n'était même conservé,
    //    donc les listeners Firestore s'accumulaient à chaque changement
    //    de la liste de produits, sans jamais se fermer.
    const unsubs = [...new Set(products.map(p => p.sellerId).filter((sid): sid is string => !!sid))].map(sid =>
      onSnapshot(query(collection(db, 'reviews'), where('sellerId', '==', sid)), snap => {
        const revs = snap.docs.map(d => d.data());
        const cnt = revs.length;
        const avg = cnt ? revs.reduce((s: number, r: any) => s + (r.rating || 0), 0) / cnt : 0;
        setRatings(prev => { const m = new Map(prev); m.set(sid, { sellerId: sid, averageRating: +avg.toFixed(1), reviewCount: cnt }); return m; });
      })
    );

    return () => unsubs.forEach(unsub => unsub());
  }, [products]);

  // ============================================================
  // ✅ RECOMMANDATIONS PRODUIT — région, producteur, proximité réelle, catégorie
  //    Remplace l'ancien double affichage ("Autres produits dans X" +
  //    "Produits similaires") qui dupliquait exactement le même filtre.
  //    Les sections "saison" et "populaire" de la version précédente ont été
  //    retirées : elles reposaient sur des données simulées/aléatoires
  //    (Math.random() pour la note, liste figée pour la saison) qui n'apportaient
  //    aucune valeur réelle et pouvaient induire l'utilisateur en erreur.
  // ============================================================
  const distanceKm = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const R = 6371, toRad = (d: number) => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLng/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  };

  const recommendationSections = useMemo(() => {
    if (!selected) return [] as { title: string; badge: string; items: ProductData[]; distances?: Map<string, number> }[];
    const others = products.filter(p => p.id !== selected.id);
    const sections: { title: string; badge: string; items: ProductData[]; distances?: Map<string, number> }[] = [];

    // 1. Région de l'utilisateur (uniquement si une région réelle a été détectée/choisie)
    if (location?.region) {
      const sameRegion = others.filter(p => (p.region || '').toLowerCase() === location.region!.toLowerCase());
      if (sameRegion.length > 0) {
        sections.push({ title: `Populaire en ${location.region}`, badge: '📍 Région', items: sameRegion.slice(0, 6) });
      }
    }

    // 2. Même producteur
    if (selected.farmer) {
      const sameFarmer = others.filter(p => p.farmer === selected.farmer);
      if (sameFarmer.length > 0) {
        sections.push({ title: `Autres produits de ${selected.farmer}`, badge: '👨\u200d🌾 Producteur', items: sameFarmer.slice(0, 6) });
      }
    }

    // 3. Proximité réelle (distance calculée à partir de la position GPS détectée)
    if (location?.lat && location?.lng) {
      const distances = new Map<string, number>();
      const nearby = others
        .filter(p => p.lat !== undefined && p.lng !== undefined)
        .map(p => { distances.set(p.id, distanceKm(location.lat, location.lng, p.lat!, p.lng!)); return p; })
        .sort((a, b) => (distances.get(a.id) ?? 0) - (distances.get(b.id) ?? 0));
      if (nearby.length > 0) {
        sections.push({ title: 'Près de chez vous', badge: '📍 Proche', items: nearby.slice(0, 6), distances });
      }
    }

    // 4. Même catégorie (toujours présent en dernier recours pour ne jamais laisser le drawer vide)
    const sameCategory = others.filter(p => p.category === selected.category);
    if (sameCategory.length > 0) {
      sections.push({ title: 'Dans la même catégorie', badge: '📂 Catégorie', items: sameCategory.slice(0, 6) });
    }

    return sections;
  }, [selected, products, location]);

  // ── Lecture de la localisation sauvegardée par /main/location ──
  useEffect(() => {
    try {
      const raw = localStorage.getItem('agrimarche_location');
      if (!raw) { setLocStatus('found'); return; }
      const saved = JSON.parse(raw);
      setLocation({
        address: saved.address,
        lat: saved.lat,
        lng: saved.lng,
        precision: saved.precision,
        detailedAddress: saved.detailedAddress,
        region: saved.region,
      });
      setLocStatus('found');
    } catch {
      setLocStatus('found');
    }
  }, []);



  useEffect(() => {
    let r = [...products];
    // Exclure les produits en rupture de stock
    r = r.filter(p => p.stock === undefined || p.stock === null || p.stock > 0);
    if (search) r = r.filter(p => p.name?.toLowerCase().includes(search.toLowerCase()));
    if (cat !== 'Tous') r = r.filter(p => p.category === cat);
    if (sort === 'asc')  r.sort((a,b) => (a.price||0)-(b.price||0));
    if (sort === 'desc') r.sort((a,b) => (b.price||0)-(a.price||0));
    setFiltered(r);
  }, [products, search, cat, sort]);

  const open  = (p: ProductData) => { setSelected(p); setImgIdx(0); document.body.style.overflow = 'hidden'; };
  const close = () => { setSelected(null); document.body.style.overflow = ''; };
  
  // ✅ Correction : conversion explicite pour addToCart
  const addCart = (p: ProductData, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const productForCart = {
      id: p.id,
      name: p.name,
      price: p.price,
      unit: p.unit,
      category: p.category,
      images: p.images || [],
      stock: p.stock || 999,
    };
    addToCart(productForCart as any, 1);
    setAddedIds(prev => new Set(prev).add(p.id));
    setTimeout(() => setAddedIds(prev => { const s = new Set(prev); s.delete(p.id); return s; }), 2200);
  };
  
  const toggleWish = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setWishlist(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  };
  
  const wa = (name: string, phone?: string, productId?: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (analytics) {
      logEvent(analytics, 'whatsapp_click', { product_name: name });
    }
    if (productId) {
      updateDoc(doc(db, 'products', productId), {
        whatsappClicks: increment(1),
      }).catch(err => console.error('Erreur increment whatsappClicks:', err));
    }
    window.open(`https://wa.me/${phone?.replace(/\D/g,'') || WA_NUMBER}?text=${encodeURIComponent(`Bonjour, je suis intéressé par "${name}".`)}`, '_blank');
  };

  if (!mounted) return null;

  return (
    <>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;0,700;1,300;1,400;1,600;1,700&family=DM+Sans:wght@300;400;500;600;700&family=Italiana&display=swap');

        :root {
          --snow:       #FFFFFF;
          --pearl:      #F8FAF8;
          --alabaster:  #F2F7F3;
          --mist:       #E8F2EB;
          --silk:       #D6EAD9;
          --veil:       rgba(255,255,255,0.85);

          --forest:     #0D4A1F;
          --emerald:    #1A6B35;
          --jade:       #25894A;
          --fern:       #3CAD63;
          --sage:       #6EC98A;
          --mint:       #A8E8BC;
          --celadon:    #C8F0D4;

          --ink:        #0A1F0F;
          --moss:       rgba(13,74,31,0.08);
          --vines:      rgba(13,74,31,0.14);
          --leaf:       rgba(37,137,74,0.18);

          --border:     rgba(13,74,31,0.12);
          --border2:    rgba(13,74,31,0.22);

          --text:       #0D2E15;
          --mtext:      rgba(13,46,21,0.6);
          --dtext:      rgba(13,46,21,0.35);

          --shadow-sm:  0 2px 12px rgba(13,74,31,0.08);
          --shadow-md:  0 8px 32px rgba(13,74,31,0.12);
          --shadow-lg:  0 24px 64px rgba(13,74,31,0.16);
          --shadow-xl:  0 40px 100px rgba(13,74,31,0.2);
        }

        *, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }
        html { scroll-behavior:smooth; }

        body {
          font-family: 'DM Sans', sans-serif;
          background: var(--pearl);
          color: var(--text);
          min-height: 100vh;
          overflow-x: hidden;
        }

        body::before {
          content:'';
          position:fixed; inset:0; pointer-events:none; z-index:0;
          background:
            radial-gradient(ellipse 80% 60% at 10% 0%, rgba(168,232,188,0.35) 0%, transparent 60%),
            radial-gradient(ellipse 60% 80% at 90% 100%, rgba(200,240,212,0.4) 0%, transparent 55%),
            radial-gradient(ellipse 50% 50% at 50% 50%, rgba(242,247,243,1) 0%, var(--pearl) 100%);
        }

        body::after {
          content:'';
          position:fixed; inset:0; pointer-events:none; z-index:9999;
          background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='400' height='400' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E");
          opacity:0.018; mix-blend-mode:multiply;
        }

        ::-webkit-scrollbar { width:3px; }
        ::-webkit-scrollbar-track { background:var(--alabaster); }
        ::-webkit-scrollbar-thumb { background:var(--sage); border-radius:2px; }

        .g-header {
          position:sticky; top:0; z-index:200;
          background:rgba(248,250,248,0.92);
          border-bottom:1px solid var(--border);
          transition:all 0.5s cubic-bezier(.16,1,.3,1);
        }
        .g-header.scrolled {
          background:rgba(255,255,255,0.96);
          backdrop-filter:blur(32px) saturate(1.8);
          -webkit-backdrop-filter:blur(32px) saturate(1.8);
          border-bottom-color:var(--border2);
          box-shadow:
            0 1px 0 rgba(255,255,255,0.9),
            var(--shadow-md);
        }

        .g-header-inner {
          max-width:1400px; margin:0 auto;
          padding:16px 20px 0;
          position:relative; z-index:1;
        }

        .g-logo-row {
          display:flex; align-items:center; justify-content:space-between;
        }
        .g-logo-link { display:flex; align-items:center; gap:14px; text-decoration:none; }

        .g-wordmark { display:flex; flex-direction:column; gap:0; }
        .g-wordmark-main {
          font-family:'Italiana', serif;
          font-size:30px;
          letter-spacing:0.06em;
          line-height:1;
          background:linear-gradient(135deg, var(--forest) 0%, var(--emerald) 45%, var(--jade) 100%);
          -webkit-background-clip:text;
          -webkit-text-fill-color:transparent;
          background-clip:text;
        }
        .g-wordmark-sub {
          font-family:'DM Sans', sans-serif;
          font-size:7px;
          letter-spacing:0.38em;
          color:var(--sage);
          font-weight:600;
          margin-top:2px;
          text-transform:uppercase;
        }

        .g-header-right { display:flex; align-items:center; gap:8px; position:relative; }

        .g-icon-btn {
          width:40px; height:40px;
          background:var(--veil);
          border:1px solid var(--border);
          border-radius:12px;
          display:flex; align-items:center; justify-content:center;
          cursor:pointer; font-size:17px;
          transition:all 0.25s cubic-bezier(.34,1.56,.64,1);
          color:var(--text); text-decoration:none;
          box-shadow:var(--shadow-sm);
          position:relative;
        }
        .g-icon-btn:hover {
          background:var(--snow);
          border-color:var(--border2);
          transform:translateY(-1px);
          box-shadow:var(--shadow-md);
        }
        
        .cart-badge {
          position:absolute;
          top:-6px;
          right:-6px;
          background:linear-gradient(135deg, var(--emerald), var(--jade));
          color:white;
          font-size:9px;
          font-weight:700;
          min-width:18px;
          height:18px;
          border-radius:50%;
          display:flex;
          align-items:center;
          justify-content:center;
          padding:0 4px;
          box-shadow:0 2px 6px rgba(0,0,0,0.2);
        }

        .g-search-row { padding:14px 0 16px; }
        .g-search-box {
          position:relative;
          background:var(--snow);
          border:1.5px solid var(--border);
          border-radius:100px;
          display:flex; align-items:center;
          transition:all 0.35s cubic-bezier(.16,1,.3,1);
          overflow:hidden;
          box-shadow:var(--shadow-sm);
        }
        .g-search-box:focus-within {
          background:var(--snow);
          border-color:var(--jade);
          box-shadow:0 0 0 4px rgba(37,137,74,0.1), var(--shadow-md);
        }
        .g-search-ic {
          padding:0 14px 0 20px;
          color:var(--sage);
          font-size:15px; flex-shrink:0; pointer-events:none;
        }
        .g-search-input {
          flex:1; height:50px;
          background:transparent; border:none; outline:none;
          font-family:'DM Sans', sans-serif;
          font-size:13.5px; font-weight:400;
          color:var(--text); letter-spacing:0.01em;
        }
        .g-search-input::placeholder { color:var(--dtext); }
        .g-mic-btn {
          margin:5px; width:40px; height:40px;
          background:var(--alabaster);
          border:1px solid var(--border);
          border-radius:100px;
          display:flex; align-items:center; justify-content:center;
          cursor:pointer; font-size:16px;
          transition:all 0.3s ease; flex-shrink:0;
          color:var(--mtext);
        }
        .g-mic-btn:hover { background:var(--mist); color:var(--jade); border-color:var(--border2); }
        .g-mic-btn.on {
          background:linear-gradient(135deg,var(--emerald),var(--jade));
          color:#fff; border-color:transparent;
          animation:g-ring 1.2s ease-in-out infinite;
        }
        @keyframes g-ring {
          0%,100% { box-shadow:0 0 0 0 rgba(37,137,74,0.5); }
          50%      { box-shadow:0 0 0 12px rgba(37,137,74,0); }
        }
        .g-mic-btn.whisper {
          background:linear-gradient(135deg,#e67e22,#f39c12);
          animation:g-ring-amber 1s ease-in-out infinite;
        }
        @keyframes g-ring-amber {
          0%,100% { box-shadow:0 0 0 0 rgba(243,156,18,0.45); }
          50%      { box-shadow:0 0 0 12px rgba(243,156,18,0); }
        }

        .g-voice-pop {
          position:absolute;
          right:10px; bottom:calc(100% + 10px);
          background:var(--snow);
          border:1px solid var(--border);
          border-radius:16px;
          padding:10px 14px;
          display:flex; align-items:center; gap:10px;
          box-shadow:var(--shadow-md);
          animation:g-pop-in 0.25s cubic-bezier(.34,1.56,.64,1);
          z-index:60;
          white-space:nowrap;
        }
        .g-voice-pop.whisper { border-color:#f39c12; }
        .g-voice-waves { display:flex; align-items:center; gap:3px; height:24px; }
        .g-voice-wave {
          width:3px; min-height:3px; border-radius:2px;
          background:linear-gradient(to top,var(--jade),var(--emerald));
          transition:height 0.08s ease;
        }
        .g-voice-pop.whisper .g-voice-wave { background:linear-gradient(to top,#f39c12,#e67e22); }
        .g-voice-status { font-size:11px; font-weight:600; color:var(--mtext); }
        .g-voice-conf {
          font-size:10px; font-weight:800; color:var(--jade);
          background:rgba(37,137,74,0.1); border-radius:8px; padding:2px 6px;
        }
        @keyframes g-pop-in {
          from { opacity:0; transform:translateY(6px) scale(0.96); }
          to   { opacity:1; transform:translateY(0) scale(1); }
        }

        .g-voice-toast {
          margin-top:8px;
          font-size:12px; font-weight:600;
          color:#b9450a;
          background:rgba(243,156,18,0.1);
          border:1px solid rgba(243,156,18,0.25);
          border-radius:10px;
          padding:8px 12px;
          animation:g-toast-life 4s ease forwards;
        }
        @keyframes g-toast-life {
          0%   { opacity:0; transform:translateY(-4px); }
          10%  { opacity:1; transform:translateY(0); }
          85%  { opacity:1; }
          100% { opacity:0; }
        }

        @media(max-width:480px) {
          .g-voice-pop { right:0; left:0; justify-content:center; }
        }

        .g-cats {
          position:sticky; top:118px; z-index:190;
          background:rgba(248,250,248,0.95);
          backdrop-filter:blur(20px);
          border-bottom:1px solid var(--border);
          overflow-x:auto; scrollbar-width:none;
        }
        .g-cats::-webkit-scrollbar { display:none; }
        .g-cats-inner {
          display:flex; gap:5px; padding:10px 16px; min-width:max-content;
        }

        .g-cat {
          display:inline-flex; align-items:center; gap:6px;
          padding:8px 16px; border-radius:100px;
          border:1.5px solid transparent;
          background:transparent;
          font-family:'DM Sans', sans-serif;
          font-size:11px; font-weight:500;
          color:var(--mtext); cursor:pointer; white-space:nowrap;
          transition:all 0.22s cubic-bezier(.34,1.56,.64,1);
          letter-spacing:0.01em;
        }
        .g-cat:hover {
          background:var(--mist);
          color:var(--emerald);
          border-color:var(--border2);
          box-shadow:var(--shadow-sm);
        }
        .g-cat.on {
          background:linear-gradient(135deg,var(--emerald),var(--jade));
          color:#fff; border-color:transparent;
          font-weight:700;
          box-shadow:0 4px 18px rgba(37,137,74,0.3), inset 0 1px 0 rgba(255,255,255,0.2);
          transform:scale(1.04);
        }
        .g-cat-ic { font-size:13px; }

        .g-toolbar {
          position:sticky; top:172px; z-index:180;
          background:rgba(248,250,248,0.96);
          backdrop-filter:blur(16px);
          border-bottom:1px solid var(--border);
          padding:10px 20px;
          display:flex; align-items:center; justify-content:space-between; gap:12px;
        }

        .g-loc-chip {
          display:flex; align-items:center; gap:8px;
          padding:7px 14px;
          background:var(--mist);
          border:1.5px solid var(--border2);
          border-radius:100px; cursor:pointer;
          transition:all 0.25s ease; min-width:0;
          box-shadow:var(--shadow-sm);
        }
        .g-loc-chip:hover { background:var(--silk); border-color:var(--jade); box-shadow:var(--shadow-md); }
        .g-loc-pulse {
          width:8px; height:8px; border-radius:50%;
          background:var(--jade); flex-shrink:0;
          box-shadow:0 0 0 3px rgba(37,137,74,0.2);
          transition:background 0.3s;
        }
        .g-loc-pulse.searching { background:#F59E0B; animation:g-blink 1s ease-in-out infinite; }
        .g-loc-pulse.error     { background:#EF4444; }
        @keyframes g-blink { 0%,100%{opacity:1} 50%{opacity:0.2} }
        .g-loc-text {
          font-size:11px; font-weight:600; color:var(--emerald);
          white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:180px;
        }

        .g-sort-trigger {
          display:flex; align-items:center; gap:6px; padding:7px 14px;
          background:var(--snow);
          border:1.5px solid var(--border);
          border-radius:100px;
          font-family:'DM Sans', sans-serif;
          font-size:11px; font-weight:600; color:var(--mtext);
          cursor:pointer; white-space:nowrap;
          transition:all 0.25s ease; letter-spacing:0.03em; flex-shrink:0;
          box-shadow:var(--shadow-sm);
        }
        .g-sort-trigger:hover { background:var(--mist); color:var(--emerald); border-color:var(--border2); }
        .g-sort-trigger.on    { background:var(--mist); color:var(--emerald); border-color:var(--jade); }

        .g-sort-menu {
          position:absolute; right:0; top:calc(100%+8px);
          background:var(--snow);
          border:1.5px solid var(--border2);
          border-radius:18px; overflow:hidden;
          min-width:190px;
          box-shadow:var(--shadow-lg), 0 0 0 1px rgba(255,255,255,0.8) inset;
          animation:g-pop 0.2s cubic-bezier(.34,1.56,.64,1);
          z-index:9;
        }
        @keyframes g-pop {
          from { opacity:0; transform:translateY(-10px) scale(0.95); }
          to   { opacity:1; transform:translateY(0) scale(1); }
        }
        .g-sort-item {
          display:flex; align-items:center; justify-content:space-between;
          padding:12px 18px; font-size:12px; font-weight:500; color:var(--mtext);
          cursor:pointer; transition:all 0.2s; border:none; background:none; width:100%;
        }
        .g-sort-item:hover { background:var(--mist); color:var(--text); }
        .g-sort-item.on    { color:var(--jade); font-weight:700; }

        .g-main { max-width:1400px; margin:0 auto; padding:28px 16px 140px; position:relative; z-index:1; }

        .g-section-head {
          display:flex; align-items:baseline; gap:16px;
          margin-bottom:22px; padding-bottom:16px;
          border-bottom:1px solid var(--border);
        }
        .g-section-title {
          font-family:'Cormorant Garamond', serif;
          font-size:26px; font-weight:600; font-style:italic;
          color:var(--forest);
        }
        .g-section-line {
          flex:1; height:1px;
          background:linear-gradient(90deg, var(--sage) 0%, transparent 100%);
          opacity:0.5;
        }
        .g-section-badge {
          font-family:'DM Sans', sans-serif;
          font-size:9px; font-weight:700;
          letter-spacing:0.15em; color:var(--sage);
        }

        .g-grid {
          display:grid; grid-template-columns:repeat(3,1fr); gap:8px;
        }
        @media(min-width:600px)  { .g-grid { grid-template-columns:repeat(4,1fr); gap:12px; } }
        @media(min-width:900px)  { .g-grid { grid-template-columns:repeat(5,1fr); gap:16px; } }
        @media(min-width:1200px) { .g-grid { grid-template-columns:repeat(6,1fr); } }

        .g-card {
          background:var(--snow);
          border:1.5px solid var(--border);
          border-radius:22px;
          overflow:hidden; cursor:pointer; position:relative;
          opacity:0;
          animation:g-rise 0.6s cubic-bezier(.16,1,.3,1) forwards;
          transition:
            transform 0.45s cubic-bezier(.34,1.4,.64,1),
            border-color 0.3s,
            box-shadow 0.45s;
          will-change:transform;
          box-shadow:var(--shadow-sm);
        }
        @keyframes g-rise {
          from { opacity:0; transform:translateY(36px) scale(0.96); }
          to   { opacity:1; transform:translateY(0) scale(1); }
        }
        .g-card:hover {
          transform:translateY(-12px) scale(1.02);
          border-color:var(--jade);
          box-shadow:
            var(--shadow-xl),
            0 0 0 1px rgba(37,137,74,0.2),
            inset 0 1px 0 rgba(255,255,255,0.8);
        }

        .g-card.hero { grid-column:span 2; }
        .g-card.hero .g-card-visual { aspect-ratio:16/9; }

        .g-card-visual {
          aspect-ratio:1; position:relative; overflow:hidden;
          background:var(--alabaster);
        }
        .g-card-visual > span {
          transition:transform 0.65s cubic-bezier(.16,1,.3,1);
        }
        .g-card:hover .g-card-visual > span { transform:scale(1.09); }

        .g-card-fog {
          position:absolute; inset:0;
          background:linear-gradient(
            to top,
            rgba(13,74,31,0.75) 0%,
            rgba(13,74,31,0.2) 40%,
            transparent 70%
          );
          transition:opacity 0.35s;
        }
        .g-card:hover .g-card-fog { opacity:0.9; }

        /* ── Carousel flèches + dots ── */
        .g-carr-arrow {
          position:absolute; top:50%; transform:translateY(-50%);
          width:28px; height:28px; border-radius:50%;
          background:rgba(255,255,255,0.82); backdrop-filter:blur(8px);
          border:1px solid rgba(255,255,255,0.5);
          color:var(--forest); font-size:18px; font-weight:700;
          display:flex; align-items:center; justify-content:center;
          cursor:pointer; z-index:4; padding:0; line-height:1;
          opacity:0; transition:opacity 0.2s, transform 0.2s;
          box-shadow:0 2px 12px rgba(0,0,0,0.18);
        }
        .g-carr-arrow.left  { left:7px; }
        .g-carr-arrow.right { right:7px; }
        .g-card:hover .g-carr-arrow { opacity:1; }
        .g-carr-arrow:hover { background:rgba(255,255,255,0.97); transform:translateY(-50%) scale(1.12); }

        .g-carr-dots {
          position:absolute; bottom:8px; left:0; right:0;
          display:flex; justify-content:center; gap:5px; z-index:4;
        }
        .g-carr-dot {
          width:5px; height:5px; border-radius:50%;
          border:none; cursor:pointer; padding:0;
          background:rgba(255,255,255,0.45);
          transition:all 0.2s;
        }
        .g-carr-dot.on {
          width:14px; border-radius:3px;
          background:#fff;
        }

        .g-card-price {
          position:absolute; bottom:6px; left:8px; right:8px;
          display:flex; align-items:flex-end; justify-content:space-between;
        }
        .g-price-n {
          font-family:'Cormorant Garamond', serif;
          font-size:16px; font-weight:700; color:#fff;
          letter-spacing:0.01em; line-height:1;
          text-shadow:0 2px 8px rgba(0,0,0,0.4);
        }
        .g-price-u {
          font-size:7px; color:rgba(255,255,255,0.7);
          margin-bottom:1px; font-weight:500; letter-spacing:0.04em;
        }

        .g-verified {
          position:absolute; top:10px; left:10px;
          background:linear-gradient(135deg,var(--emerald),var(--jade));
          color:#fff;
          font-family:'DM Sans', sans-serif;
          font-size:6px; font-weight:800;
          letter-spacing:0.08em; padding:2px 6px;
          border-radius:100px;
          box-shadow:0 4px 14px rgba(37,137,74,0.45);
        }

        .g-wish {
          position:absolute; top:10px; right:10px;
          width:34px; height:34px;
          background:rgba(255,255,255,0.75);
          backdrop-filter:blur(12px);
          border:1.5px solid rgba(255,255,255,0.6);
          border-radius:50%;
          display:flex; align-items:center; justify-content:center;
          cursor:pointer; font-size:11px;
          transition:all 0.3s cubic-bezier(.34,1.56,.64,1);
          color:var(--mtext);
          box-shadow:var(--shadow-sm);
        }
        .g-wish:hover { transform:scale(1.2); background:rgba(255,255,255,0.92); color:var(--emerald); }
        .g-wish.on    { background:rgba(239,68,68,0.85); color:#fff; border-color:transparent; }

        .g-card-body { padding:8px 9px 10px; }

        .g-card-cat {
          font-size:7px; font-weight:700;
          letter-spacing:0.12em; color:var(--sage);
          text-transform:uppercase; margin-bottom:3px;
        }

        .g-card-name {
          font-family:'Cormorant Garamond', serif;
          font-size:13px; font-weight:600; color:var(--text);
          line-height:1.2; margin-bottom:4px;
          display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;
          overflow:hidden;
        }

        .g-card-desc {
          font-size: 9px;
          color: var(--mtext);
          margin: 2px 0 4px;
          line-height: 1.35;
          overflow: hidden;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
        }
        .g-card-farmer {
          display:flex; align-items:center; gap:4px; margin-bottom:5px;
        }
        .g-farmer-avatar {
          width:12px; height:12px;
          background:linear-gradient(135deg,var(--emerald),var(--fern));
          border-radius:50%; display:flex; align-items:center; justify-content:center;
          font-size:6px; flex-shrink:0;
        }
        .g-farmer-name { font-size:9px; color:var(--dtext); font-weight:500; }

        .g-stars { display:flex; align-items:center; gap:1px; margin-bottom:6px; }

        .g-card-actions { display:flex; gap:5px; }

        .g-wa-btn {
          flex:1; height:28px;
          background:linear-gradient(135deg,var(--emerald),var(--fern));
          border:none; border-radius:9px; color:#fff;
          font-family:'DM Sans', sans-serif;
          font-size:8px; font-weight:700; letter-spacing:0.04em;
          cursor:pointer;
          display:flex; align-items:center; justify-content:center; gap:5px;
          transition:all 0.3s ease;
          box-shadow:0 4px 16px rgba(37,137,74,0.3);
        }
        .g-wa-btn:hover { transform:translateY(-2px); box-shadow:0 8px 24px rgba(37,137,74,0.45); }

        .g-add-btn {
          width:28px; height:28px;
          background:var(--alabaster);
          border:1.5px solid var(--border);
          border-radius:9px;
          color:var(--mtext); font-size:14px;
          cursor:pointer; flex-shrink:0;
          display:flex; align-items:center; justify-content:center;
          transition:all 0.3s cubic-bezier(.34,1.56,.64,1);
          font-weight:300;
        }
        .g-add-btn:hover { background:var(--mist); color:var(--jade); border-color:var(--jade); transform:scale(1.1); }
        .g-add-btn.done  { background:linear-gradient(135deg,var(--emerald),var(--jade)); color:#fff; border-color:transparent; }

        .g-empty { grid-column:1/-1; text-align:center; padding:80px 20px; }
        .g-empty-glyph {
          font-family:'Italiana', serif;
          font-size:80px; color:var(--mint); letter-spacing:0.05em;
          display:block; margin-bottom:16px; line-height:1;
        }
        .g-empty-title {
          font-family:'Cormorant Garamond', serif;
          font-size:28px; font-style:italic; font-weight:600;
          color:var(--mtext); margin-bottom:8px;
        }
        .g-empty-sub { font-size:13px; color:var(--dtext); margin-bottom:24px; }
        .g-empty-btn {
          display:inline-flex; align-items:center; gap:8px;
          padding:13px 34px;
          background:linear-gradient(135deg,var(--emerald),var(--jade));
          border:none; border-radius:100px;
          color:#fff; font-weight:700; font-size:12px;
          letter-spacing:0.1em; cursor:pointer;
          transition:all 0.3s ease;
          box-shadow:0 8px 28px rgba(37,137,74,0.35);
        }
        .g-empty-btn:hover { transform:translateY(-3px); box-shadow:0 16px 40px rgba(37,137,74,0.5); }

        .g-nav {
          position:fixed; bottom:0; left:0; right:0; z-index:300;
          background:rgba(255,255,255,0.96);
          backdrop-filter:blur(24px) saturate(1.8);
          -webkit-backdrop-filter:blur(24px) saturate(1.8);
          border-top:1.5px solid var(--border);
          box-shadow:0 -20px 60px rgba(13,74,31,0.1), 0 -1px 0 rgba(255,255,255,0.9);
          padding-bottom:env(safe-area-inset-bottom);
        }
        .g-nav-inner {
          max-width:480px; margin:0 auto;
          display:flex; align-items:center; justify-content:space-around;
          padding:8px 0 12px;
        }
        .g-nav-btn {
          display:flex; flex-direction:column; align-items:center; gap:3px;
          background:none; border:none; cursor:pointer;
          color:var(--dtext); text-decoration:none;
          padding:4px 10px; border-radius:14px;
          transition:all 0.25s ease;
        }
        .g-nav-btn:hover { color:var(--mtext); }
        .g-nav-btn.on    { color:var(--emerald); }
        .g-nav-ic { font-size:20px; line-height:1; }
        .g-nav-lbl {
          font-family:'DM Sans', sans-serif;
          font-size:7px; font-weight:700; letter-spacing:0.12em;
        }
        .g-nav-ia .g-nav-ic { color:#8e44ad; }
        .g-nav-ia .g-nav-lbl { color:#8e44ad; }
        .g-nav-ia:hover { color:#8e44ad; }

        .g-nav-cta {
          display:flex; flex-direction:column; align-items:center; gap:4px;
          background:none; border:none; cursor:pointer;
          position:relative; top:-14px;
        }
        .g-nav-cta-ring {
          width:60px; height:60px;
          background:linear-gradient(145deg,var(--fern),var(--emerald),var(--forest));
          border-radius:20px;
          display:flex; align-items:center; justify-content:center;
          box-shadow:
            0 8px 32px rgba(37,137,74,0.5),
            0 0 0 1px rgba(255,255,255,0.3),
            0 0 0 3px rgba(37,137,74,0.15),
            inset 0 1px 0 rgba(255,255,255,0.3);
          transition:all 0.4s cubic-bezier(.34,1.56,.64,1);
          color:#fff;
        }
        .g-nav-cta:hover .g-nav-cta-ring {
          transform:scale(1.12) rotate(-5deg);
          box-shadow:0 16px 48px rgba(37,137,74,0.65);
        }
        .g-nav-cta-lbl {
          font-size:6.5px; font-weight:800; letter-spacing:0.12em;
          color:var(--sage);
        }

        .g-user-menu {
          position:absolute; right:0; top:calc(100%+10px);
          width:240px;
          background:var(--snow);
          border:1.5px solid var(--border2);
          border-radius:22px; overflow:hidden;
          box-shadow:var(--shadow-xl), inset 0 1px 0 rgba(255,255,255,0.9);
          animation:g-pop 0.2s cubic-bezier(.34,1.56,.64,1);
          z-index:500;
        }
        .g-um-head {
          padding:16px 18px;
          border-bottom:1px solid var(--border);
          background:linear-gradient(135deg,var(--mist),var(--alabaster));
        }
        .g-um-role {
          font-size:8px; font-weight:800; letter-spacing:0.18em;
          color:var(--sage); margin-bottom:3px;
        }
        .g-um-email {
          font-size:12px; font-weight:500; color:var(--text);
          overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
        }
        .g-um-item {
          display:flex; align-items:center; gap:10px;
          padding:11px 18px;
          font-size:12px; font-weight:500; color:var(--mtext);
          cursor:pointer; transition:all 0.2s;
          text-decoration:none; border:none; background:none; width:100%;
        }
        .g-um-item:hover { background:var(--mist); color:var(--text); }
        .g-um-item.red   { color:rgba(239,68,68,0.8); }
        .g-um-item.red:hover { background:rgba(239,68,68,0.06); color:#EF4444; }

        .g-overlay {
          position:fixed; inset:0; z-index:400;
          background:rgba(13,46,21,0.4);
          backdrop-filter:blur(20px) saturate(1.5);
          -webkit-backdrop-filter:blur(20px) saturate(1.5);
          animation:g-fade 0.3s ease;
        }
        @keyframes g-fade { from{opacity:0} to{opacity:1} }

        .g-drawer {
          position:fixed; bottom:0; left:0; right:0; z-index:401;
          max-height:90vh;
          background:var(--snow);
          border-radius:30px 30px 0 0;
          border-top:2px solid var(--border2);
          overflow-y:auto; scrollbar-width:none;
          box-shadow:0 -40px 100px rgba(13,74,31,0.25), inset 0 1px 0 rgba(255,255,255,0.9);
          animation:g-up 0.45s cubic-bezier(.16,1,.3,1);
        }
        .g-drawer::-webkit-scrollbar { display:none; }
        @keyframes g-up { from{transform:translateY(100%)} to{transform:translateY(0)} }

        .g-drawer-handle {
          display:flex; align-items:center; justify-content:center;
          padding:14px 0 8px;
        }
        .g-drawer-handle-bar {
          width:44px; height:5px;
          background:var(--silk);
          border-radius:5px;
        }

        .g-drawer-top {
          position:sticky; top:0; z-index:5;
          background:var(--snow);
          padding:0 20px 12px;
          display:flex; align-items:center; justify-content:space-between;
          border-bottom:1px solid var(--border);
        }
        .g-drawer-cat-pill {
          font-size:9px; font-weight:700; letter-spacing:0.14em;
          color:var(--emerald);
          background:var(--mist);
          border:1.5px solid var(--border2);
          padding:5px 14px; border-radius:100px;
        }
        .g-drawer-close {
          width:36px; height:36px;
          background:var(--alabaster);
          border:1.5px solid var(--border);
          border-radius:50%;
          display:flex; align-items:center; justify-content:center;
          cursor:pointer; color:var(--mtext); font-size:14px;
          transition:all 0.25s ease;
          box-shadow:var(--shadow-sm);
        }
        .g-drawer-close:hover { background:var(--mist); color:var(--text); transform:rotate(90deg); border-color:var(--border2); }

        .g-drawer-gallery { position:relative; width:100%; aspect-ratio:4/3; background:var(--alabaster); }
        .g-drawer-gallery::after {
          content:'';
          position:absolute; bottom:0; left:0; right:0; height:45%;
          background:linear-gradient(to top, var(--snow) 0%, transparent 100%);
          pointer-events:none;
        }

        .g-gallery-dots {
          position:absolute; bottom:16px; left:50%;
          transform:translateX(-50%);
          display:flex; gap:6px; z-index:2;
        }
        .g-gdot {
          height:4px; border-radius:4px; border:none; cursor:pointer;
          background:rgba(255,255,255,0.5); width:16px;
          transition:all 0.3s ease;
        }
        .g-gdot.on { background:var(--snow); width:30px; box-shadow:0 2px 8px rgba(0,0,0,0.2); }

        .g-dc { padding:20px 20px 0; }
        .g-dc-name {
          font-family:'Cormorant Garamond', serif;
          font-size:34px; font-weight:700; color:var(--forest);
          line-height:1.05; margin-bottom:10px; letter-spacing:-0.01em;
        }
        .g-dc-price-row { display:flex; align-items:baseline; gap:8px; margin-bottom:16px; }
        .g-dc-price {
          font-family:'Cormorant Garamond', serif;
          font-size:46px; font-weight:700; color:var(--jade);
          line-height:1; letter-spacing:0.01em;
        }
        .g-dc-unit { font-size:13px; color:var(--dtext); font-weight:400; }
        .g-dc-desc { font-size:13px; line-height:1.75; color:var(--mtext); margin-bottom:18px; }

        .g-dc-meta { display:flex; flex-direction:column; gap:8px; margin-bottom:20px; }
        .g-meta-row {
          display:flex; align-items:center; gap:12px;
          padding:12px 14px;
          background:var(--alabaster);
          border:1.5px solid var(--border);
          border-radius:15px;
        }
        .g-meta-icon {
          width:32px; height:32px;
          background:var(--mist);
          border-radius:10px;
          display:flex; align-items:center; justify-content:center;
          font-size:15px; flex-shrink:0;
          border:1px solid var(--border);
        }
        .g-meta-text { font-size:12px; font-weight:500; color:var(--mtext); }
        .g-meta-text span { color:var(--jade); font-weight:600; }

        .g-dc-actions { display:flex; gap:10px; padding:20px; }
        .g-dwa {
          flex:1; height:56px;
          background:linear-gradient(135deg,var(--emerald),var(--jade));
          border:none; border-radius:18px; color:#fff;
          font-family:'DM Sans', sans-serif;
          font-size:13px; font-weight:700; letter-spacing:0.04em;
          cursor:pointer;
          display:flex; align-items:center; justify-content:center; gap:8px;
          transition:all 0.3s ease;
          box-shadow:0 6px 24px rgba(37,137,74,0.4), inset 0 1px 0 rgba(255,255,255,0.2);
        }
        .g-dwa:hover { transform:translateY(-2px); box-shadow:0 14px 36px rgba(37,137,74,0.55); }

        .g-dcart {
          flex:1; height:56px;
          background:var(--forest);
          border:none; border-radius:18px; color:#fff;
          font-family:'DM Sans', sans-serif;
          font-size:13px; font-weight:800; letter-spacing:0.04em;
          cursor:pointer;
          display:flex; align-items:center; justify-content:center; gap:8px;
          transition:all 0.3s ease;
          box-shadow:0 6px 24px rgba(13,74,31,0.3), inset 0 1px 0 rgba(255,255,255,0.1);
        }
        .g-dcart:hover { transform:translateY(-2px); box-shadow:0 14px 36px rgba(13,74,31,0.45); background:var(--emerald); }

        .g-recs { border-top:1px solid var(--border); padding:20px 20px 32px; }
        .g-recs-title {
          font-family:'Cormorant Garamond', serif;
          font-size:18px; font-style:italic; font-weight:600;
          color:var(--mtext); margin-bottom:14px;
          display:flex; align-items:center; gap:8px;
        }
        .g-recs-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:10px; }
        .g-rec {
          display:flex; gap:10px; padding:10px;
          background:var(--alabaster);
          border:1.5px solid var(--border);
          border-radius:15px; cursor:pointer;
          transition:all 0.25s ease;
        }
        .g-rec:hover { background:var(--mist); border-color:var(--jade); transform:translateY(-2px); box-shadow:var(--shadow-md); }
        .g-rec-img {
          width:50px; height:50px; border-radius:11px;
          overflow:hidden; background:var(--silk); flex-shrink:0;
        }
        .g-rec-cat  { font-size:7.5px; font-weight:700; letter-spacing:0.12em; color:var(--sage); margin-bottom:2px; }
        .g-rec-name {
          font-family:'Cormorant Garamond', serif;
          font-size:13px; font-weight:600; color:var(--text);
          white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
        }
        .g-rec-price { font-size:10px; font-weight:600; color:var(--jade); margin-top:2px; }

        .g-motif {
          text-align:center; padding:8px 0 24px;
          color:var(--silk); font-size:11px;
          letter-spacing:0.4em; user-select:none;
        }
      `}</style>

      <header className={`g-header ${scrolled ? 'scrolled' : ''}`}>
        <div className="g-header-inner">
          <div className="g-logo-row">
            <Link href="/" className="g-logo-link">
              <div className="g-wordmark">
                <div className="g-wordmark-main">AGRIMARCHÉ</div>
                <div className="g-wordmark-sub">MARCHÉ PAYSAN DU SÉNÉGAL</div>
              </div>
            </Link>

            <div className="g-header-right">
              <Link href="/cart" className="g-icon-btn">
                🛒
                {cartCount > 0 && <span className="cart-badge">{cartCount}</span>}
              </Link>
              <div style={{ position: 'relative' }}>
                <button className="g-icon-btn" onClick={() => setShowUserMenu(v => !v)}>
                  {user ? '👤' : '◎'}
                </button>
                {showUserMenu && (
                  <div className="g-user-menu">
                    <div className="g-um-head">
                      <div className="g-um-role">COMPTE</div>
                      <div className="g-um-email">{user?.email || 'Invité'}</div>
                    </div>
                    <Link href="/privacy" className="g-um-item">🛡️ &nbsp;Confidentialité</Link>
                    <Link href="/conditions-utilisation" className="g-um-item">📋 &nbsp;Conditions d'utilisation</Link>
                    <Link href="/account" className="g-um-item">👤 &nbsp;Mon compte</Link>
                    {user && (
                      <button onClick={async () => { await logout(); router.push('/'); }} className="g-um-item red">
                        🚪 &nbsp;Déconnexion
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="g-search-row">
            <div className="g-search-box">
              <span className="g-search-ic">◎</span>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Tomates Casamance, mil Thiès, oignons Potou…"
                className="g-search-input"
              />
              {voiceSupported && (
                <button
                  onClick={toggleVoice}
                  className={`g-mic-btn ${listening ? 'on' : ''} ${voiceWhisper ? 'whisper' : ''}`}
                  title={listening ? 'Arrêter l\'écoute' : 'Recherche vocale'}
                >
                  {listening ? (voiceWhisper ? '🤫' : '🎤') : '🎙'}
                </button>
              )}

              {listening && (
                <div className={`g-voice-pop ${voiceWhisper ? 'whisper' : ''}`}>
                  <div className="g-voice-waves">
                    {[...Array(10)].map((_, i) => (
                      <span
                        key={i}
                        className="g-voice-wave"
                        style={{
                          height: `${Math.max(3, (voiceVolume / 100) * 22 * (0.4 + ((i % 5) / 5)))}px`,
                          animationDelay: `${i * 0.04}s`,
                        }}
                      />
                    ))}
                  </div>
                  <span className="g-voice-status">
                    {voiceWhisper ? 'Murmure amplifié…' : voiceVolume > 4 ? 'Je vous écoute…' : 'En attente…'}
                  </span>
                  {voiceConfidence > 0.5 && (
                    <span className="g-voice-conf">{Math.round(voiceConfidence * 100)}%</span>
                  )}
                </div>
              )}
            </div>

            {voiceError && (
              <div className="g-voice-toast" onAnimationEnd={() => setVoiceError(null)}>
                {voiceError}
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="g-cats">
        <div className="g-cats-inner">
          {CATEGORIES.map(c => (
            <button
              key={c.label}
              onClick={() => setCat(c.label)}
              className={`g-cat ${cat === c.label ? 'on' : ''}`}
            >
              {c.icon && <span className="g-cat-ic">{c.icon}</span>}
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="g-toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, position: 'relative' }}>
          {/* Bouton localisation GPS */}
          <button
            className="g-loc-chip"
            onClick={() => router.push('/main/location')}
            style={{ minWidth: 0, flexShrink: 0 }}
            title="Changer ma position"
          >
            <div className={`g-loc-pulse ${locStatus}`} />
            <span className="g-loc-text" style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {locStatus === 'searching' ? 'Localisation...' :
               locStatus === 'error'     ? 'Sénégal' :
               location?.detailedAddress || location?.address || 'Sénégal'}
            </span>
          </button>
        </div>

        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button
            onClick={() => setShowSort(v => !v)}
            className={`g-sort-trigger ${sort !== 'default' ? 'on' : ''}`}
          >
            ⚖ {sort === 'asc' ? 'PRIX ↑' : sort === 'desc' ? 'PRIX ↓' : 'TRIER'}
          </button>
          {showSort && (
            <div className="g-sort-menu">
              {(['default', 'asc', 'desc'] as const).map(m => (
                <button key={m} onClick={() => { setSort(m); setShowSort(false); }} className={`g-sort-item ${sort === m ? 'on' : ''}`}>
                  {m === 'default' ? '◈  Pertinence' : m === 'asc' ? '↑  Prix croissant' : '↓  Prix décroissant'}
                  {sort === m && <span style={{ color: 'var(--jade)' }}>✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── CARROUSEL ANNONCES ── */}
      {ads.length > 0 && (
        <div style={{ padding: '0 16px 4px', position: 'relative' }}>
          <div
            onClick={() => { const ad = ads[adIdx]; if (ad?.linkUrl) window.location.href = ad.linkUrl; }}
            style={{ position: 'relative', borderRadius: 18, overflow: 'hidden', cursor: ads[adIdx]?.linkUrl ? 'pointer' : 'default', boxShadow: '0 8px 32px rgba(13,74,31,0.14)' }}
          >
            {/* Image avec fallback couleur si URL cassée */}
            {ads[adIdx]?.imageUrl && ads[adIdx].imageUrl.startsWith('http') ? (
              <img
                src={ads[adIdx].imageUrl}
                alt={ads[adIdx]?.title || 'Annonce'}
                onError={e => { const el = e.currentTarget; el.style.display = 'none'; (el.nextElementSibling as HTMLElement).style.display = 'flex'; }}
                style={{ width: '100%', height: 160, objectFit: 'cover', display: 'block' }}
              />
            ) : null}
            {/* Fallback si pas d'image valide */}
            <div style={{
              display: (ads[adIdx]?.imageUrl && ads[adIdx].imageUrl.startsWith('http')) ? 'none' : 'flex',
              width: '100%', height: 160,
              background: 'linear-gradient(135deg, var(--forest), var(--jade))',
              alignItems: 'center', justifyContent: 'center',
              fontSize: 48,
            }}>🌾</div>
            {/* Overlay bas */}
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(transparent, rgba(0,0,0,0.72))', padding: '28px 14px 12px' }}>
              {ads[adIdx]?.badge && (
                <span style={{ display: 'inline-block', background: '#ef4444', color: '#fff', fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 6, marginBottom: 4, letterSpacing: '0.06em' }}>
                  {ads[adIdx].badge}
                </span>
              )}
              <div style={{ color: '#fff', fontWeight: 700, fontSize: 14, lineHeight: 1.2 }}>{ads[adIdx]?.title}</div>
              {ads[adIdx]?.type === 'promotion' && ads[adIdx]?.discountedPrice ? (
                <div style={{ marginTop: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: '#00ff87', fontWeight: 800, fontSize: 13 }}>{ads[adIdx].discountedPrice.toLocaleString()} FCFA</span>
                  {ads[adIdx]?.originalPrice && <span style={{ textDecoration: 'line-through', color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>{ads[adIdx].originalPrice.toLocaleString()}</span>}
                  <span style={{ background: '#ef4444', color: '#fff', fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 4 }}>-{ads[adIdx].discountPercent}%</span>
                </div>
              ) : ads[adIdx]?.partnerName ? (
                <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 11, marginTop: 2 }}>Partenaire · {ads[adIdx].partnerName}</div>
              ) : null}
            </div>
            {/* Dots */}
            {ads.length > 1 && (
              <div style={{ position: 'absolute', bottom: 10, right: 12, display: 'flex', gap: 5 }}>
                {ads.map((_: any, i: number) => (
                  <button
                    key={i}
                    onClick={e => { e.stopPropagation(); setAdIdx(i); }}
                    style={{ width: i === adIdx ? 18 : 6, height: 6, borderRadius: 3, border: 'none', background: i === adIdx ? '#00ff87' : 'rgba(255,255,255,0.4)', cursor: 'pointer', padding: 0, transition: 'all 0.3s' }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <main className="g-main">
        <div className="g-section-head">
          <h2 className="g-section-title">
            {cat === 'Tous' ? 'Tous les produits' : cat}
          </h2>
          <div className="g-section-line" />
          <span className="g-section-badge">DIRECT PRODUCTEUR</span>
        </div>

        <div className="g-grid">
          {filtered.length === 0 ? (
            <div className="g-empty">
              <span className="g-empty-glyph">VIDE</span>
              <div className="g-empty-title">Aucun produit trouvé</div>
              <p className="g-empty-sub">Essayez une autre recherche ou catégorie.</p>
              <button onClick={() => { setSearch(''); setCat('Tous'); }} className="g-empty-btn">
                ✦ TOUT AFFICHER
              </button>
            </div>
          ) : (
            filtered.map((p, idx) => {
              const rd    = ratings.get(p.sellerId || '');
              const stars = rd?.averageRating || 0;
              const cnt   = rd?.reviewCount   || 0;
              const isHero = idx % 9 === 0 && idx !== 0;

              return (
                <div
                  key={p.id}
                  className={`g-card ${isHero ? 'hero' : ''}`}
                  style={{ animationDelay: `${Math.min(idx * 38, 700)}ms` }}
                  onClick={() => open(p)}
                >
                  <div className="g-card-visual">
                    {(() => {
                      const imgs = (p.images ?? []).slice(0, 5);
                      const ci = getCardImg(p.id);
                      return (
                        <>
                          {imgs[ci] ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={imgs[ci]}
                              alt={p.name}
                              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.6s cubic-bezier(.16,1,.3,1)' }}
                            />
                          ) : (
                            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 52, background: 'var(--graphite)' }}>🌾</div>
                          )}
                          <div className="g-card-fog" />
                          {p.farmerVerified && <div className="g-verified">✓ VÉRIFIÉ</div>}
                          {/* Flèches carousel — visibles dès qu'il y a des images */}
                          {imgs.length > 0 && (
                            <>
                              <button
                                className="g-carr-arrow left"
                                onClick={e => { setCardImg(p.id, (ci - 1 + imgs.length) % imgs.length, e); }}
                              >‹</button>
                              <button
                                className="g-carr-arrow right"
                                onClick={e => { setCardImg(p.id, (ci + 1) % imgs.length, e); }}
                              >›</button>
                              {imgs.length > 1 && (
                                <div className="g-carr-dots">
                                  {imgs.map((_, i) => (
                                    <button
                                      key={i}
                                      className={`g-carr-dot ${i === ci ? 'on' : ''}`}
                                      onClick={e => setCardImg(p.id, i, e)}
                                    />
                                  ))}
                                </div>
                              )}
                            </>
                          )}
                          <div className="g-card-price">
                            <div>
                              <div className="g-price-n">{p.price?.toLocaleString()}</div>
                              <div className="g-price-u">FCFA / {p.unit || 'kg'}</div>
                            </div>
                          </div>
                          <button onClick={e => toggleWish(p.id, e)} className={`g-wish ${wishlist.has(p.id) ? 'on' : ''}`}>
                            {wishlist.has(p.id) ? '♥️' : '♡'}
                          </button>
                        </>
                      );
                    })()}
                  </div>

                  <div className="g-card-body">
                    <div className="g-card-cat">{p.category}</div>
                    <h3 className="g-card-name">{p.name}</h3>
                    {p.description && (
                      <p className="g-card-desc">{p.description}</p>
                    )}
                    <div className="g-card-farmer">
                      <div className="g-farmer-avatar">🌱</div>
                      <span className="g-farmer-name">{p.farmer?.split(' ')[0] || 'Producteur'}</span>
                    </div>
                    {cnt > 0 && (
                      <div className="g-stars">
                        {[1,2,3,4,5].map(i => (
                          <svg key={i} width={10} height={10} viewBox="0 0 24 24"
                            fill={i <= Math.floor(stars) ? 'var(--jade)' : 'rgba(13,74,31,0.15)'}>
                            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                          </svg>
                        ))}
                        <span style={{ fontSize: 8, color: 'var(--dtext)', marginLeft: 3 }}>({cnt})</span>
                      </div>
                    )}
                    <div className="g-card-actions">
                      <button onClick={e => { wa(p.name, p.farmerPhone, p.id, e); }} className="g-wa-btn">
                        <WaIcon s={10} /> CONTACTER
                      </button>
                      <button onClick={e => addCart(p, e)} className={`g-add-btn ${addedIds.has(p.id) ? 'done' : ''}`}>
                        {addedIds.has(p.id) ? '✓' : '+'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="g-motif">— ✦ ◈ ✦ —</div>
      </main>



      <nav className="g-nav">
        <div className="g-nav-inner">
          <Link href="/" className="g-nav-btn on">
            <span className="g-nav-ic">⌂</span>
            <span className="g-nav-lbl">ACCUEIL</span>
          </Link>
          <button className="g-nav-btn" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <span className="g-nav-ic">⊞</span>
            <span className="g-nav-lbl">CATÉGORIES</span>
          </button>

          <button
            className="g-nav-cta"
            onClick={() => window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent('Bonjour, je souhaite commander sur AgriMarché.')}`, '_blank')}
          >
            <div className="g-nav-cta-ring"><WaIcon s={26} /></div>
            <span className="g-nav-cta-lbl">WHATSAPP</span>
          </button>

          <Link href="/cart" className="g-nav-btn">
            <span className="g-nav-ic">◻</span>
            <span className="g-nav-lbl">PANIER</span>
          </Link>
          <Link href="/main/unlock-ia" className="g-nav-btn g-nav-ia">
            <span className="g-nav-ic">🤖</span>
            <span className="g-nav-lbl">IA</span>
          </Link>
        </div>
      </nav>

      {selected && (
        <>
          <div className="g-overlay" onClick={close} />
          <div className="g-drawer" ref={drawerRef}>
            <div className="g-drawer-handle">
              <div className="g-drawer-handle-bar" />
            </div>

            <div className="g-drawer-top">
              <span className="g-drawer-cat-pill">{selected.category}</span>
              <button className="g-drawer-close" onClick={close}>✕</button>
            </div>

            <div className="g-drawer-gallery">
              {(() => {
                const galleryImages = (selected.images ?? []).slice(0, 5); // ✅ 5 images max par produit
                return (
                  <>
                    {galleryImages[imgIdx] ? (
                      <img src={galleryImages[imgIdx]} alt={selected.name} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 80 }}>🌾</div>
                    )}
                    {/* Flèches drawer */}
                    {galleryImages.length > 1 && (
                      <>
                        <button
                          onClick={() => setImgIdx(i => (i - 1 + galleryImages.length) % galleryImages.length)}
                          style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.85)', border: 'none', borderRadius: '50%', width: 36, height: 36, fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.18)', zIndex: 10 }}
                        >‹</button>
                        <button
                          onClick={() => setImgIdx(i => (i + 1) % galleryImages.length)}
                          style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.85)', border: 'none', borderRadius: '50%', width: 36, height: 36, fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.18)', zIndex: 10 }}
                        >›</button>
                        <div className="g-gallery-dots">
                          {galleryImages.map((_, i) => (
                            <button key={i} onClick={() => setImgIdx(i)} className={`g-gdot ${imgIdx === i ? 'on' : ''}`} />
                          ))}
                        </div>
                      </>
                    )}
                  </>
                );
              })()}
            </div>

            <div className="g-dc">
              <h2 className="g-dc-name">{selected.name}</h2>
              <div className="g-dc-price-row">
                <span className="g-dc-price">{selected.price?.toLocaleString()}</span>
                <span className="g-dc-unit">FCFA / {selected.unit || 'kg'}</span>
              </div>
              {selected.description && <p className="g-dc-desc">{selected.description}</p>}

              <div className="g-dc-meta">
                <div className="g-meta-row">
                  <div className="g-meta-icon">📍</div>
                  <span className="g-meta-text">{selected.exactLocation || selected.region || 'Sénégal'}</span>
                </div>
                <div className="g-meta-row">
                  <div className="g-meta-icon">🌾</div>
                  <span className="g-meta-text">
                    {selected.farmer || 'Producteur local'}
                    {/* numéro masqué — visible uniquement via WhatsApp */}
                  </span>
                </div>
                {selected.stock !== undefined && (
                  <div className="g-meta-row">
                    <div className="g-meta-icon">📦</div>
                    <span className="g-meta-text">Stock disponible : <span>{selected.stock} {selected.unit || 'unités'}</span></span>
                  </div>
                )}
              </div>
            </div>

            <div className="g-dc-actions">
              <button onClick={() => wa(selected.name, selected.farmerPhone, selected.id)} className="g-dwa">
                <WaIcon s={16} /> Commander
              </button>
              <button onClick={() => addCart(selected)} className="g-dcart">
                🛒 Panier
              </button>
            </div>

            {recommendationSections.length > 0 && (
              <div style={{ margin: '0 20px 4px', padding: '12px 16px', background: 'rgba(37,137,74,0.06)', border: '1px solid rgba(37,137,74,0.15)', borderRadius: 14 }}>
                <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', color: 'var(--sage)', textTransform: 'uppercase', marginBottom: 10 }}>
                  ✦ Suggestions personnalisées
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                  <tbody>
                    {[
                      { icon: '📍', label: 'Région',      desc: 'Produits populaires dans votre région',          prio: 1 },
                      { icon: '👨‍🌾', label: 'Producteur',  desc: 'Autres produits du même producteur',             prio: 2 },
                      { icon: '📍', label: 'Proximité',   desc: 'Produits les plus proches géographiquement (GPS)',prio: 3 },
                      { icon: '📂', label: 'Catégorie',   desc: 'Produits de la même catégorie',                  prio: 4 },
                    ]
                    .filter(row => recommendationSections.some(s => s.badge.includes(row.label)))
                    .map(row => (
                      <tr key={row.label}>
                        <td style={{ padding: '4px 6px 4px 0', color: 'var(--jade)', fontWeight: 700, whiteSpace: 'nowrap' }}>
                          {row.icon} {row.label}
                        </td>
                        <td style={{ padding: '4px 0', color: 'var(--mtext)' }}>{row.desc}</td>
                        <td style={{ padding: '4px 0 4px 8px', color: 'var(--dtext)', fontWeight: 700, textAlign: 'right' }}>#{row.prio}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {recommendationSections.map(section => (
              <div key={section.title} className="g-recs">
                <div className="g-recs-title">
                  <span style={{ color: 'var(--jade)', fontSize: 12 }}>✦</span>
                  {section.title}
                  <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--sage)', textTransform: 'uppercase', marginLeft: 'auto' }}>
                    {section.badge}
                  </span>
                </div>
                <div className="g-recs-grid">
                  {section.items.map(r => (
                    <div key={r.id} className="g-rec" onClick={() => { setSelected(r); setImgIdx(0); drawerRef.current?.scrollTo({ top: 0, behavior: 'smooth' }); }}>
                      <div className="g-rec-img" style={{ position: 'relative' }}>
                        {(() => {
                          const rimgs = (r.images ?? []).slice(0, 5);
                          const ri = getRecImg(r.id);
                          return (
                            <>
                              {rimgs[ri]
                                ? <img src={rimgs[ri]} alt={r.name} style={{ objectFit: 'cover', width: '100%', height: '100%' }} />
                                : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>🌾</div>}
                              {rimgs.length > 1 && (
                                <div style={{ position: 'absolute', bottom: 3, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 3 }}>
                                  {rimgs.map((_, i) => (
                                    <button
                                      key={i}
                                      onClick={e => setRecImg(r.id, i, e)}
                                      style={{
                                        width: i === ri ? 10 : 5, height: 5, borderRadius: 3, border: 'none', cursor: 'pointer', padding: 0,
                                        background: i === ri ? '#fff' : 'rgba(255,255,255,0.45)',
                                        transition: 'all 0.2s',
                                      }}
                                    />
                                  ))}
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div className="g-rec-cat">{r.category}</div>
                        <div className="g-rec-name">{r.name}</div>
                        <div className="g-rec-price">
                          {r.price?.toLocaleString()} FCFA
                          {section.distances?.has(r.id) && (
                            <span style={{ color: 'var(--sage)', fontWeight: 500 }}>
                              &ensp;·&ensp;{section.distances.get(r.id)!.toFixed(1)} km
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            <div style={{ height: 40 }} />
          </div>
        </>
      )}
    </>
  );
}
