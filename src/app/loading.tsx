export default function Loading() {
  return (
    <div className="space-y-8 animate-pulse">
      <section className="text-center pt-2 pb-4">
        <div className="h-9 bg-gray-200 rounded-lg w-3/4 mx-auto mb-3" />
        <div className="h-4 bg-gray-200 rounded w-1/2 mx-auto" />
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-border p-6 h-80" />
        <div className="bg-white rounded-xl border border-border p-4 h-80" />
      </div>

      <div className="bg-white rounded-xl border border-border p-4 h-20" />

      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-xl border border-border p-4 h-40" />
        ))}
      </div>
    </div>
  );
}
