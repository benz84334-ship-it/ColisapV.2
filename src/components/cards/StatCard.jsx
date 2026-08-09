export default function StatCard({ title, value, icon: Icon, accent = 'teal', meta, action }) {
  const accents = {
    teal: 'bg-teal-50 text-teal-700 ring-teal-100',
    blue: 'bg-blue-50 text-blue-700 ring-blue-100',
    green: 'bg-green-50 text-green-700 ring-green-100',
    orange: 'bg-amber-50 text-amber-700 ring-amber-100',
    red: 'bg-rose-50 text-rose-700 ring-rose-100',
    violet: 'bg-teal-50 text-teal-700 ring-teal-100',
  };

  return (
    <div className="group flex h-full rounded-[14px] border border-[#E2E8F0] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{value}</p>
        </div>
        {Icon ? (
          <div className={`grid h-12 w-12 place-items-center rounded-2xl ring-1 ${accents[accent]}`}>
            <Icon className="text-xl" />
          </div>
        ) : null}
      </div>
      {meta ? <p className="mt-4 text-xs font-medium text-slate-500">{meta}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
