import { useEffect } from "react";
import { platform } from "@tauri-apps/plugin-os";
import { useUiStore } from "../store/uiStore";

export function usePlatform() {
  const setIsAndroid = useUiStore((s) => s.setIsAndroid);
  useEffect(() => {
    const p = platform();
    setIsAndroid(p === "android");
  }, [setIsAndroid]);
}
