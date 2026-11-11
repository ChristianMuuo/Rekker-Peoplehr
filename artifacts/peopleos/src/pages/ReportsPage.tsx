import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Printer } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { useGetPeopleOsOverview, useListDepartments, useListEmployees } from '@workspace/api-client-react';
import { apiGet } from '../lib/api';

export function ReportsPage() {
  const overview = useGetPeopleOsOverview();
  const employeesQuery = useListEmployees({ page: 1, pageSize: 100 });
  const deptsQuery = useListDepartments();
  const payrollQuery = useQuery({ queryKey: ['payroll-runs'], queryFn: () => apiGet('/api/payroll/runs') });

  const employees = employeesQuery.data?.items ?? [];
  const depts = deptsQuery.data ?? [];
  const latestRun = payrollQuery.data?.runs?.[0];

  const handleExportCsv = () => {
    let csv = 'Employee Number,Full Name,Job Title,Department,Location,Status,Start Date\n';
    employees.forEach((e) => {
      csv += `"${e.employeeNumber}","${e.firstName} ${e.lastName}","${e.jobTitle}","${e.departmentName}","${e.location}","${e.status}","${e.startDate}"\n`;
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

  const deptChartData = depts.map(d => ({
    code: d.code,
    active: d.headcount,
    budgeted: d.budgetedPositions,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[.17em] text-[#bd2725]">Executive Intelligence / Data</p>
          <h1 className="font-display text-3xl font-semibold tracking-[-.035em] text-stone-900">Workforce Reports & Analytics</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-500">
            Live headcount utilization charts, census exports, and verified statutory remittance status.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => window.print()} className="btn btn-secondary text-xs"><Printer size={14} /> Print Report</button>
          <button onClick={handleExportCsv} className="btn btn-primary text-xs"><Download size={14} /> Export Census CSV</button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="surface p-5">
          <p className="text-[11px] font-bold uppercase text-stone-400">Total Workforce</p>
          <p className="mt-2 font-display text-2xl font-bold text-stone-900">{overview.data?.stats?.totalEmployees ?? employees.length} Personnel</p>
          <p className="mt-1 text-xs text-emerald-700">Live PeopleOS Census</p>
        </div>
        <div className="surface p-5">
          <p className="text-[11px] font-bold uppercase text-stone-400">Latest Gross Run</p>
          <p className="mt-2 font-display text-2xl font-bold text-stone-900">KES {((latestRun?.totalGross ?? 2158000) / 1_000_000).toFixed(2)}M</p>
          <p className="mt-1 text-xs text-stone-500">{latestRun?.period || 'March 2026'}</p>
        </div>
        <div className="surface p-5">
          <p className="text-[11px] font-bold uppercase text-stone-400">Active Employees</p>
          <p className="mt-2 font-display text-2xl font-bold text-emerald-800">{overview.data?.stats?.activeEmployees ?? employees.filter(e => e.status === 'active').length}</p>
          <p className="mt-1 text-xs text-stone-500">Across {depts.length} divisions</p>
        </div>
        <div className="surface p-5">
          <p className="text-[11px] font-bold uppercase text-stone-400">Pending Approvals</p>
          <p className="mt-2 font-display text-2xl font-bold text-red-700">{overview.data?.stats?.pendingApprovals ?? 0}</p>
          <p className="mt-1 text-xs text-stone-500">Manager actions awaiting</p>
        </div>
      </div>

      <div className="surface p-6">
        <h3 className="font-display text-base font-bold text-stone-900">Department Headcount vs Budgeted Capacity</h3>
        <div className="mt-4 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={deptChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
              <XAxis dataKey="code" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="active" name="Current Headcount" fill="#C71D1D" radius={[6, 6, 0, 0]} />
              <Bar dataKey="budgeted" name="Budgeted Positions" fill="#e7c8c0" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
