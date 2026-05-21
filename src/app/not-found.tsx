import Link from "next/link";

export default function NotFound() {
  return (
    <div className="py-20 max-w-2xl">
      <div className="text-[11px] tracking-[0.3em] uppercase text-accent font-bold mb-4">שגיאה · 404</div>
      <div className="text-[120px] font-black leading-none tracking-tighter mb-6 text-foreground">
        404<span className="text-accent">.</span>
      </div>
      <h1 className="text-2xl font-black mb-3 tracking-tight">הדף לא נמצא</h1>
      <p className="text-foreground-muted mb-10 max-w-md leading-relaxed">
        העמוד שביקשתם לא קיים. אולי הקישור שגוי, או שהפוליטיקאי שחיפשתם אינו במאגר עדיין.
      </p>
      <Link
        href="/"
        className="inline-block bg-foreground text-background px-6 py-3 text-sm tracking-wider uppercase font-bold hover:bg-accent transition-colors"
        style={{ borderRadius: 2 }}
      >
        חזרה לעמוד הראשי
      </Link>
    </div>
  );
}
