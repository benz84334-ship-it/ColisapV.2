import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiEye, FiEyeOff, FiLock, FiMapPin, FiUser } from 'react-icons/fi';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import Button from '../../components/ui/Button.jsx';
import FormField from '../../components/forms/FormField.jsx';
import Modal from '../../components/ui/Modal.jsx';
import BrandMark from '../../components/brand/BrandMark.jsx';

export default function Login() {
  const { isAuthenticated, login } = useAuth();
  const { showToast } = useToast();
  const location = useLocation();
  const [form, setForm] = useState({ username: 'admin', password: 'admin123', remember: true });
  const [showPassword, setShowPassword] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [error, setError] = useState('');

  if (isAuthenticated) {
    return <Navigate replace to={location.state?.from?.pathname || '/dashboard'} />;
  }

  const handleSubmit = (event) => {
    event.preventDefault();
    const result = login(form);
    if (!result.ok) {
      setError(result.message);
      showToast(result.message, 'error');
      return;
    }
    showToast('Welcome back to Barbaza MPC.');
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_.9fr]">
      <section className="hidden bg-slate-950 p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3">
          <BrandMark className="h-12 w-12" />
          <div>
            <p className="text-sm font-black">Barbaza MPC</p>
            <p className="text-xs text-slate-400">Colisap Monitoring System</p>
          </div>
        </div>
        <motion.div animate={{ opacity: 1, y: 0 }} initial={{ opacity: 0, y: 16 }} transition={{ duration: 0.4 }}>
          <p className="mb-4 text-sm font-bold uppercase tracking-widest text-teal-300">Community monitoring system</p>
          <h1 className="max-w-3xl text-5xl font-black leading-tight tracking-normal">
            Reliable records for the Colisap community.
          </h1>
          <div className="mt-8 rounded-2xl border border-teal-400/20 bg-gradient-to-br from-teal-500/15 to-emerald-500/10 p-5 backdrop-blur">
            <div className="flex items-center gap-2 text-sm font-semibold text-teal-200">
              <FiMapPin className="h-4 w-4" />
              A welcoming place for Antique communities
            </div>
            <p className="mt-2 text-sm text-slate-300">
              From barangay updates to member records, this space helps the cooperative stay connected to local life.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {['Barangay records', 'Member updates', 'Local reports'].map((item) => (
                <span key={item} className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-teal-50">
                  {item}
                </span>
              ))}
            </div>
          </div>
          <div className="mt-10 grid grid-cols-3 gap-4">
            {['Member records', 'Activity monitoring', 'Reports and history'].map((item) => (
              <div key={item} className="rounded-lg border border-white/10 bg-white/5 p-4">
                <p className="text-sm font-bold text-teal-100">{item}</p>
              </div>
            ))}
          </div>
        </motion.div>
        <p className="text-sm text-slate-400">Barbaza Multi-Purpose Cooperative · Antique</p>
      </section>

      <section className="flex items-center justify-center px-4 py-10 sm:px-6">
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-950"
          initial={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.3 }}
        >
          <div className="mb-6 lg:hidden">
            <BrandMark className="h-12 w-12" />
          </div>
          <h2 className="text-2xl font-black text-slate-950 dark:text-white">Sign in</h2>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Enter your assigned account to continue.</p>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <div className="relative">
              <FiUser className="absolute left-3 top-[2.55rem] text-slate-400" />
              <FormField
                label="Username"
                inputClassName="pl-10"
                value={form.username}
                onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
              />
            </div>
            <div className="relative">
              <FiLock className="absolute left-3 top-[2.55rem] text-slate-400" />
              <FormField
                label="Password"
                inputClassName="pl-10 pr-10"
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
              />
              <button
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-[2.35rem] rounded p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                type="button"
                onClick={() => setShowPassword((value) => !value)}
              >
                {showPassword ? <FiEyeOff /> : <FiEye />}
              </button>
            </div>

            {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 dark:bg-rose-500/10 dark:text-rose-200">{error}</p> : null}

            <div className="flex items-center justify-between gap-3">
              <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
                <input
                  checked={form.remember}
                  className="h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
                  type="checkbox"
                  onChange={(event) => setForm((current) => ({ ...current, remember: event.target.checked }))}
                />
                Remember me
              </label>
              <button className="text-sm font-bold text-teal-700 hover:text-teal-900 dark:text-teal-200" type="button" onClick={() => setForgotOpen(true)}>
                Forgot password?
              </button>
            </div>

            <Button className="w-full" type="submit">
              Login
            </Button>
          </form>

        </motion.div>
      </section>

      <Modal
        open={forgotOpen}
        title="Forgot password"
        description="Demo recovery UI only. An administrator can reset passwords from User Management."
        maxWidth="max-w-md"
        onClose={() => setForgotOpen(false)}
        footer={
          <Button onClick={() => setForgotOpen(false)}>
            Done
          </Button>
        }
      >
        <FormField label="Username or email" placeholder="Enter account username or email" />
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">For this LocalStorage demo, use the admin account to reset a user password directly.</p>
      </Modal>
    </div>
  );
}
