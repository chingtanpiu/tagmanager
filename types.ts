export type MediaType = 'text' | 'url' | 'image' | 'video' | 'audio' | 'document';

export interface Category {
  id: string;
  parentId: string | null;
  name: string;
  createdAt: number;
}

export interface Item {
  id: string;
  content: string; // Text content or File Data URL
  description?: string; // Optional text for non-text items
  type: MediaType;
  categoryIds: string[]; // Can belong to multiple, but UI mainly handles selection
  createdAt: number;
  fileName?: string;
  size?: number;
}

export interface AppState {
  categories: Category[];
  items: Item[];
  selectedCategoryIds: string[]; // For filtering (Intersection logic)
}

export interface AppSettings {
  autoSaveInterval: number; // in minutes, 0 = off
  maxVersions: number; // Maximum number of history versions to keep
}

export interface Version {
  id: string;
  timestamp: number;
  label: string; // e.g. "Auto-save", "Manual Save"
  data: AppState;
  size: number; // Approximate size in bytes
}

// Helper types for UI
export type DragTarget = {
  type: 'category' | 'item';
  id: string;
}