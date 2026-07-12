import { create } from "zustand";

export interface Card {
  id: string;
  cat: string;
  q: string;
  a: string;
  level: number;
  correct: number;
  incorrect: number;
  nextReview?: string;
  isStarred: boolean;
}

interface CardStore {
  cards: Card[];
  currentIndex: number;
  setCards: (cards: Card[]) => void;
  setCurrentIndex: (i: number) => void;
  updateCard: (id: string, updates: Partial<Card>) => void;
  rateAndAdvance: (id: string, quality: number, total: number) => void;
  getDueCards: () => Card[];
  getCardsByCategory: (cat: string) => Card[];
}

export const useCardStore = create<CardStore>((set, get) => ({
  cards: [],
  currentIndex: 0,
  setCards: (cards) => set({ cards }), // 不再重置 currentIndex 为 0！
  setCurrentIndex: (i) => set({ currentIndex: i }),
  updateCard: (id, updates) =>
    set((s) => ({ cards: s.cards.map((c) => (c.id === id ? { ...c, ...updates } : c)) })),
  rateAndAdvance: (id, quality, total) =>
    set((s) => {
      const now = Date.now();
      return {
        currentIndex: (s.currentIndex + 1) % total,
        cards: s.cards.map((c) =>
          c.id === id
            ? {
                ...c,
                correct: quality === 1 ? c.correct + 1 : c.correct,
                incorrect: quality === 0 ? c.incorrect + 1 : c.incorrect,
                level: quality === 1 ? Math.min(c.level + 1, 7) : Math.max(c.level - 1, 0),
                nextReview: new Date(now + (quality === 1 ? 86400000 : 3600000)).toISOString(),
              }
            : c
        ),
      };
    }),
  getDueCards: () =>
    get().cards.filter((c) => {
      if (!c.nextReview) return true;
      return new Date(c.nextReview) <= new Date();
    }),
  getCardsByCategory: (cat) =>
    get().cards.filter((c) => c.cat === cat),
}));
