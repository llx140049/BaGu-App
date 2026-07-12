import { create } from "zustand";
import { reviewCard } from "../data/sm2";

export interface Card {
  id: string;
  cat: string;
  q: string;
  a: string;
  level: number;
  correct: number;
  incorrect: number;
  lastReview?: string;
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
      return {
        currentIndex: (s.currentIndex + 1) % total,
        cards: s.cards.map((c) => {
          if (c.id !== id) return c;
          const updatedReview = reviewCard(
            {
              level: c.level,
              correct: c.correct,
              incorrect: c.incorrect,
              isStarred: c.isStarred,
            },
            quality
          );
          return { ...c, ...updatedReview };
        }),
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
