import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { FiAlertTriangle, FiCheckCircle, FiDollarSign, FiPercent, FiTrendingUp, FiUsers } from 'react-icons/fi';
import StatCard from '../../components/cards/StatCard.jsx';
import ChartCard from '../../components/charts/ChartCard.jsx';
import Badge from '../../components/ui/Badge.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useData } from '../../context/DataContext.jsx';
import { buildDashboardData, getBranchScopedData, getCollectionTotal } from '../../utils/analytics.js';
import { CHART_COLORS } from '../../utils/constants.js';
import { formatCurrency, formatDate, todayIso } from '../../utils/formatters.js';

export default function Monitoring() {
  const data = useData();
  const { currentUser } = useAuth();
  const scopedData = getBranchScopedData(data, currentUser?.branch);
  const monitoring = buildDashboardData(scopedData, currentUser?.branch);
  const thisYear = todayIso().slice(0, 4);
  const yearlyCollection = getCollectionTotal(scopedData.payments.filter((payment) => payment.paymentDate?.startsWith(thisYear)));
  const activeAccounts = scopedData.loans.filter((loan) => loan.status === 'Active').length;
  const inactiveAccounts = scopedData.members.filter((member) => member.status === 'Inactive').length;
  const completedAccounts = scopedData.loans.filter((loan) => loan.status === 'Completed').length;
  const overdueAccounts = scopedData.loans.filter((loan) => loan.status === 'Overdue').length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations"
        title="Colisap Monitoring"
        description="Operational view of collection efficiency, active accounts, overdue exposure, and member payment behavior."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard accent="teal" icon={FiUsers} title="Active Accounts" value={activeAccounts} />
        <StatCard accent="orange" icon={FiUsers} title="Inactive Members" value={inactiveAccounts} />
        <StatCard accent="green" icon={FiCheckCircle} title="Completed Accounts" value={completedAccounts} />
        <StatCard accent="red" icon={FiAlertTriangle} title="Overdue Accounts" value={overdueAccounts} />
        <StatCard accent="blue" icon={FiDollarSign} title="Monthly Collection" value={formatCurrency(monitoring.stats.monthlyCollection)} />
        <StatCard accent="violet" icon={FiTrendingUp} title="Yearly Collection" value={formatCurrency(yearlyCollection)} />
        <StatCard accent="green" icon={FiPercent} title="Collection Efficiency" value={`${monitoring.stats.collectionEfficiency}%`} />
        <StatCard accent="orange" icon={FiPercent} title="Payment Percentage" value={`${monitoring.stats.paymentPercentage}%`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <ChartCard className="xl:col-span-2" subtitle="Collection performance by month" title="Collection Performance">
          <ResponsiveContainer height="100%" width="100%">
            <BarChart data={monitoring.collectionTrend}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" />
              <YAxis tickFormatter={(value) => `PHP ${value / 1000}k`} width={76} />
              <Tooltip formatter={(value) => formatCurrency(value)} />
              <Bar dataKey="total" fill="#0f766e" name="Collection" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard subtitle="Paid, partial, pending, overdue" title="Collection Status">
          <ResponsiveContainer height="100%" width="100%">
            <PieChart>
              <Pie data={monitoring.collectionStatus} dataKey="value" innerRadius={58} outerRadius={94} paddingAngle={4}>
                {monitoring.collectionStatus.map((entry, index) => (
                  <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-bold text-slate-950 dark:text-white">Top Paying Members</h2>
            <Badge>Completed</Badge>
          </div>
          <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
            {monitoring.topMembers.map((item, index) => (
              <div key={item.member} className="flex items-center justify-between gap-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-lg bg-teal-100 text-sm font-black text-teal-700 dark:bg-teal-500/15 dark:text-teal-200">
                    {index + 1}
                  </span>
                  <p className="font-bold text-slate-950 dark:text-white">{item.member}</p>
                </div>
                <p className="font-black text-slate-950 dark:text-white">{formatCurrency(item.total)}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-bold text-slate-950 dark:text-white">Most Delayed Accounts</h2>
            <Badge>Overdue</Badge>
          </div>
          <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
            {monitoring.delayedAccounts.map((item) => (
              <div key={item.loanNumber} className="flex flex-wrap items-center justify-between gap-4 py-3">
                <div>
                  <p className="font-bold text-slate-950 dark:text-white">{item.member}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{item.loanNumber} - due {formatDate(item.dueDate)}</p>
                </div>
                <p className="font-black text-rose-600 dark:text-rose-300">{formatCurrency(item.balance)}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
