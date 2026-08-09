import { useMemo, useState } from 'react';
import { FiBell, FiCheck, FiMenu, FiMoon, FiSun } from 'react-icons/fi';
import { useAuth } from '../../context/AuthContext.jsx';
import { useData } from '../../context/DataContext.jsx';
import Modal from '../ui/Modal.jsx';
import { formatDateTime } from '../../utils/formatters.js';

export default function Navbar({ onMenu }) {
  const { currentUser } = useAuth();
  const data = useData();
  const [showNotifications, setShowNotifications] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState(null);

  const visibleNotifications = useMemo(() => data.notifications, [data.notifications]);
  const unread = visibleNotifications.filter((item) => !item.read).length;
  const dark = data.settings?.theme === 'dark';
  const toggleNotifications = () => setShowNotifications((value) => !value);

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-[#F8FAFC]/95 backdrop-blur">
      <div className="flex min-h-20 items-center gap-3 px-4 sm:px-6">
        <button
          aria-label="Open menu"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm lg:hidden"
          type="button"
          onClick={onMenu}
        >
          <FiMenu />
        </button>

        <div className="ml-auto flex items-center gap-2">
          <button
            aria-label="Toggle theme"
            className="grid h-11 w-11 place-items-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50"
            type="button"
            onClick={() => data.setTheme(dark ? 'light' : 'dark')}
          >
            {dark ? <FiSun /> : <FiMoon />}
          </button>
          <div className="relative">
            <button
              aria-label="View notifications"
              className="relative inline-flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-teal-700 shadow-sm transition hover:bg-teal-50"
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
              <div className="absolute right-0 top-[3.25rem] w-[min(92vw,24rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
                <div className="border-b border-slate-200 bg-slate-50/80 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-900">Notifications</p>
                    {visibleNotifications.some((item) => !item.read) ? (
                      <button
                        className="rounded-lg border border-teal-200 px-3 py-1.5 text-xs font-semibold text-teal-700 transition hover:bg-teal-50"
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
                    <div key={notification.id} className="border-b border-slate-100 px-4 py-3 last:border-0">
                      <div className="flex items-start gap-3">
                        <div className={`mt-1 h-2 w-2 rounded-full ${notification.read ? 'bg-slate-300' : 'bg-teal-500'}`} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-900">{notification.title}</p>
                          <p className="mt-1 text-xs text-slate-500">{notification.message}</p>
                          {notification.actionType ? (
                            <p className="mt-1 text-xs font-semibold text-amber-700">
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
                            className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                            type="button"
                            onClick={() => setSelectedNotification(notification)}
                          >
                            View
                          </button>
                          {notification.actionType ? (
                            <button
                              className="rounded-lg border border-amber-200 px-2 py-1 text-xs font-semibold text-amber-800 transition hover:bg-amber-50"
                              type="button"
                              onClick={() => setSelectedNotification(notification)}
                            >
                              See details
                            </button>
                          ) : null}
                          {!notification.read ? (
                            <button
                              aria-label="Mark notification read"
                              className="rounded-lg p-1 text-teal-700 transition hover:bg-teal-50"
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
                  <div className="px-4 py-6 text-center text-sm text-slate-500">
                    No notifications yet.
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="hidden min-w-0 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm lg:flex">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-teal-100 text-sm font-bold text-teal-700">
              {currentUser?.fullName?.[0] || 'U'}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">{currentUser?.fullName}</p>
              <p className="truncate text-xs text-slate-500">{currentUser?.role} · {currentUser?.branch || 'Unassigned'}</p>
            </div>
          </div>
        </div>
      </div>

      <button
        aria-label="Open notifications"
        className="fixed bottom-5 right-5 z-40 inline-flex h-14 w-14 items-center justify-center rounded-full bg-teal-700 text-white shadow-lg transition hover:bg-teal-800 focus:outline-none focus:ring-4 focus:ring-teal-500/30 sm:hidden"
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
            className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800"
            type="button"
            onClick={() => setSelectedNotification(null)}
          >
            Close
          </button>
        }
      >
        <div className="space-y-4 text-center">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-bold uppercase tracking-normal text-slate-400">Decision</p>
            <div className="mt-2 flex items-center justify-center gap-2">
              <span
                className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ${
                  selectedNotification?.actionType === 'reject'
                    ? 'bg-rose-100 text-rose-700'
                    : selectedNotification?.actionType === 'return'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-emerald-100 text-emerald-700'
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
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-normal text-slate-400">Reason</p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800">
              {selectedNotification?.reason || 'No reason provided by reviewer.'}
            </p>
          </div>
        </div>
      </Modal>
    </header>
  );
}
