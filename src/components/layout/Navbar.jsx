import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiBell, FiCheck, FiMenu, FiMoon, FiSearch, FiSun } from 'react-icons/fi';
import { useAuth } from '../../context/AuthContext.jsx';
import { useData } from '../../context/DataContext.jsx';
import Modal from '../ui/Modal.jsx';
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
  const [selectedNotification, setSelectedNotification] = useState(null);

  const searchIndex = useMemo(() => buildSearchIndex(data), [data]);
  const results = useMemo(() => {
    const search = normalizeText(query);
    if (!search) return [];
    return searchIndex.filter((item) => normalizeText(item.keywords).includes(search)).slice(0, 8);
  }, [query, searchIndex]);

  const visibleNotifications = useMemo(() => data.notifications, [data.notifications]);
  const unread = visibleNotifications.filter((item) => !item.read).length;
  const dark = data.settings?.theme === 'dark';
  const toggleNotifications = () => setShowNotifications((value) => !value);

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/80 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/85">
      <div className="flex min-h-20 items-center gap-3 px-4 sm:px-6">
        <button
          aria-label="Open menu"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm lg:hidden dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          type="button"
          onClick={onMenu}
        >
          <FiMenu />
        </button>

        <div className="relative hidden max-w-xl flex-1 md:block">
          <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:bg-white focus:ring-2 focus:ring-teal-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:bg-slate-950"
            placeholder="Global search members..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {results.length ? (
            <div className="absolute left-0 right-0 top-12 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950">
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
                  <span className="rounded-full bg-teal-100 px-2 py-1 text-xs font-bold text-teal-700 dark:bg-teal-500/15 dark:text-teal-200">
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
            className="grid h-11 w-11 place-items-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
            type="button"
            onClick={() => data.setTheme(dark ? 'light' : 'dark')}
          >
            {dark ? <FiSun /> : <FiMoon />}
          </button>
          <div className="relative">
            <button
              aria-label="View notifications"
              className="relative inline-flex h-11 items-center gap-2 rounded-2xl border border-teal-200 bg-teal-50 px-4 text-sm font-bold text-teal-800 shadow-sm transition hover:bg-teal-100 dark:border-teal-500/30 dark:bg-teal-500/10 dark:text-teal-100 dark:hover:bg-teal-500/20"
              type="button"
              onClick={toggleNotifications}
            >
              <FiBell />
              <span className="hidden sm:inline">Notifications</span>
              {unread ? (
                <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-rose-600 px-1 text-xs font-bold text-white">
                  {unread}
                </span>
              ) : null}
            </button>
            {showNotifications ? (
              <div className="absolute right-0 top-[3.25rem] w-[min(92vw,24rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950">
                <div className="border-b border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/50">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-bold text-slate-900 dark:text-white">Notifications</p>
                    {visibleNotifications.some((item) => !item.read) ? (
                      <button
                        className="rounded-lg border border-teal-200 px-3 py-1.5 text-xs font-semibold text-teal-700 transition hover:bg-teal-50 dark:border-teal-500/30 dark:text-teal-200 dark:hover:bg-teal-500/10"
                        type="button"
                        onClick={() => data.markAllNotificationsRead()}
                      >
                        Mark all read
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {visibleNotifications.slice(0, 8).map((notification) => (
                    <div key={notification.id} className="border-b border-slate-100 px-4 py-3 last:border-0 dark:border-slate-800">
                      <div className="flex items-start gap-3">
                        <div className={`mt-1 h-2 w-2 rounded-full ${notification.read ? 'bg-slate-300' : 'bg-teal-500'}`} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-slate-900 dark:text-white">{notification.title}</p>
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{notification.message}</p>
                          {notification.actionType ? (
                            <p className="mt-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
                              {notification.actionType === 'reject'
                                ? 'Rejected reason available.'
                                : notification.actionType === 'return'
                                  ? 'Return reason available.'
                                  : 'Approval details available.'}
                            </p>
                          ) : null}
                          <p className="mt-2 text-xs text-slate-400">{formatDateTime(notification.createdAt)}</p>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <button
                            className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900"
                            type="button"
                            onClick={() => setSelectedNotification(notification)}
                          >
                            View
                          </button>
                          {notification.actionType ? (
                            <button
                              className="rounded-lg border border-amber-200 px-2 py-1 text-xs font-semibold text-amber-800 transition hover:bg-amber-50 dark:border-amber-900 dark:text-amber-200 dark:hover:bg-amber-500/10"
                              type="button"
                              onClick={() => setSelectedNotification(notification)}
                            >
                              See details
                            </button>
                          ) : null}
                          {!notification.read ? (
                            <button
                              aria-label="Mark notification read"
                              className="rounded-lg p-1 text-teal-700 transition hover:bg-teal-50 dark:text-teal-200 dark:hover:bg-teal-500/10"
                              type="button"
                              onClick={() => data.markNotificationRead(notification.id)}
                            >
                              <FiCheck />
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {!visibleNotifications.length ? (
                  <div className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                    No notifications yet.
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="hidden min-w-0 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm lg:flex dark:border-slate-700 dark:bg-slate-900">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-teal-100 text-sm font-black text-teal-700 dark:bg-teal-500/15 dark:text-teal-200">
              {currentUser?.fullName?.[0] || 'U'}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{currentUser?.fullName}</p>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">{currentUser?.role} · {currentUser?.branch || 'Unassigned'}</p>
            </div>
          </div>
        </div>
      </div>

      <button
        aria-label="Open notifications"
        className="fixed bottom-5 right-5 z-40 inline-flex h-14 w-14 items-center justify-center rounded-full bg-teal-600 text-white shadow-2xl transition hover:bg-teal-700 focus:outline-none focus:ring-4 focus:ring-teal-500/30 sm:hidden"
        type="button"
        onClick={toggleNotifications}
      >
        <FiBell className="text-xl" />
        {unread ? (
          <span className="absolute -right-0.5 -top-0.5 grid h-6 min-w-6 place-items-center rounded-full bg-rose-600 px-1 text-[11px] font-bold text-white">
            {unread}
          </span>
        ) : null}
      </button>

      <Modal
        open={Boolean(selectedNotification)}
        title="Notification Details"
        description={selectedNotification?.message || ''}
        maxWidth="max-w-md"
        onClose={() => setSelectedNotification(null)}
        footer={
          <button
            className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700"
            type="button"
            onClick={() => setSelectedNotification(null)}
          >
            Close
          </button>
        }
      >
        <div className="space-y-4 text-center">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-bold uppercase tracking-normal text-slate-400">Decision</p>
            <div className="mt-2 flex items-center justify-center gap-2">
              <span
                className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ${
                  selectedNotification?.actionType === 'reject'
                    ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-200'
                    : selectedNotification?.actionType === 'return'
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200'
                      : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200'
                }`}
              >
                {selectedNotification?.actionType === 'reject'
                  ? 'Rejected'
                  : selectedNotification?.actionType === 'return'
                    ? 'Returned for correction'
                    : 'Approved'}
              </span>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <p className="text-xs font-bold uppercase tracking-normal text-slate-400">Reason</p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800 dark:text-slate-200">
              {selectedNotification?.reason || 'No reason provided by reviewer.'}
            </p>
          </div>
        </div>
      </Modal>
    </header>
  );
}
