export default function ChartCard({ title, subtitle, children, className = '' }) {
  return (
    <section className={`rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950 ${className}`}>
      <div className="mb-4">
        <h2 className="text-base font-bold text-slate-950 dark:text-white">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p> : null}
      </div>
      <div className="h-72">{children}</div>
    </section>
  );
}
