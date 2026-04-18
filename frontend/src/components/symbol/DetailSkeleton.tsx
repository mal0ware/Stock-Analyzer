/**
 * Loading skeleton for SymbolDetail. Approximates the page layout so the
 * content-shift is minimal when data resolves.
 */

export default function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <div className="skeleton h-7 w-52" />
        <div className="skeleton h-5 w-36 mt-2" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton h-20 rounded-xl" />
        ))}
      </div>
      <div className="skeleton h-8 w-64 rounded-lg" />
      <div className="skeleton h-[420px] rounded-xl" />
      <div className="grid md:grid-cols-2 gap-5">
        <div className="skeleton h-64 rounded-xl" />
        <div className="skeleton h-64 rounded-xl" />
      </div>
    </div>
  );
}
