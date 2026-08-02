import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { appStorage } from './supabaseClient';

export interface CartItem {
  id: string; // product id + variant id
  productId: string;
  /** معرّف الخيار الحقيقي الذي يجب أن يصل إلى عنصر الطلب. */
  variantId?: string;
  name: string;
  price: number;
  emoji: string;
  quantity: number;
  maxQuantity?: number;
  storeId: string;
  storeName: string;
  image?: string;
  /** غير محدد = محدد (توافق مع سلال محفوظة قبل إضافة الخاصية) */
  selected?: boolean;
}

/** العنصر محدد ما لم يُلغَ تحديده صراحةً */
export const isCartItemSelected = (item: CartItem): boolean => item.selected !== false;

interface CartState {
  items: CartItem[];
  addToCart: (item: CartItem) => void;
  removeFromCart: (itemId: string) => void;
  updateQuantity: (itemId: string, quantity: number) => void;
  clearCart: () => void;
  getTotalPrice: () => number;
  getItemsByStore: () => Record<string, CartItem[]>;
  /** تبديل تحديد عنصر — المحدد فقط هو ما يُطلب في الشيك-آوت */
  toggleSelected: (itemId: string) => void;
  getSelectedItems: () => CartItem[];
  getSelectedTotal: () => number;
  getSelectedByStore: () => Record<string, CartItem[]>;
  /** إزالة العناصر المحددة فقط (بعد إتمام طلبها) */
  clearSelected: () => void;
}

export const useCartStore = create<CartState>()(persist((set, get) => ({
  items: [],

  addToCart: (newItem) => {
    set((state) => {
      const existingItem = state.items.find((i) => i.id === newItem.id);
      if (existingItem) {
        const requestedQuantity = existingItem.quantity + newItem.quantity;
        const quantity = existingItem.maxQuantity
          ? Math.min(requestedQuantity, existingItem.maxQuantity)
          : requestedQuantity;
        return {
          items: state.items.map((i) =>
            i.id === newItem.id ? { ...i, quantity } : i
          ),
        };
      }
      return { items: [...state.items, { ...newItem, selected: true }] };
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
      items: state.items.map((i) => (
        i.id === itemId
          ? { ...i, quantity: i.maxQuantity ? Math.min(quantity, i.maxQuantity) : quantity }
          : i
      )),
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

  toggleSelected: (itemId) => {
    set((state) => ({
      items: state.items.map((i) => (
        i.id === itemId ? { ...i, selected: !isCartItemSelected(i) } : i
      )),
    }));
  },

  getSelectedItems: () => get().items.filter(isCartItemSelected),

  getSelectedTotal: () => {
    return get()
      .items.filter(isCartItemSelected)
      .reduce((total, item) => total + item.price * item.quantity, 0);
  },

  getSelectedByStore: () => {
    const grouped: Record<string, CartItem[]> = {};
    get().items.filter(isCartItemSelected).forEach((item) => {
      if (!grouped[item.storeId]) {
        grouped[item.storeId] = [];
      }
      grouped[item.storeId].push(item);
    });
    return grouped;
  },

  clearSelected: () => {
    set((state) => ({ items: state.items.filter((i) => !isCartItemSelected(i)) }));
  },
}), {
  name: 'marketplace-cart-v1',
  storage: createJSONStorage(() => appStorage),
  // نحفظ عناصر السلة فقط؛ الدوال تُعاد بناؤها عند الإقلاع
  partialize: (state) => ({ items: state.items }),
}));
