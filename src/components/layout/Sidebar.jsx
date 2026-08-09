import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  FiFileText,
  FiHome,
  FiLogOut,
  FiSettings,
  FiCheckSquare,
  FiClipboard,
  FiDollarSign,
  FiUsers,
  FiX,
} from 'react-icons/fi';
import { NAV_ITEMS } from '../../utils/constants.js';
import { useAuth } from '../../context/AuthContext.jsx';
import BrandMark from '../brand/BrandMark.jsx';

const iconMap = {
  Dashboard: FiHome,
  Members: FiUsers,
  'Claimant Application': FiClipboard,
  Contributions: FiDollarSign,
  'Request Approval': FiCheckSquare,
  Reports: FiFileText,
  Settings: FiSettings,
};

export default function Sidebar({ open, onClose }) {
  const { currentUser, hasRole, logout } = useAuth();
  const items = NAV_ITEMS.filter((item) => hasRole(item.roles));
  const isStaff = currentUser?.role === 'Staff';

  const content = (
    <div className="relative flex h-full flex-col overflow-hidden border-r border-slate-200 bg-white text-slate-900 shadow-sm">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-20 top-0 h-56 w-56 rounded-full bg-teal-500/5 blur-3xl" />
        <div className="absolute -right-24 top-24 h-72 w-72 rounded-full bg-emerald-500/5 blur-3xl" />
      </div>

      <div className="relative flex h-20 items-center justify-between border-b border-slate-200 bg-white px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-slate-200 bg-slate-50">
            <BrandMark />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold tracking-wide text-slate-900">Colisap Monitoring</p>
          </div>
        </div>
        <button
          aria-label="Close menu"
          className="rounded-xl p-2 text-slate-500 transition hover:bg-teal-50 hover:text-teal-700 lg:hidden"
          type="button"
          onClick={onClose}
        >
          <FiX />
        </button>
      </div>

      <nav className="relative flex-1 space-y-3 overflow-y-auto px-3 py-5">
        <p className="px-3 text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
          {isStaff ? 'Claimant Workspace' : 'Workspace'}
        </p>
        {items.map((item) => {
          const Icon = iconMap[item.label] || FiHome;

          return (
            <NavLink
              key={item.path}
              className={({ isActive }) =>
                `flex min-h-12 items-center gap-3 rounded-2xl px-4 text-sm font-medium ring-1 transition ${
                  isActive
                    ? 'bg-[#CCFBF1] text-[#0F766E] ring-teal-200 shadow-sm'
                    : 'bg-white text-slate-700 ring-transparent hover:bg-teal-50 hover:text-teal-700 hover:ring-teal-100'
                }`
              }
              to={item.path}
              onClick={onClose}
            >
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-transparent">
                <Icon className="shrink-0 text-lg" />
              </span>
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="relative border-t border-slate-200 bg-white p-4">
        <div className="mb-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <p className="truncate text-sm font-semibold text-slate-900">{currentUser?.fullName || currentUser?.username}</p>
          <p className="truncate text-xs text-slate-500">
            {currentUser?.role} · {currentUser?.branch || 'Unassigned'}
          </p>
        </div>
        <button
          className="flex min-h-11 w-full items-center gap-3 rounded-2xl border border-rose-200 bg-white px-4 text-sm font-medium text-rose-600 transition hover:bg-rose-50 hover:text-rose-700"
          type="button"
          onClick={logout}
        >
          <FiLogOut />
          Logout
        </button>
      </div>
    </div>
  );

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 lg:block">{content}</aside>
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button aria-label="Close menu overlay" className="absolute inset-0 bg-slate-900/30" type="button" onClick={onClose} />
          <motion.aside
            animate={{ x: 0 }}
            className="absolute inset-y-0 left-0 w-[min(85vw,18rem)]"
            initial={{ x: '-100%' }}
            transition={{ duration: 0.22 }}
          >
            {content}
          </motion.aside>
        </div>
      ) : null}
    </>
  );
}
