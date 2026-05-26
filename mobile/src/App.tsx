// Placeholder app shell for Phase 0 scaffold (DSHKI-46).
// The real "Hello Dashki" + Glass UI primitives are DSHKI-48.
// This page exists only to prove Tailwind + the Notion-inspired design
// tokens copied into src/index.css render correctly.
function App() {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-6"
      style={{ background: 'var(--color-background)' }}
    >
      <div className="text-center space-y-3 max-w-md">
        <h1 className="text-4xl font-semibold tracking-tight">Dashki</h1>
        <p
          className="text-sm"
          style={{ color: 'var(--color-muted-foreground)' }}
        >
          Mobile app scaffold — DSHKI-46
        </p>
        <p
          className="text-xs"
          style={{ color: 'var(--color-placeholder)' }}
        >
          Hello-screen + native shell wiring coming in DSHKI-47 / DSHKI-48.
        </p>
      </div>
    </div>
  );
}

export default App;
