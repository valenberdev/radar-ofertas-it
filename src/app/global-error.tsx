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
          padding: "4rem 1rem",
          fontFamily: "system-ui, sans-serif",
          background: "#f4f7f6",
          color: "#16312b",
        }}
      >
        <main
          style={{
            maxWidth: "42rem",
            margin: "0 auto",
            display: "grid",
            gap: "1rem",
          }}
        >
          <h1 style={{ margin: 0 }}>Algo salió mal</h1>
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
              padding: "0.7rem 1.25rem",
              font: "inherit",
            }}
          >
            Reintentar / Try again
          </button>
        </main>
      </body>
    </html>
  );
}
