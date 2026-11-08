import React from 'react';
import {
  TrendingUp, Download, Printer, Users, BarChart3, PieChart,
  ShieldCheck, FileSpreadsheet, ArrowUpRight
} from 'lucide-react';
import { peopleOsStore } from '../data/mockStore';

export function ReportsPage() {
  const employees = peopleOsStore.getEmployees();
  const depts = peopleOsStore.getDepartments();

  const handleExportCsv = () => {
    let csv = 'Employee Number,Full Name,Job Title,Department,Base Salary (KES),Status,Start Date\n';
    employees.forEach((e) => {
      const deptName = depts.find(d => d.id === e.departmentId)?.name || 'Operations';
      csv += `"${e.employeeNumber}","${e.firstName} ${e.lastName}","${e.jobTitle}","${deptName}",${e.baseSalary},"${e.status}","${e.startDate}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `rekker_workforce_census_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Top Heading */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[.17em] text-[#bd2725]">Executive Intelligence / Data</p>
          <h1 className="font-display text-3xl font-semibold tracking-[-.035em] text-stone-900 md:text-[34px]">
            Workforce Reports & Analytics
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-500">
            Workforce census, headcount trends, statutory remittance summaries, and executive demographic reporting.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            className="btn btn-secondary flex items-center gap-1.5 text-xs font-semibold"
          >
            <Printer size={15} /> Print Report
          </button>
          <button
            onClick={handleExportCsv}
            className="btn btn-primary flex items-center gap-1.5 text-xs font-semibold"
          >
            <Download size={15} /> Export Census CSV
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-stone-400">Total Workforce</p>
          <p className="mt-2 font-display text-2xl font-bold text-stone-900">{employees.length} Personnel</p>
          <p className="mt-1 text-[11px] text-emerald-700 font-medium">+25% YoY Headcount Growth</p>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-stone-400">Monthly Compensation Run</p>
          <p className="mt-2 font-display text-2xl font-bold text-stone-900">KES 2.18M</p>
          <p className="mt-1 text-[11px] text-stone-500">Gross payroll expenditure</p>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-stone-400">Annual Turnover Rate</p>
          <p className="mt-2 font-display text-2xl font-bold text-emerald-800">2.1%</p>
          <p className="mt-1 text-[11px] text-stone-500">Industry benchmark: 8.5%</p>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-stone-400">Gender Inclusion Ratio</p>
          <p className="mt-2 font-display text-2xl font-bold text-stone-900">40% F / 60% M</p>
          <p className="mt-1 text-[11px] text-stone-500">4 Female Leaders / 6 Male Leaders</p>
        </div>
      </div>

      {/* Department Allocation Breakdown */}
      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-xs">
        <h3 className="font-display text-base font-bold text-stone-900">Department Headcount & Capacity Utilization</h3>
        <p className="text-xs text-stone-500 mt-0.5">Budgeted capacity vs active deployed staffing across operational divisions.</p>

        <div className="mt-6 space-y-4">
          {depts.map((d) => {
            const count = employees.filter(e => e.departmentId === d.id).length;
            const pct = d.budgetedPositions ? Math.round((count / d.budgetedPositions) * 100) : 0;
            return (
              <div key={d.id} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="text-stone-900">{d.name} ({d.code})</span>
                  <span className="text-stone-500">{count} filled / {d.budgetedPositions} budgeted ({pct}%)</span>
                </div>
                <div className="h-2.5 w-full rounded-full bg-stone-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-red-700 transition-all duration-300"
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Statutory Remittance Audit Table */}
      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-xs">
        <div className="border-b border-stone-100 p-4">
          <h3 className="font-display text-sm font-bold text-stone-900">Statutory Tax & Regulatory Remittance Schedule</h3>
          <p className="text-xs text-stone-500">Audited compliance filing status across Kenyan revenue and labor bodies.</p>
        </div>
        <table className="w-full text-left text-xs">
          <thead className="border-b border-stone-200 bg-stone-50 text-[10px] font-bold uppercase tracking-wider text-stone-500">
            <tr>
              <th className="px-4 py-3">Statutory Entity</th>
              <th className="px-4 py-3">Obligation Type</th>
              <th className="px-4 py-3">Monthly Remittance</th>
              <th className="px-4 py-3">Due Date</th>
              <th className="px-4 py-3">Compliance Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            <tr>
              <td className="px-4 py-3 font-semibold text-stone-900">Kenya Revenue Authority (KRA)</td>
              <td className="px-4 py-3 text-stone-600">Pay As You Earn (PAYE)</td>
              <td className="px-4 py-3 font-semibold text-stone-800">KES 412,450</td>
              <td className="px-4 py-3 text-stone-500">9th of each month</td>
              <td className="px-4 py-3"><span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">PAID & COMPLIANT</span></td>
            </tr>
            <tr>
              <td className="px-4 py-3 font-semibold text-stone-900">Ministry of Lands & Housing</td>
              <td className="px-4 py-3 text-stone-600">Affordable Housing Levy (1.5% + 1.5%)</td>
              <td className="px-4 py-3 font-semibold text-stone-800">KES 65,400</td>
              <td className="px-4 py-3 text-stone-500">9th of each month</td>
              <td className="px-4 py-3"><span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">PAID & COMPLIANT</span></td>
            </tr>
            <tr>
              <td className="px-4 py-3 font-semibold text-stone-900">National Social Security Fund (NSSF)</td>
              <td className="px-4 py-3 text-stone-600">Pension Tier I & Tier II</td>
              <td className="px-4 py-3 font-semibold text-stone-800">KES 86,400</td>
              <td className="px-4 py-3 text-stone-500">9th of each month</td>
              <td className="px-4 py-3"><span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">PAID & COMPLIANT</span></td>
            </tr>
            <tr>
              <td className="px-4 py-3 font-semibold text-stone-900">Social Health Authority (SHA)</td>
              <td className="px-4 py-3 text-stone-600">Universal Healthcare (2.75%)</td>
              <td className="px-4 py-3 font-semibold text-stone-800">KES 59,950</td>
              <td className="px-4 py-3 text-stone-500">9th of each month</td>
              <td className="px-4 py-3"><span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">PAID & COMPLIANT</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

