import Users from '../users/Users.jsx';

export default function Settings() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black tracking-normal text-slate-950 dark:text-white">Settings</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Manage Barbaza MPC user accounts, branch assignments, roles, and account access.</p>
      </div>

      <Users embedded />
    </div>
  );
}
