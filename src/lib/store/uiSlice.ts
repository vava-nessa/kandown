/**
 * @file Zustand store slice — UI preferences & toasts
 * @description View mode/density (persisted to localStorage), filters, the
 * command palette / cheatsheet open flags, current page routing, and the
 * toast queue used across every other slice for user-facing feedback.
 */

import type { StateCreator } from 'zustand';
import type { Filters } from '../types';
import type { State } from './types';
import { nextToastId } from './helpers';

export interface UiSlice {
  setViewMode: State['setViewMode'];
  setDensity: State['setDensity'];
  setFilter: State['setFilter'];
  clearFilters: State['clearFilters'];
  setCommandOpen: State['setCommandOpen'];
  setCheatsheetOpen: State['setCheatsheetOpen'];
  setCurrentPage: State['setCurrentPage'];
  toast: State['toast'];
  dismissToast: State['dismissToast'];
}

export const createUiSlice: StateCreator<State, [], [], UiSlice> = (set, get) => ({
  setViewMode: (mode) => {
    localStorage.setItem('kandown:view', mode);
    set({ viewMode: mode });
  },
  setDensity: (density) => {
    localStorage.setItem('kandown:density', density);
    set({ density });
  },
  setFilter: (key, value) => {
    set(state => ({ filters: { ...state.filters, [key]: value } }));
    if (key === 'search') {
      const { columns, tasksDirHandle, taskContents } = get();
      const query = value as string;
      const allIds = columns.flatMap(col => col.tasks.map(t => t.id));
      // Load contents for all tasks if not already loaded (lazy mode for >10 tasks)
      if (tasksDirHandle) {
        const missingIds = allIds.filter(id => !taskContents.has(id));
        if (missingIds.length > 0) {
          get().loadTaskContents(missingIds).then(() => {
            get().computeSearchMatches(query);
          });
        } else {
          get().computeSearchMatches(query);
        }
      }
    }
  },
  clearFilters: () =>
    set({ filters: { search: '', priority: null, tag: null, assignee: null, ownerType: null, category: [] } as Filters, searchMatches: new Map() }),

  setCommandOpen: (open) => set({ commandOpen: open }),
  setCheatsheetOpen: (open) => set({ cheatsheetOpen: open }),
  setCurrentPage: (page) => set({ currentPage: page }),

  toast: (message, type = 'success', durationMs) => {
    const id = nextToastId();
    // 📖 Severity-aware duration: warnings and errors stay longer because they
    // carry information the user must act on; info/success flash briefly.
    const auto = durationMs ?? (type === 'error' || type === 'warning' ? 6000 : 2500);
    set(state => ({ toasts: [...state.toasts, { id, message, type }] }));
    setTimeout(() => {
      set(state => ({ toasts: state.toasts.filter(t => t.id !== id) }));
    }, auto);
  },
  dismissToast: (id) => set(state => ({ toasts: state.toasts.filter(t => t.id !== id) })),
});
