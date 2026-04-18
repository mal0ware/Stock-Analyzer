import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Tab {
  symbol: string;
  label: string;
}

interface TabState {
  tabs: Tab[];
  activeTab: string | null;
  openTab: (symbol: string, label?: string) => void;
  closeTab: (symbol: string) => void;
  setActiveTab: (symbol: string) => void;
}

export const useTabStore = create<TabState>()(
  persist(
    (set, get) => ({
      tabs: [],
      activeTab: null,

      openTab: (symbol: string, label?: string) => {
        const upper = symbol.toUpperCase();
        const { tabs } = get();
        const existing = tabs.find((t) => t.symbol === upper);
        if (existing) {
          // Update label if provided and different
          if (label && label !== existing.label) {
            set({
              tabs: tabs.map((t) =>
                t.symbol === upper ? { ...t, label } : t,
              ),
              activeTab: upper,
            });
          } else {
            set({ activeTab: upper });
          }
        } else {
          set({
            tabs: [...tabs, { symbol: upper, label: label || upper }],
            activeTab: upper,
          });
        }
      },

      closeTab: (symbol: string) => {
        const upper = symbol.toUpperCase();
        const { tabs, activeTab } = get();
        const idx = tabs.findIndex((t) => t.symbol === upper);
        const newTabs = tabs.filter((t) => t.symbol !== upper);

        let newActive = activeTab;
        if (activeTab === upper) {
          if (newTabs.length === 0) {
            newActive = null;
          } else if (idx >= newTabs.length) {
            newActive = newTabs[newTabs.length - 1].symbol;
          } else {
            newActive = newTabs[idx].symbol;
          }
        }

        set({ tabs: newTabs, activeTab: newActive });
      },

      setActiveTab: (symbol: string) => {
        set({ activeTab: symbol.toUpperCase() });
      },
    }),
    {
      name: 'stock-analyzer-tabs',
      partialize: (state) => ({ tabs: state.tabs }),
    },
  ),
);
