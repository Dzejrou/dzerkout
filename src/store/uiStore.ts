import { create } from "zustand";

interface UiStore {
  isAndroid: boolean;
  setIsAndroid: (v: boolean) => void;

  confirmModal: {
    open: boolean;
    message: string;
    confirmLabel: string;
    onConfirm: () => void;
    onCancel: () => void;
  } | null;
  showConfirmModal: (params: {
    message: string;
    confirmLabel?: string;
    onConfirm: () => void;
    onCancel?: () => void;
  }) => void;
  closeConfirmModal: () => void;
}

export const useUiStore = create<UiStore>((set) => ({
  isAndroid: false,
  setIsAndroid: (v) => set({ isAndroid: v }),

  confirmModal: null,
  showConfirmModal: ({ message, confirmLabel = "Confirm", onConfirm, onCancel = () => {} }) =>
    set({
      confirmModal: { open: true, message, confirmLabel, onConfirm, onCancel },
    }),
  closeConfirmModal: () => set({ confirmModal: null }),
}));
