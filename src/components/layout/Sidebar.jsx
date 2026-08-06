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
    <div className="relative flex h-full flex-col overflow-hidden border-r border-white/10 bg-slate-950 text-white shadow-2xl">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-20 top-0 h-56 w-56 rounded-full bg-teal-500/15 blur-3xl" />
        <div className="absolute -right-24 top-24 h-72 w-72 rounded-full bg-blue-500/10 blur-3xl" />
      </div>

      <div className="relative flex h-20 items-center justify-between border-b border-white/10 bg-white/5 px-5 backdrop-blur">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/10">
            <BrandMark />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-black tracking-wide">Colisap Monitoring</p>
            <p className="truncate text-xs text-slate-400">{isStaff ? 'Staff Claimant Desk' : 'Barbaza MPC'}</p>
          </div>
        </div>
        <button
          aria-label="Close menu"
          className="rounded-xl p-2 text-slate-300 transition hover:bg-white/10 hover:text-white lg:hidden"
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
                `flex min-h-12 items-center gap-3 rounded-2xl px-4 text-sm font-semibold ring-1 transition ${
                  isActive
                    ? 'bg-teal-400 text-slate-950 ring-teal-300/70 shadow-lg shadow-teal-950/20'
                    : 'bg-white/5 text-slate-200 ring-white/10 hover:bg-white/10 hover:text-white hover:ring-white/20'
                }`
              }
              to={item.path}
              onClick={onClose}
            >
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-white/10">
                <Icon className="shrink-0 text-lg" />
              </span>
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="relative border-t border-white/10 bg-white/5 p-4 backdrop-blur">
        <div className="mb-3 rounded-2xl border border-white/10 bg-slate-900/70 p-3">
          <p className="truncate text-sm font-bold">{currentUser?.fullName || currentUser?.username}</p>
          <p className="truncate text-xs text-slate-400">
            {currentUser?.role} · {currentUser?.branch || 'Unassigned'}
          </p>
        </div>
        <button
          className="flex min-h-11 w-full items-center gap-3 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 text-sm font-semibold text-rose-200 transition hover:bg-rose-500/20 hover:text-white"
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
          <button aria-label="Close menu overlay" className="absolute inset-0 bg-slate-950/60" type="button" onClick={onClose} />
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
