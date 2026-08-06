export default function PageHeader({ eyebrow, title, description, actions, children, className = '' }) {
  return (
    <section className={`overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-r from-slate-950 via-slate-900 to-teal-900 p-5 shadow-sm sm:p-6 dark:border-slate-800 ${className}`}>
      <div className="relative">
        <div className="pointer-events-none absolute -right-10 -top-8 h-32 w-32 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-8 right-1/4 h-24 w-24 rounded-full bg-teal-400/20 blur-3xl" />
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            {eyebrow ? <p className="text-xs font-bold uppercase tracking-[0.22em] text-teal-200">{eyebrow}</p> : null}
            <h1 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-4xl">{title}</h1>
            {description ? <p className="mt-2 text-sm leading-6 text-slate-200/90">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
        </div>
        {children ? <div className="relative mt-5">{children}</div> : null}
      </div>
    </section>
  );
}
