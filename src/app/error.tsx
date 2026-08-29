"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("AKAYROOM runtime error", error);
  }, [error]);

  return (
    <main className="loading-screen" role="alert" style={{ padding: 24, textAlign: "center" }}>
      <div>
        <strong>AKAYROOM geçici olarak hata verdi.</strong>
        <p style={{ color: "var(--muted)", margin: "10px 0 16px" }}>Bağlantıyı veya uygulama durumunu yeniden denemeyi deneyebilirsin.</p>
        <button className="btn btn-primary" onClick={() => reset()}>TEKRAR DENE</button>
      </div>
    </main>
  );
}
