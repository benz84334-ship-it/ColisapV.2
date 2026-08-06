import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { FiDownload, FiFileText } from 'react-icons/fi';
import Button from '../../components/ui/Button.jsx';
import FormField from '../../components/forms/FormField.jsx';
import DataTable from '../../components/tables/DataTable.jsx';
import ChartCard from '../../components/charts/ChartCard.jsx';
import StatCard from '../../components/cards/StatCard.jsx';
import ExportActions from '../../components/ui/ExportActions.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useData } from '../../context/DataContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { getBranchScopedData } from '../../utils/analytics.js';
import { formatCifNumber, formatCurrency, formatDate, todayIso } from '../../utils/formatters.js';
import { ROLES } from '../../utils/constants.js';
import { buildReportChart, buildReportRows, rangeFor, reportTypes } from '../../modules/reports/reportModule.js';

export default function Reports() {
  const data = useData();
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const scopedData = useMemo(
    () => (currentUser?.role === ROLES.ADMIN ? data : getBranchScopedData(data, currentUser?.branch)),
    [currentUser?.branch, currentUser?.role, data],
  );
  const [filters, setFilters] = useState(() => ({
    type: 'Monthly Register Member',
    dateFrom: `${todayIso().slice(0, 7)}-01`,
    dateTo: todayIso(),
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
    const rows = buildReportRows(filters.type, scopedData, activeRange);
    return rows;
  }, [activeRange.from, activeRange.to, filters.type, scopedData]);
  const reportRows = generated?.rows || previewRows;
  const previewTotal = previewRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const totalAmount = generated?.totalAmount ?? previewTotal;
  const reportChart = buildReportChart(reportRows);
  const reportChartMax = Math.max(0, ...reportChart.map((item) => Number(item.total || 0)));
  const chartUpperBound = Math.max(500000, Math.ceil(reportChartMax / 100000) * 100000);
  const chartTicks = Array.from({ length: chartUpperBound / 100000 + 1 }, (_, index) => index * 100000);

  const columns = filters.type === 'Availment Report'
      ? [
        {
          key: 'reference',
          label: 'CIFK Number',
          render: (row) => formatCifNumber({
            cifNumber: row.reference || row.memberId || row.member_id || row.claimNumber || '',
          }),
        },
        { key: 'member', label: 'Member' },
        { key: 'date', label: 'Date Filed', render: (row) => formatDate(row.date) },
        { key: 'dateApproved', label: 'Date Approved', render: (row) => row.dateApproved ? formatDate(row.dateApproved) : 'Not provided' },
        { key: 'claimStatus', label: 'Claim Status' },
        { key: 'availmentCategory', label: 'Availment Type', render: (row) => row.availmentCategory || 'Burial Assistance' },
        {
          key: 'amount',
          label: 'Amount',
          render: (row) => row.amountLabel || formatCurrency(row.amount),
          sortKey: (row) => Number(row.amount),
        },
        { key: 'beneficiary', label: 'Beneficiary', render: (row) => row.beneficiary || 'Not provided' },
        { key: 'remarks', label: 'Remarks', render: (row) => row.remarks || 'Not provided' },
      ]
    : filters.type === 'Contribution Report'
      ? [
        { key: 'reference', label: 'CIFK Number' },
        { key: 'member', label: 'Member Name' },
        { key: 'amount', label: 'Amount', render: (row) => formatCurrency(row.amount), sortKey: (row) => Number(row.amount) },
        { key: 'date', label: 'Contribution Date', render: (row) => formatDate(row.date) },
        { key: 'branch', label: 'Branch', render: (row) => row.branch || 'Not provided' },
        { key: 'status', label: 'Status', render: (row) => row.status || 'Active' },
        { key: 'remarks', label: 'Remarks', render: (row) => row.remarks || 'Not provided' },
      ]
    : [
        { key: 'reference', label: 'Reference' },
        { key: 'member', label: 'Member' },
        { key: 'branch', label: 'Branch', render: (row) => row.branch || 'Not provided' },
        { key: 'date', label: 'Membership Date', render: (row) => formatDate(row.date) },
        { key: 'barangay', label: 'Barangay / Municipality', render: (row) => row.barangay || 'Not provided' },
        { key: 'contact', label: 'Contact', render: (row) => row.contact || 'Not provided' },
      ];

  const generateReport = () => {
    const report = {
      title: `${filters.type} Report`,
      type: filters.type,
      period: `${activeRange.from} to ${activeRange.to}`,
      rows: previewRows,
      generatedAt: new Date().toISOString(),
      generatedBy: currentUser.username,
    };
    setGenerated(report);
    data.createReport(report, currentUser.username);
    showToast(`${filters.type} generated.`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Analytics"
        title="Reports"
        description="Generate monthly register member or availment reports without removing existing report content."
        actions={(
          <ExportActions
            rows={reportRows}
            columns={columns}
            filename={`${filters.type.toLowerCase().replace(/\s+/g, '-')}-${activeRange.from}-to-${activeRange.to}`}
          />
        )}
      />

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-[1.45fr_.8fr_1.35fr_1fr_auto]">
          <FormField
            as="select"
            label="Report Type"
            className="min-w-0"
            options={reportTypes}
            value={filters.type}
            onChange={(event) => updateFilter('type', event.target.value)}
          />
          <FormField
            label="Date From"
            className="min-w-0"
            type="date"
            value={filters.dateFrom}
            onChange={(event) => updateFilter('dateFrom', event.target.value)}
          />
          <FormField
            label="Date To"
            min={filters.dateFrom}
            className="min-w-0"
            type="date"
            value={filters.dateTo}
            onChange={(event) => updateFilter('dateTo', event.target.value)}
          />
          <Button icon={FiFileText} onClick={generateReport}>Generate Report</Button>
        </div>
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
          {filters.type === 'Availment Report'
            ? 'This report is based on member burial assistance applications, with CIFK number, dates, claim status, beneficiary, amount, and remarks.'
          : filters.type === 'All Member Register'
              ? 'This report is based on all member register records, membership date, branch, and premium.'
          : filters.type === 'Contribution Report'
                ? 'This report is based on contribution records, showing member name, CIFK number, contribution amount, and contribution date.'
              : 'This report is based on monthly register member records, membership date, branch, and premium.'}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard accent="blue" icon={FiFileText} title="Report Rows" value={reportRows.length} />
        {filters.type === 'Availment Report' ? (
          <StatCard accent="green" icon={FiDownload} title="Report Total" value={formatCurrency(totalAmount)} />
        ) : null}
        {filters.type === 'Contribution Report' ? (
          <StatCard accent="green" icon={FiDownload} title="Contribution Total" value={formatCurrency(totalAmount)} />
        ) : null}
        <StatCard accent="teal" icon={FiFileText} title="Saved Reports" value={scopedData.reports.length} />
      </div>

      {filters.type === 'Availment Report' ? (
        <ChartCard subtitle="Amount represented in current report rows" title={`${generated?.title || filters.type + ' Report'} Chart`}>
          <ResponsiveContainer height="100%" width="100%">
            <BarChart data={reportChart}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" />
              <YAxis
                allowDecimals={false}
                domain={[0, chartUpperBound]}
                ticks={chartTicks}
                tickFormatter={(value) => `${Math.round(value / 1000)}K`}
                width={84}
              />
              <Tooltip formatter={(value) => formatCurrency(value)} />
              <Bar dataKey="total" fill="#2563eb" name="Amount" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      ) : filters.type === 'Contribution Report' ? (
        <ChartCard subtitle="Contribution amount represented in current report rows" title={`${generated?.title || filters.type + ' Report'} Chart`}>
          <ResponsiveContainer height="100%" width="100%">
            <BarChart data={reportChart}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" />
              <YAxis
                allowDecimals={false}
                domain={[0, chartUpperBound]}
                ticks={chartTicks}
                tickFormatter={(value) => `${Math.round(value / 1000)}K`}
                width={84}
              />
              <Tooltip formatter={(value) => formatCurrency(value)} />
              <Bar dataKey="total" fill="#0f766e" name="Contribution" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      ) : null}

      <DataTable
        columns={columns}
        data={reportRows}
        hideHeader
        description={`Period: ${generated?.period || `${activeRange.from} to ${activeRange.to}`}`}
        filters={[]}
        searchFields={filters.type === 'Availment Report'
          ? ['reference', 'member', 'type', 'availmentCategory', 'beneficiary', 'claimStatus', 'remarks']
          : ['reference', 'member', 'branch', 'barangay', 'contact', 'status']}
        title={generated?.title || `${filters.type} Preview`}
      />
    </div>
  );
}
