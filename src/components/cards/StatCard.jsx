export default function StatCard({ title, value, icon: Icon, accent = 'teal', meta, action }) {
  const accents = {
    teal: 'bg-teal-100 text-teal-700 ring-teal-500/10 dark:bg-teal-500/15 dark:text-teal-200',
    blue: 'bg-blue-100 text-blue-700 ring-blue-500/10 dark:bg-blue-500/15 dark:text-blue-200',
    green: 'bg-emerald-100 text-emerald-700 ring-emerald-500/10 dark:bg-emerald-500/15 dark:text-emerald-200',
    orange: 'bg-orange-100 text-orange-700 ring-orange-500/10 dark:bg-orange-500/15 dark:text-orange-200',
    red: 'bg-rose-100 text-rose-700 ring-rose-500/10 dark:bg-rose-500/15 dark:text-rose-200',
    violet: 'bg-violet-100 text-violet-700 ring-violet-500/10 dark:bg-violet-500/15 dark:text-violet-200',
  };

  return (
    <div className="group rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">{title}</p>
          <p className="mt-2 text-3xl font-black tracking-tight text-slate-950 dark:text-white">{value}</p>
        </div>
        {Icon ? (
          <div className={`grid h-12 w-12 place-items-center rounded-2xl ring-1 ${accents[accent]}`}>
            <Icon className="text-xl" />
          </div>
        ) : null}
      </div>
      {meta ? <p className="mt-4 text-xs font-medium text-slate-500 dark:text-slate-400">{meta}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
