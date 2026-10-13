export default function NotFound() {
  return (
    <main className="phone">
      <header className="appbar">
        <img src="/indeca-logo.png" alt="Indeca Crude Xpress" />
      </header>
      <div className="body-pad">
        <h1 className="heading" style={{ fontSize: 28 }}>Not found</h1>
        <p className="lead">This page or report doesn&apos;t exist, or you don&apos;t have access to it. If you scanned a QR sticker, check that it&apos;s the whole code.</p>
        <a href="/" className="btn btn-primary btn-big">
          Go to the start
        </a>
      </div>
    </main>
  );
}
