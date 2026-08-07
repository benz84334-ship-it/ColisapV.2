import { addDays, todayIso } from '../../utils/formatters.js';

const reportTypes = ['Monthly Register Member', 'All Member Register', 'Availment Report'];
const supportedReportTypes = ['Monthly Register Member', 'All Member Register', 'Availment Report'];
const calendarMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export { reportTypes, supportedReportTypes, calendarMonths };

export function rangeFor(type, dateFrom, dateTo) {
  const today = todayIso();
  const year = today.slice(0, 4);
  const month = today.slice(0, 7);
  const quarter = Math.floor((Number(today.slice(5, 7)) - 1) / 3);
  const quarterStart = `${year}-${String(quarter * 3 + 1).padStart(2, '0')}-01`;
  const quarterEnd = addDays(new Date(Number(year), quarter * 3 + 3, 0), 0);

  if (type === 'Daily') return { from: today, to: today };
  if (type === 'Weekly') return { from: addDays(today, -6), to: today };
  if (type === 'Monthly' || type === 'Monthly Register Member') return { from: `${month}-01`, to: today };
  if (type === 'Quarterly') return { from: quarterStart, to: quarterEnd };
  if (type === 'Annual') return { from: `${year}-01-01`, to: `${year}-12-31` };
  return { from: dateFrom, to: dateTo };
}

export function inRange(date, range) {
  const value = new Date(date);
  return value >= new Date(range.from) && value <= new Date(range.to);
}

export function buildReportRows(type, data, range) {
  const resolveAvailmentAmountValue = (item) => {
    const rawAmount = Number(item.amount || item.approvedAmount || 0);
    const categoryText = [
      item.availmentType,
      item.benefitCategory,
      item.deceasedBenefitCategory,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    if (rawAmount >= 60000 || categoryText.includes('60')) return 60000;
    if (rawAmount >= 40000 || categoryText.includes('40')) return 40000;
    return rawAmount;
  };

  const resolveAvailmentAmountLabel = (item) => {
    const resolvedAmount = resolveAvailmentAmountValue(item);
    if (resolvedAmount >= 60000) return '60K';
    if (resolvedAmount >= 40000) return '40K';
    if (resolvedAmount > 0) return `${Math.round(resolvedAmount / 1000)}K`;
    return 'Not provided';
  };

  if (type === 'Monthly Register Member') {
    return (data.members || [])
      .filter((member) => inRange(member.membershipDate || member.createdAt, range))
      .map((member) => ({
        id: member.id,
        memberId: member.memberId,
        category: 'Member',
        reference: member.memberId,
        member: member.fullName,
        branch: member.branch || '',
        date: member.membershipDate || member.createdAt,
        type: 'Member Profile',
        address: member.address || '',
        barangay: member.barangay || '',
        contact: member.contactNumber || '',
        amount: Number(member.shareCapital || 0),
        status: member.status,
        remarks: '',
      }))
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  if (type === 'All Member Register') {
    return (data.members || [])
      .map((member) => ({
        id: member.id,
        memberId: member.memberId,
        category: 'Member',
        reference: member.memberId,
        member: member.fullName,
        branch: member.branch || '',
        date: member.membershipDate || member.createdAt,
        address: member.address || '',
        barangay: member.barangay || '',
        contact: member.contactNumber || '',
        amount: Number(member.shareCapital || 0),
        status: member.status,
        remarks: '',
      }))
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  if (type === 'Contribution Report') {
    const rows = (data.shareCapitalTransactions || [])
      .map((item) => {
        const matchedMember = (data.members || []).find((member) =>
          String(member.id || '').trim() === String(item.memberId || '').trim()
          || String(member.memberId || '').trim() === String(item.memberId || '').trim()
          || String(member.cifNumber || '').trim() === String(item.referenceNumber || '').trim()
          || (item.memberName && String(member.fullName || '').trim() === String(item.memberName || '').trim()),
        );

        return {
          id: item.id,
          memberId: matchedMember?.cifNumber || matchedMember?.memberId || item.memberId || '',
          category: 'Contribution',
          reference: matchedMember?.memberId || matchedMember?.cifNumber || item.referenceNumber || item.id,
          member: matchedMember?.fullName || item.memberName || '',
          branch: matchedMember?.branch || '',
          date: item.transactionDate || item.createdAt,
          time: item.metadata?.contributionTime || item.contributionTime || '',
          sortTimestamp: item.createdAt || item.transactionDate || '',
          type: item.transactionType || 'Deposit',
          address: matchedMember?.address || '',
          barangay: matchedMember?.barangay || '',
          contact: matchedMember?.contactNumber || '',
          amount: Number(item.amount || 0),
          status: 'Recorded',
          remarks: item.remarks || item.encodedBy || '',
        };
      });
    return rows
      .sort((a, b) => {
        const aTimestamp = new Date(a.sortTimestamp || a.createdAt || a.date || 0).getTime();
        const bTimestamp = new Date(b.sortTimestamp || b.createdAt || b.date || 0).getTime();
        if (bTimestamp !== aTimestamp) return bTimestamp - aTimestamp;

        const aDate = new Date(a.date || 0).getTime();
        const bDate = new Date(b.date || 0).getTime();
        if (bDate !== aDate) return bDate - aDate;

        const amountDiff = Number(b.amount || 0) - Number(a.amount || 0);
        if (amountDiff !== 0) return amountDiff;

        return String(a.member || '').localeCompare(String(b.member || ''));
      });
  }

  if (type === 'Availment Report') {
    return (data.availments || [])
      .filter((item) => inRange(item.availmentDate || item.createdAt, range))
      .map((item) => {
        const matchedMember = (data.members || []).find((member) =>
          String(member.id || '').trim() === String(item.memberId || item.deceasedMemberId || '').trim()
          || String(member.memberId || '').trim() === String(item.memberId || item.deceasedMemberId || '').trim()
          || String(member.cifNumber || '').trim() === String(item.deceasedCifNumber || item.reference || '').trim()
          || (item.deceasedFullName && String(member.fullName || '').trim() === String(item.deceasedFullName || '').trim()),
        );
        const resolvedCifNumber = matchedMember?.cifNumber || matchedMember?.memberId || item.deceasedCifNumber || item.reference || item.claimNumber || item.monitoringReference || item.id;
        const resolvedMemberName = matchedMember?.fullName || item.deceasedFullName || item.memberName || '';
        const statusFromFields = [
          item.claimStatus,
          item.status,
          item.requestStatus,
        ].map((value) => String(value || '').trim()).find(Boolean);
        const isApproved = Boolean(
          item.approvedBy
          || item.dateApproved
          || statusFromFields === 'Approved'
          || String(item.recommendation || '').trim() === 'For Approval',
        );
        const status = isApproved ? 'Approved' : (statusFromFields || 'Pending');
        return {
          id: item.id,
          memberId: resolvedCifNumber,
          category: 'Availment',
          reference: resolvedCifNumber,
          member: resolvedMemberName,
          date: item.availmentDate || item.createdAt,
          type: item.availmentType || 'Burial Assistance',
          dateApproved: item.dateApproved || '',
          address: item.claimantAddress || '',
          barangay: '',
          contact: item.contactNumber || '',
          amount: resolveAvailmentAmountValue(item),
          amountLabel: resolveAvailmentAmountLabel(item),
          availmentCategory: item.availmentType || item.benefitCategory || item.deceasedBenefitCategory || 'Burial Assistance',
          status,
          claimStatus: status,
          beneficiary: item.claimantName || '',
          remarks: [item.approvedBy, item.verifiedBy, item.remarks].filter(Boolean).join(' | '),
        };
      })
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  return [];
}

export function buildReportChart(rows = []) {
  const totalsByMonth = rows.reduce((accumulator, row) => {
    const date = row.date ? new Date(row.date) : null;
    if (!date || Number.isNaN(date.getTime())) return accumulator;
    const month = calendarMonths[date.getMonth()];
    accumulator[month] = (accumulator[month] || 0) + Number(row.amount || 0);
    return accumulator;
  }, {});

  return calendarMonths.map((month) => ({
    month,
    total: totalsByMonth[month] || 0,
  }));
}
