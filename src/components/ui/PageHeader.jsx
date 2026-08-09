export default function PageHeader({ eyebrow, title, description, actions, children, className = '' }) {
  return (
    <section className={`overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] ${className}`}>
      <div className="relative">
        <div className="pointer-events-none absolute -right-10 -top-8 h-32 w-32 rounded-full bg-teal-500/5 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-8 right-1/4 h-24 w-24 rounded-full bg-emerald-500/5 blur-3xl" />
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            {eyebrow ? <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-700">{eyebrow}</p> : null}
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{title}</h1>
            {description ? <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
        </div>
        {children ? <div className="relative mt-5">{children}</div> : null}
      </div>
    </section>
  );
}
