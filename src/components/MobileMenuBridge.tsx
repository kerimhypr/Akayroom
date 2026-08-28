"use client";

import { useEffect, useState } from "react";

export default function MobileMenuBridge() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const closeFromNavigation = (event: Event) => {
      const target = event.target as Element | null;
      if (!target) return;
      if (target.closest(".channel-row, .dm-item, .sidebar-back")) {
        setOpen(false);
      }
    };
    document.addEventListener("click", closeFromNavigation);
    return () => document.removeEventListener("click", closeFromNavigation);
  }, []);

  useEffect(() => {
    const drawer = document.querySelector<HTMLElement>(".channel-sidebar");
    if (!drawer) return;
    drawer.classList.toggle("mobile-open", open);
  }, [open]);

  return (
    <button
      type="button"
      aria-label={open ? "Kanalları kapat" : "Kanalları aç"}
      aria-expanded={open}
      className="mobile-menu-bridge"
      onClick={() => setOpen(value => !value)}
    >
      <span aria-hidden="true">☰</span>
    </button>
  );
}
