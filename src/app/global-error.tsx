"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          padding: "2.5rem 1rem 4rem",
          minHeight: "100dvh",
          boxSizing: "border-box",
          fontFamily: "system-ui, sans-serif",
          lineHeight: 1.55,
          colorScheme: "light dark",
          backgroundColor: "light-dark(#e4f0ec, #061418)",
          backgroundImage:
            "radial-gradient(60vmax 50vmax at 0% 0%, light-dark(#8ee0cf, #12706b), transparent), radial-gradient(45vmax 40vmax at 100% 100%, light-dark(#f7bb9d, #a8402a), transparent)",
          backgroundAttachment: "fixed",
          color: "light-dark(#0e2a26, #e2f2ee)",
        }}
      >
        <main
          style={{
            maxWidth: "40rem",
            margin: "0 auto",
            padding: "1.75rem 1.25rem",
            display: "grid",
            justifyItems: "start",
            gap: "1rem",
            boxSizing: "border-box",
            background: "light-dark(#f3f8f6, #0c2328)",
            border: "1px solid light-dark(rgba(14,42,38,0.16), rgba(226,242,238,0.2))",
            borderRadius: "1.75rem",
            boxShadow: "0 22px 44px -26px light-dark(rgba(14,42,38,0.45), rgba(0,0,0,0.7))",
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: "clamp(1.875rem, 5vw, 2.5rem)",
              fontWeight: 800,
              lineHeight: 1.15,
              letterSpacing: "-0.03em",
            }}
          >
            Algo salió mal
          </h1>
          <p style={{ margin: 0 }}>
            La página no se pudo cargar. Vuelve a intentarlo en unos minutos.
          </p>
          <p style={{ margin: 0 }} lang="en">
            <strong>Something went wrong.</strong> The page could not be loaded.
            Try again in a few minutes.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              justifySelf: "start",
              minHeight: "2.75rem",
              marginTop: "0.5rem",
              padding: "0.7rem 1.4rem",
              font: "inherit",
              fontWeight: 700,
              cursor: "pointer",
              color: "light-dark(#ffffff, #04201a)",
              background: "light-dark(#0b6b5d, #4fd9bc)",
              border: "1px solid light-dark(#084f45, #2fb095)",
              borderRadius: "0.75rem",
            }}
          >
            Reintentar / Try again
          </button>
        </main>
      </body>
    </html>
  );
}
