export function AuthShell({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: React.ReactNode }) {
  return (
    <main className="auth-page">
      <section className="auth-brand-panel">
        <div className="auth-brand"><span className="brand-mark"><i /><i /><i /></span><strong>Mingle</strong></div>
        <div className="auth-pitch">
          <p>TECHQUERIA PEOPLE DIRECTORY</p>
          <h1>Find the people<br />who can <em>help.</em></h1>
          <span>Search and connect with thousands of synced community members in one secure workspace.</span>
        </div>
        <small><span aria-hidden="true">✓</span> Protected access · Administrator approved</small>
      </section>
      <section className="auth-content">
        <div className="auth-card">
          <p className="auth-eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
          <p className="auth-description">{description}</p>
          {children}
        </div>
      </section>
    </main>
  );
}
