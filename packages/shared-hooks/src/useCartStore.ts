import { create } from 'zustand';

export interface CartItem {
  id: string; // product id + variant string
  productId: string;
  variantId?: string | null;
  name: string;
  price: number;
  emoji: string;
  quantity: number;
  storeId: string;
  storeName: string;
}

interface CartState {
  items: CartItem[];
  addToCart: (item: CartItem) => void;
  removeFromCart: (itemId: string) => void;
  updateQuantity: (itemId: string, quantity: number) => void;
  clearCart: () => void;
  getTotalPrice: () => number;
  getItemsByStore: () => Record<string, CartItem[]>;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],

  addToCart: (newItem) => {
    set((state) => {
      const existingItem = state.items.find((i) => i.id === newItem.id);
      if (existingItem) {
        return {
          items: state.items.map((i) =>
            i.id === newItem.id ? { ...i, quantity: i.quantity + newItem.quantity } : i
          ),
        };
      }
      return { items: [...state.items, newItem] };
    });
  },

  removeFromCart: (itemId) => {
    set((state) => ({
      items: state.items.filter((i) => i.id !== itemId),
    }));
  },

  updateQuantity: (itemId, quantity) => {
    if (quantity <= 0) {
      get().removeFromCart(itemId);
      return;
    }
    set((state) => ({
      items: state.items.map((i) => (i.id === itemId ? { ...i, quantity } : i)),
    }));
  },

  clearCart: () => set({ items: [] }),

  getTotalPrice: () => {
    return get().items.reduce((total, item) => total + item.price * item.quantity, 0);
  },

  getItemsByStore: () => {
    const items = get().items;
    const grouped: Record<string, CartItem[]> = {};
    items.forEach((item) => {
      if (!grouped[item.storeId]) {
        grouped[item.storeId] = [];
      }
      grouped[item.storeId].push(item);
    });
    return grouped;
  },
}));
