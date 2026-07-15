import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  FiFileText,
  FiHome,
  FiLogOut,
  FiSettings,
  FiUsers,
  FiX,
} from 'react-icons/fi';
import { NAV_ITEMS } from '../../utils/constants.js';
import { useAuth } from '../../context/AuthContext.jsx';
import BrandMark from '../brand/BrandMark.jsx';

const iconMap = {
  Dashboard: FiHome,
  Members: FiUsers,
  Reports: FiFileText,
  Settings: FiSettings,
};

export default function Sidebar({ open, onClose }) {
  const { currentUser, hasRole, logout } = useAuth();
  const items = NAV_ITEMS.filter((item) => hasRole(item.roles));

  const content = (
    <div className="flex h-full flex-col bg-blue-900 text-white">
      <div className="flex h-20 items-center justify-between border-b border-white/10 px-5">
        <div className="flex min-w-0 items-center gap-3">
          <BrandMark />
          <div className="min-w-0">
            <p className="truncate text-sm font-black">Colisap Monitoring</p>
            <p className="truncate text-xs text-slate-400">Barbaza MPC</p>
          </div>
        </div>
        <button aria-label="Close menu" className="rounded-lg p-2 lg:hidden" type="button" onClick={onClose}>
          <FiX />
        </button>
      </div>

      <nav className="flex-1 space-y-1.5 overflow-y-auto px-3 py-5">
        <p className="mb-3 px-3 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Workspace</p>
        {items.map((item) => {
          const Icon = iconMap[item.label] || FiHome;
          return (
            <NavLink
              key={item.path}
              className={({ isActive }) =>
                `flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition ${
                  isActive ? 'bg-teal-400 text-slate-950 shadow-lg shadow-teal-950/20' : 'text-slate-300 hover:bg-white/10 hover:text-white'
                }`
              }
              to={item.path}
              onClick={onClose}
            >
              <Icon className="shrink-0 text-lg" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-4">
        <div className="mb-3 rounded-xl bg-white/5 p-3">
          <p className="truncate text-sm font-bold">{currentUser?.fullName || currentUser?.username}</p>
          <p className="truncate text-xs text-slate-500">{currentUser?.role} · {currentUser?.branch || 'Unassigned'}</p>
        </div>
        <button
          className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-slate-300 transition hover:bg-rose-500/10 hover:text-rose-300"
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
