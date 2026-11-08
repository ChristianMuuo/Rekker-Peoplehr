import React, { useState } from 'react';
import {
  Activity, Calculator, CheckCircle2, Download, Eye, FileText,
  Filter, HelpCircle, Lock, Printer, Search, ShieldCheck, X
} from 'lucide-react';
import { peopleOsStore, calculateKenyaPayroll, type PayrollRecord } from '../data/mockStore';

export function PayrollPage() {
  const [selectedPeriod, setSelectedPeriod] = useState('March 2026');
  const [payrollRecords, setPayrollRecords] = useState<PayrollRecord[]>(peopleOsStore.getPayrollRecords('March 2026'));
  const [selectedPayslip, setSelectedPayslip] = useState<PayrollRecord | null>(null);
  const [approvalStatus, setApprovalStatus] = useState<'draft' | 'reviewed' | 'approved'>('reviewed');

  // Interactive Live Calculator state
  const [customGross, setCustomGross] = useState<number>(180000);
  const liveCalc = calculateKenyaPayroll(customGross);

  // Totals across all employees
  const totalGross = payrollRecords.reduce((sum, r) => sum + r.grossPay, 0);
  const totalNet = payrollRecords.reduce((sum, r) => sum + r.netPay, 0);
  const totalPaye = payrollRecords.reduce((sum, r) => sum + r.netPaye, 0);
  const totalNssf = payrollRecords.reduce((sum, r) => sum + r.totalNssf, 0);
  const totalSha = payrollRecords.reduce((sum, r) => sum + r.sha, 0);
  const totalHousing = payrollRecords.reduce((sum, r) => sum + r.housingLevy, 0);

  return (
    <div className="space-y-6">
      {/* Page Heading */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[.17em] text-[#bd2725]">Compensation & Governance</p>
          <h1 className="font-display text-3xl font-semibold tracking-[-.035em] text-stone-900 md:text-[34px]">
            Payroll & Statutory Compliance
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-500">
            Kenya-localized payroll calculation engine supporting KRA PAYE, NSSF Tier I & II, SHA (2.75%), and Affordable Housing Levy (1.5%).
          </p>
        </div>
        <div className="flex items-center gap-2">
          {approvalStatus !== 'approved' ? (
            <button
              onClick={() => {
                setApprovalStatus('approved');
                alert('March 2026 Payroll approved by authorized HR & Finance Directors.');
              }}
              className="btn btn-primary flex items-center gap-2 text-xs font-semibold"
            >
              <ShieldCheck size={16} /> Authorize & Signoff Run
            </button>
          ) : (
            <div className="inline-flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 border border-emerald-200">
              <CheckCircle2 size={16} /> Approved for Disbursement
            </div>
          )}
        </div>
      </div>

      {/* Statutory Summary KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-stone-400">Total Workforce Gross</p>
          <p className="mt-2 font-display text-2xl font-bold text-stone-900">
            KES {totalGross.toLocaleString()}
          </p>
          <p className="mt-1 text-[11px] text-stone-500">{payrollRecords.length} Active Employees</p>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-stone-400">Total Net Disbursed</p>
          <p className="mt-2 font-display text-2xl font-bold text-emerald-800">
            KES {totalNet.toLocaleString()}
          </p>
          <p className="mt-1 text-[11px] text-stone-500">{totalGross ? (totalNet / totalGross * 100).toFixed(1) : '0.0'}% of total payroll</p>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-stone-400">KRA Remittance (PAYE + AHL)</p>
          <p className="mt-2 font-display text-2xl font-bold text-red-700">
            KES {(totalPaye + totalHousing).toLocaleString()}
          </p>
          <p className="mt-1 text-[11px] text-stone-500">PAYE: KES {totalPaye.toLocaleString()} · AHL: KES {totalHousing.toLocaleString()}</p>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-stone-400">Social Security (NSSF + SHA)</p>
          <p className="mt-2 font-display text-2xl font-bold text-stone-900">
            KES {(totalNssf + totalSha).toLocaleString()}
          </p>
          <p className="mt-1 text-[11px] text-stone-500">NSSF: KES {totalNssf.toLocaleString()} · SHA: KES {totalSha.toLocaleString()}</p>
        </div>
      </div>

      {/* Interactive Kenya Statutory Calculator Widget */}
      <div className="rounded-2xl border border-stone-200 bg-linear-to-r from-stone-50 to-white p-6 shadow-xs">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between border-b border-stone-200/80 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100 text-red-700">
              <Calculator size={20} />
            </div>
            <div>
              <h3 className="font-display text-base font-bold text-stone-900">Kenya Statutory Tax Simulator</h3>
              <p className="text-xs text-stone-500">Adjust the gross amount to preview PAYE, NSSF, SHA, and Housing Levy breakdown in real time.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-stone-600">Gross:</span>
            <input
              type="number"
              step="5000"
              value={customGross}
              onChange={(e) => setCustomGross(Number(e.target.value) || 0)}
              className="w-36 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-bold text-stone-900 focus:border-red-700 focus:outline-hidden"
            />
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6 text-center">
          <div className="rounded-xl border border-stone-200 bg-white p-3">
            <p className="text-[10px] font-bold uppercase text-stone-400">NSSF (Tier 1 & 2)</p>
            <p className="mt-1 text-sm font-bold text-stone-900">KES {liveCalc.totalNssf.toLocaleString()}</p>
            <p className="text-[9px] text-stone-400">Max capped KES 4,320</p>
          </div>

          <div className="rounded-xl border border-stone-200 bg-white p-3">
            <p className="text-[10px] font-bold uppercase text-stone-400">SHA (2.75%)</p>
            <p className="mt-1 text-sm font-bold text-stone-900">KES {liveCalc.sha.toLocaleString()}</p>
            <p className="text-[9px] text-stone-400">Min KES 300</p>
          </div>

          <div className="rounded-xl border border-stone-200 bg-white p-3">
            <p className="text-[10px] font-bold uppercase text-stone-400">Housing Levy (1.5%)</p>
            <p className="mt-1 text-sm font-bold text-stone-900">KES {liveCalc.housingLevy.toLocaleString()}</p>
            <p className="text-[9px] text-stone-400">Gross × 1.5%</p>
          </div>

          <div className="rounded-xl border border-stone-200 bg-white p-3">
            <p className="text-[10px] font-bold uppercase text-stone-400">Net PAYE Tax</p>
            <p className="mt-1 text-sm font-bold text-red-700">KES {liveCalc.netPaye.toLocaleString()}</p>
            <p className="text-[9px] text-stone-400">After KES 2.4k relief</p>
          </div>

          <div className="rounded-xl border border-stone-200 bg-white p-3">
            <p className="text-[10px] font-bold uppercase text-stone-400">Total Deductions</p>
            <p className="mt-1 text-sm font-bold text-stone-900">KES {liveCalc.totalDeductions.toLocaleString()}</p>
            <p className="text-[9px] text-stone-400">{(liveCalc.totalDeductions / liveCalc.grossPay * 100).toFixed(1)}% of gross</p>
          </div>

          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
            <p className="text-[10px] font-bold uppercase text-emerald-800">Net Take-Home</p>
            <p className="mt-1 text-sm font-bold text-emerald-900">KES {liveCalc.netPay.toLocaleString()}</p>
            <p className="text-[9px] text-emerald-700">Monthly bank payout</p>
          </div>
        </div>
      </div>

      {/* Payroll Records Table */}
      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-xs">
        <div className="flex items-center justify-between border-b border-stone-100 p-4">
          <div>
            <h3 className="font-display text-sm font-bold text-stone-900">{selectedPeriod} Master Payroll Register</h3>
            <p className="text-xs text-stone-500">Validated against employee KRA PINs and national statutory tables.</p>
          </div>
          <span className="rounded-md bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-600">
            {payrollRecords.length} Employees Registered
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-stone-200 bg-stone-50 text-[10px] font-bold uppercase tracking-wider text-stone-500">
              <tr>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3 text-right">Gross Pay</th>
                <th className="px-4 py-3 text-right">NSSF</th>
                <th className="px-4 py-3 text-right">SHA (2.75%)</th>
                <th className="px-4 py-3 text-right">AHL (1.5%)</th>
                <th className="px-4 py-3 text-right">PAYE</th>
                <th className="px-4 py-3 text-right">Net Take-Home</th>
                <th className="px-4 py-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {payrollRecords.map((r) => (
                <tr key={r.id} className="hover:bg-stone-50/70 transition">
                  <td className="px-4 py-3 font-semibold text-stone-900">
                    {r.employeeName}
                  </td>
                  <td className="px-4 py-3 text-stone-500">{r.departmentName}</td>
                  <td className="px-4 py-3 text-right font-medium text-stone-800">
                    KES {r.grossPay.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-stone-600">
                    KES {r.totalNssf.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-stone-600">
                    KES {r.sha.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-stone-600">
                    KES {r.housingLevy.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-red-700 font-semibold">
                    KES {r.netPaye.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-emerald-800">
                    KES {r.netPay.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => setSelectedPayslip(r)}
                      className="inline-flex items-center gap-1 rounded-md bg-stone-100 px-2 py-1 text-[11px] font-semibold text-stone-700 hover:bg-stone-200"
                    >
                      <Eye size={12} /> Payslip
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Interactive Payslip Viewer */}
      {selectedPayslip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-white p-7 shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-stone-200 pb-4">
              <div className="flex items-center gap-3">
                <img src="https://rekker.co.ke/Logo.jpg" alt="Rekker" className="h-8 w-auto" />
                <div>
                  <h3 className="font-display text-base font-bold text-stone-900">Rekker Breweries Kenya Ltd</h3>
                  <p className="text-[11px] text-stone-500">Official Payslip · {selectedPayslip.period}</p>
                </div>
              </div>
              <button onClick={() => setSelectedPayslip(null)} className="text-stone-400 hover:text-stone-700">
                <X size={18} />
              </button>
            </div>

            {/* Employee Meta */}
            <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-stone-50 p-3 text-xs text-stone-600">
              <div>
                <p className="text-[10px] uppercase font-bold text-stone-400">Employee</p>
                <p className="font-bold text-stone-900">{selectedPayslip.employeeName}</p>
                <p className="text-[11px] text-stone-500">{selectedPayslip.departmentName}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase font-bold text-stone-400">Currency & Period</p>
                <p className="font-bold text-stone-900">Kenya Shillings (KES)</p>
                <p className="text-[11px] text-stone-500">{selectedPayslip.period}</p>
              </div>
            </div>

            {/* Earnings Breakdown */}
            <div className="mt-4 space-y-2 text-xs">
              <div className="flex justify-between font-semibold text-stone-800">
                <span>Basic Salary</span>
                <span>KES {selectedPayslip.baseSalary.toLocaleString()}</span>
              </div>
              {selectedPayslip.allowances > 0 && (
                <div className="flex justify-between text-stone-600">
                  <span>Monthly Allowances</span>
                  <span>KES {selectedPayslip.allowances.toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-stone-100 pt-1 font-bold text-stone-900">
                <span>Gross Earnings</span>
                <span>KES {selectedPayslip.grossPay.toLocaleString()}</span>
              </div>
            </div>

            {/* Deductions Breakdown */}
            <div className="mt-4 space-y-1.5 border-t border-stone-200 pt-3 text-xs">
              <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Statutory Deductions</p>
              <div className="flex justify-between text-stone-600">
                <span>NSSF Pension (Tier I & II)</span>
                <span>KES {selectedPayslip.totalNssf.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-stone-600">
                <span>Social Health Authority (SHA 2.75%)</span>
                <span>KES {selectedPayslip.sha.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-stone-600">
                <span>Affordable Housing Levy (AHL 1.5%)</span>
                <span>KES {selectedPayslip.housingLevy.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-stone-600">
                <span>PAYE Tax (less KES 2.4k personal relief)</span>
                <span>KES {selectedPayslip.netPaye.toLocaleString()}</span>
              </div>
              <div className="flex justify-between border-t border-stone-100 pt-1 font-semibold text-red-700">
                <span>Total Deductions</span>
                <span>- KES {selectedPayslip.totalDeductions.toLocaleString()}</span>
              </div>
            </div>

            {/* Net Take-Home */}
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center">
              <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">Net Pay Disbursed</p>
              <p className="mt-1 font-display text-2xl font-bold text-emerald-950">
                KES {selectedPayslip.netPay.toLocaleString()}
              </p>
            </div>

            {/* Actions */}
            <div className="mt-5 flex justify-end gap-2 border-t border-stone-100 pt-3">
              <button
                onClick={() => window.print()}
                className="btn btn-secondary flex items-center gap-1.5 text-xs font-semibold"
              >
                <Printer size={14} /> Print Payslip
              </button>
              <button
                onClick={() => setSelectedPayslip(null)}
                className="btn btn-primary text-xs font-semibold"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

