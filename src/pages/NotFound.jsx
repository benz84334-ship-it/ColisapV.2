import { Link } from 'react-router-dom';
import Button from '../components/ui/Button.jsx';

export default function NotFound() {
  return (
    <div className="grid min-h-[70vh] place-items-center">
      <div className="max-w-md text-center">
        <p className="text-sm font-bold uppercase tracking-normal text-teal-700 dark:text-teal-200">404</p>
        <h1 className="mt-2 text-3xl font-black text-slate-950 dark:text-white">Page not found</h1>
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">The requested Colisap workspace page does not exist.</p>
        <Link className="mt-6 inline-block" to="/dashboard">
          <Button>Back to Dashboard</Button>
        </Link>
      </div>
    </div>
  );
}
