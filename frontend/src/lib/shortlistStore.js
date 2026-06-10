// localStorage-backed shortlist store. Frontend-only persistence.

import { useEffect, useState } from "react";

const STORAGE_KEY = "filed.shortlist.v1";
const CHANGE_EVENT = "filed:shortlist-changed";

const DEFAULT_LISTS = [
  { id: "dream", name: "Dream Colleges" },
  { id: "safe", name: "Safe Colleges" },
  { id: "budget", name: "Budget Colleges" },
  { id: "private", name: "Private Colleges" },
  { id: "target", name: "Target Colleges" },
];

const initial = () => ({
  lists: DEFAULT_LISTS,
  items: [], // { id, collegeId, listId, addedAt, notes, priority }
  views: {}, // collegeId -> ISO timestamp
});

export function loadState() {
  if (typeof window === "undefined") return initial();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return initial();
    const parsed = JSON.parse(raw);
    return {
      lists: Array.isArray(parsed.lists) && parsed.lists.length ? parsed.lists : DEFAULT_LISTS,
      items: Array.isArray(parsed.items) ? parsed.items : [],
      views: typeof parsed.views === "object" && parsed.views ? parsed.views : {},
    };
  } catch (e) {
    return initial();
  }
}

function persist(state) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

export function useShortlist() {
  const [state, setState] = useState(loadState);

  useEffect(() => {
    const handler = () => setState(loadState());
    window.addEventListener(CHANGE_EVENT, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(CHANGE_EVENT, handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  const mutate = (mutator) => {
    setState((prev) => {
      const next = mutator(prev);
      persist(next);
      return next;
    });
  };

  return {
    state,
    addToList: (collegeId, listId) =>
      mutate((s) => {
        if (s.items.some((i) => i.collegeId === collegeId && i.listId === listId)) return s;
        return {
          ...s,
          items: [
            ...s.items,
            {
              id: `${collegeId}-${listId}-${Date.now()}`,
              collegeId,
              listId,
              addedAt: new Date().toISOString(),
              notes: "",
              priority: null,
            },
          ],
        };
      }),
    removeItem: (id) => mutate((s) => ({ ...s, items: s.items.filter((i) => i.id !== id) })),
    removeCollegeFromAllLists: (collegeId) =>
      mutate((s) => ({ ...s, items: s.items.filter((i) => i.collegeId !== collegeId) })),
    updateItem: (id, patch) =>
      mutate((s) => ({ ...s, items: s.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) })),
    createList: (name) =>
      mutate((s) => ({
        ...s,
        lists: [...s.lists, { id: `list-${Date.now()}`, name }],
      })),
    renameList: (id, name) =>
      mutate((s) => ({ ...s, lists: s.lists.map((l) => (l.id === id ? { ...l, name } : l)) })),
    deleteList: (id) =>
      mutate((s) => ({
        ...s,
        lists: s.lists.filter((l) => l.id !== id),
        items: s.items.filter((i) => i.listId !== id),
      })),
    markViewed: (collegeId) =>
      mutate((s) => ({ ...s, views: { ...s.views, [collegeId]: new Date().toISOString() } })),
    reset: () => mutate(() => initial()),
  };
}

export const PRIORITY_META = {
  high: { label: "High", color: "#D97706", bg: "rgba(217,119,6,0.10)" },
  medium: { label: "Medium", color: "#4682B4", bg: "rgba(70,130,180,0.10)" },
  low: { label: "Low", color: "#64748B", bg: "rgba(100,116,139,0.10)" },
};

export const formatRelative = (iso) => {
  if (!iso) return "Never";
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};
