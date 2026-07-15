import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { FiDownload, FiFileText } from 'react-icons/fi';
import Button from '../../components/ui/Button.jsx';
import FormField from '../../components/forms/FormField.jsx';
import DataTable from '../../components/tables/DataTable.jsx';
import ChartCard from '../../components/charts/ChartCard.jsx';
import StatCard from '../../components/cards/StatCard.jsx';
import ExportActions from '../../components/ui/ExportActions.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useData } from '../../context/DataContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { getBranchScopedData, monthlyCollections } from '../../utils/analytics.js';
import { addDays, formatCurrency, formatDate, todayIso } from '../../utils/formatters.js';
import { ROLES } from '../../utils/constants.js';

const reportTypes = ['Weekly Availment', 'Monthly Availment'];
const supportedReportTypes = ['Member', ...reportTypes];
const calendarMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function rangeFor(type, dateFrom, dateTo) {
  const today = todayIso();
  const year = today.slice(0, 4);
  const month = today.slice(0, 7);
  const quarter = Math.floor((Number(today.slice(5, 7)) - 1) / 3);
  const quarterStart = `${year}-${String(quarter * 3 + 1).padStart(2, '0')}-01`;
  const quarterEnd = addDays(new Date(Number(year), quarter * 3 + 3, 0), 0);

  if (type === 'Daily') return { from: today, to: today };
  if (type === 'Weekly' || type === 'Weekly Availment') return { from: addDays(today, -6), to: today };
  if (type === 'Monthly' || type === 'Monthly Availment') return { from: `${month}-01`, to: today };
  if (type === 'Quarterly') return { from: quarterStart, to: quarterEnd };
  if (type === 'Annual') return { from: `${year}-01-01`, to: `${year}-12-31` };
  return { from: dateFrom, to: dateTo };
}

function inRange(date, range) {
  const value = new Date(date);
  return value >= new Date(range.from) && value <= new Date(range.to);
}

function buildRows(type, data, range) {
  if (type === 'Availment' || type.endsWith('Availment')) {
    return (data.availments || []).filter((item) => inRange(item.availmentDate, range)).map((item) => ({
      id: item.id, memberId: item.memberId, reference: item.reference, member: item.memberName, date: item.availmentDate,
      type: item.availmentType, amount: item.amount, status: item.status,
    }));
  }
  if (type === 'Member') {
    const membershipRows = data.members.filter((member) => inRange(member.membershipDate, range)).map((member) => ({
      id: `membership-${member.id}`, memberId: member.id, reference: member.memberId, member: member.fullName,
      date: member.membershipDate, type: 'Membership / Share Capital', amount: member.shareCapital, status: member.status,
    }));
    const loanRows = (data.loans || []).filter((loan) => inRange(loan.releaseDate, range)).map((loan) => ({
      id: `loan-${loan.id}`, memberId: loan.memberId, reference: loan.loanNumber, member: loan.memberName,
      date: loan.releaseDate, type: 'Loan Released', amount: loan.principalAmount, status: loan.status,
    }));
    const availmentRows = (data.availments || []).filter((item) => inRange(item.availmentDate, range)).map((item) => ({
      id: `availment-${item.id}`, memberId: item.memberId, reference: item.monitoringReference || item.reference,
      member: item.memberName, date: item.availmentDate, type: `Availment - ${item.availmentType}`,
      amount: item.amount, status: item.status,
    }));
    const collectionRows = (data.collections || []).filter((collection) => inRange(collection.collectionDate, range)).map((collection) => ({
      id: `collection-${collection.id}`, memberId: collection.memberId, reference: collection.collectionId,
      member: collection.memberName, date: collection.collectionDate, type: 'Collection',
      amount: collection.amountPaid, status: collection.status,
    }));
    const paymentRows = (data.payments || []).filter((payment) => inRange(payment.paymentDate, range)).map((payment) => ({
      id: `payment-${payment.id}`, memberId: payment.memberId, reference: payment.receiptNumber,
      member: payment.memberName, date: payment.paymentDate, type: `Payment - ${payment.paymentType}`,
      amount: Number(payment.amount || 0) + Number(payment.penalty || 0), status: payment.status,
    }));

    return [...membershipRows, ...loanRows, ...availmentRows, ...collectionRows, ...paymentRows]
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }
  if (type === 'Collection') {
    return data.collections.filter((collection) => inRange(collection.collectionDate, range)).map((collection) => ({
      id: collection.id, memberId: collection.memberId, reference: collection.collectionId, member: collection.memberName, date: collection.collectionDate,
      type: collection.collector, amount: collection.amountPaid, status: collection.status,
    }));
  }

  return data.payments
    .filter((payment) => inRange(payment.paymentDate, range))
    .filter((payment) => (type === 'Penalty' ? Number(payment.penalty || 0) > 0 : true))
    .map((payment) => ({
      id: payment.id,
      memberId: payment.memberId,
      reference: payment.receiptNumber,
      member: payment.memberName,
      date: payment.paymentDate,
      type: type === 'Penalty' ? 'Penalty' : payment.paymentType,
      amount: type === 'Penalty' ? payment.penalty : Number(payment.amount || 0) + Number(payment.penalty || 0),
      status: payment.status,
    }));
}

export default function Reports() {
  const [searchParams] = useSearchParams();
  const data = useData();
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const scopedData = useMemo(
    () => (currentUser?.role === ROLES.ADMIN ? data : getBranchScopedData(data, currentUser?.branch)),
    [currentUser?.branch, currentUser?.role, data],
  );
  const [filters, setFilters] = useState(() => ({
    type: supportedReportTypes.includes(searchParams.get('type')) ? searchParams.get('type') : 'Monthly Availment',
    memberId: searchParams.get('memberId') || '',
    dateFrom: searchParams.get('dateFrom') || `${todayIso().slice(0, 7)}-01`,
    dateTo: searchParams.get('dateTo') || todayIso(),
  }));
  const [generated, setGenerated] = useState(null);

  useEffect(() => {
    let currentDate = todayIso();
    const refreshForNewDay = () => {
      const nextDate = todayIso();
      if (nextDate === currentDate) return;

      setFilters((current) => ({
        ...current,
        dateTo: current.dateTo === currentDate ? nextDate : current.dateTo,
      }));
      setGenerated(null);
      currentDate = nextDate;
    };
    const timer = window.setInterval(refreshForNewDay, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const updateFilter = (key, value) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setGenerated(null);
  };

  const activeRange = rangeFor(filters.type, filters.dateFrom, filters.dateTo);
  const previewRows = useMemo(() => {
    const rows = buildRows(filters.type, scopedData, activeRange);
    if (!filters.memberId) return rows;

    const selectedMember = scopedData.members.find((member) => member.id === filters.memberId);
    return rows.filter((row) => (
      row.id === filters.memberId
      || row.memberId === filters.memberId
      || row.member === selectedMember?.fullName
    ));
  }, [activeRange.from, activeRange.to, filters.memberId, filters.type, scopedData]);
  const reportRows = generated?.rows || previewRows;
  const previewTotal = previewRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const totalAmount = generated?.totalAmount ?? previewTotal;
  const monthlyTotals = monthlyCollections(reportRows.map((row) => ({ amount: row.amount, penalty: 0, paymentDate: row.date })));
  const reportChart = calendarMonths.map((month) => ({
    month,
    total: monthlyTotals.find((item) => item.month === month)?.total || 0,
  }));

  const columns = [
    { key: 'reference', label: 'Reference' },
    { key: 'member', label: 'Member' },
    { key: 'date', label: 'Date', render: (row) => formatDate(row.date) },
    { key: 'type', label: 'Type' },
    { key: 'amount', label: 'Amount', render: (row) => formatCurrency(row.amount), sortKey: (row) => Number(row.amount) },
    { key: 'status', label: 'Status' },
  ];

  const generateReport = () => {
    const report = {
      title: `${filters.type} Report`, type: filters.type,
      period: `${activeRange.from} to ${activeRange.to}`, rows: previewRows,
      totalAmount: previewTotal, generatedAt: new Date().toISOString(), generatedBy: currentUser.username,
    };
    setGenerated(report);
    data.createReport(report, currentUser.username);
    showToast(`${filters.type} report generated.`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-black tracking-normal text-slate-950 dark:text-white">Reports</h1>
        <ExportActions
          rows={reportRows}
          columns={columns}
          filename={`${filters.type.toLowerCase().replace(/\s+/g, '-')}-${activeRange.from}-to-${activeRange.to}`}
        />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-[1.1fr_1.4fr_1fr_1fr_auto]">
          <FormField
            as="select"
            label="Report Type"
            options={reportTypes}
            value={reportTypes.includes(filters.type) ? filters.type : ''}
            onChange={(event) => updateFilter('type', event.target.value)}
          />
          <FormField
            as="select"
            label="Member"
            options={[
              { value: '', label: 'All members' },
              ...scopedData.members.map((member) => ({ value: member.id, label: `${member.memberId} - ${member.fullName}` })),
            ]}
            value={filters.memberId}
            onChange={(event) => updateFilter('memberId', event.target.value)}
          />
          <FormField
            label="Date From"
            type="date"
            value={filters.dateFrom}
            onChange={(event) => updateFilter('dateFrom', event.target.value)}
          />
          <FormField
            label="Date To"
            min={filters.dateFrom}
            type="date"
            value={filters.dateTo}
            onChange={(event) => updateFilter('dateTo', event.target.value)}
          />
          <Button icon={FiFileText} onClick={generateReport}>Generate Report</Button>
        </div>
        {filters.type.endsWith('Availment') ? (
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            Availment reports show standalone monitoring entries for the selected weekly or monthly period.
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard accent="blue" icon={FiFileText} title="Report Rows" value={reportRows.length} meta={generated ? generated.period : `${activeRange.from} to ${activeRange.to}`} />
        <StatCard accent="green" icon={FiDownload} title="Report Total" value={formatCurrency(totalAmount)} meta="Total amount in current report" />
        <StatCard accent="teal" icon={FiFileText} title="Saved Reports" value={scopedData.reports.length} meta="Persisted in LocalStorage" />
      </div>

      <ChartCard subtitle="Amount represented in current report rows" title={`${generated?.title || filters.type + ' Report'} Chart`}>
        <ResponsiveContainer height="100%" width="100%">
          <BarChart data={reportChart}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="month" />
            <YAxis
              allowDecimals={false}
              domain={[0, 'auto']}
              tickFormatter={(value) => value >= 1000 ? `PHP ${Math.round(value / 1000)}k` : `PHP ${value}`}
              width={84}
            />
            <Tooltip formatter={(value) => formatCurrency(value)} />
            <Bar dataKey="total" fill="#2563eb" name="Amount" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <DataTable
        columns={columns}
        data={reportRows}
        hideHeader
        description={`Period: ${generated?.period || `${activeRange.from} to ${activeRange.to}`}`}
        filters={[{ key: 'status', label: 'Status', options: [...new Set(reportRows.map((row) => row.status))] }]}
        searchFields={['reference', 'member', 'type', 'status']}
        title={generated?.title || `${filters.type} Report Preview`}
      />
    </div>
  );
}
