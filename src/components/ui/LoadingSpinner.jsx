export default function LoadingSpinner({ label = 'Loading' }) {
  return (
    <div className="grid min-h-[50vh] place-items-center">
      <div className="text-center">
        <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-teal-600 dark:border-slate-800 dark:border-t-teal-300" />
        <p className="mt-3 text-sm font-bold text-slate-500 dark:text-slate-400">{label}</p>
      </div>
    </div>
  );
}
