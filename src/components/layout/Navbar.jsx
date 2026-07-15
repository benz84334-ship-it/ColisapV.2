import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiBell, FiCheck, FiMenu, FiMoon, FiSearch, FiSun } from 'react-icons/fi';
import { useAuth } from '../../context/AuthContext.jsx';
import { useData } from '../../context/DataContext.jsx';
import { formatDateTime, normalizeText } from '../../utils/formatters.js';

function buildSearchIndex(data) {
  return [
    ...data.members.map((item) => ({
      id: item.id,
      type: 'Member',
      title: item.fullName,
      subtitle: `${item.memberId} - ${item.barangay}`,
      path: '/members',
      keywords: `${item.fullName} ${item.memberId} ${item.barangay}`,
    })),
  ];
}

export default function Navbar({ onMenu }) {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const data = useData();
  const [query, setQuery] = useState('');
  const [showNotifications, setShowNotifications] = useState(false);

  const searchIndex = useMemo(() => buildSearchIndex(data), [data]);
  const results = useMemo(() => {
    const search = normalizeText(query);
    if (!search) return [];
    return searchIndex.filter((item) => normalizeText(item.keywords).includes(search)).slice(0, 8);
  }, [query, searchIndex]);

  const unread = data.notifications.filter((item) => !item.read).length;
  const dark = data.settings?.theme === 'dark';

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/75 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/80">
      <div className="flex min-h-20 items-center gap-3 px-4 sm:px-6">
        <button
          aria-label="Open menu"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-700 lg:hidden dark:border-slate-700 dark:text-slate-100"
          type="button"
          onClick={onMenu}
        >
          <FiMenu />
        </button>

        <div className="relative hidden max-w-xl flex-1 md:block">
          <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm outline-none transition focus:border-teal-500 focus:bg-white focus:ring-2 focus:ring-teal-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:bg-slate-950"
            placeholder="Global search members..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {results.length ? (
            <div className="absolute left-0 right-0 top-12 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-950">
              {results.map((item) => (
                <button
                  key={`${item.type}-${item.id}`}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-slate-50 dark:hover:bg-slate-900"
                  type="button"
                  onClick={() => {
                    setQuery('');
                    navigate(item.path);
                  }}
                >
                  <span className="rounded bg-teal-100 px-2 py-1 text-xs font-bold text-teal-700 dark:bg-teal-500/15 dark:text-teal-200">
                    {item.type}
                  </span>
                  <span>
                    <span className="block text-sm font-bold text-slate-900 dark:text-white">{item.title}</span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">{item.subtitle}</span>
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            aria-label="Toggle theme"
            className="grid h-11 w-11 place-items-center rounded-lg border border-slate-200 text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-900"
            type="button"
            onClick={() => data.setTheme(dark ? 'light' : 'dark')}
          >
            {dark ? <FiSun /> : <FiMoon />}
          </button>
          <div className="relative">
            <button
              aria-label="View notifications"
              className="relative grid h-11 w-11 place-items-center rounded-lg border border-slate-200 text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-900"
              type="button"
              onClick={() => setShowNotifications((value) => !value)}
            >
              <FiBell />
              {unread ? (
                <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-rose-600 px-1 text-xs font-bold text-white">
                  {unread}
                </span>
              ) : null}
            </button>
            {showNotifications ? (
              <div className="absolute right-0 top-[3.25rem] w-[min(92vw,24rem)] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-950">
                <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                  <p className="text-sm font-bold text-slate-900 dark:text-white">Notifications</p>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {data.notifications.slice(0, 8).map((notification) => (
                    <div key={notification.id} className="border-b border-slate-100 px-4 py-3 last:border-0 dark:border-slate-800">
                      <div className="flex items-start gap-3">
                        <div className={`mt-1 h-2 w-2 rounded-full ${notification.read ? 'bg-slate-300' : 'bg-teal-500'}`} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-slate-900 dark:text-white">{notification.title}</p>
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{notification.message}</p>
                          <p className="mt-2 text-xs text-slate-400">{formatDateTime(notification.createdAt)}</p>
                        </div>
                        {!notification.read ? (
                          <button
                            aria-label="Mark notification read"
                            className="rounded p-1 text-teal-700 hover:bg-teal-50 dark:text-teal-200 dark:hover:bg-teal-500/10"
                            type="button"
                            onClick={() => data.markNotificationRead(notification.id)}
                          >
                            <FiCheck />
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <div className="hidden min-w-0 items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 lg:flex dark:border-slate-700">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-teal-100 text-sm font-black text-teal-700 dark:bg-teal-500/15 dark:text-teal-200">
              {currentUser?.fullName?.[0] || 'U'}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{currentUser?.fullName}</p>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">{currentUser?.role} · {currentUser?.branch || 'Unassigned'}</p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
