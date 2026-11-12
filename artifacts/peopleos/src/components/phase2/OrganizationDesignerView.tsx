import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Briefcase, GitBranch, Layers, Plus, Search, Table2, X, ZoomIn, ZoomOut } from 'lucide-react';
import { Link } from 'wouter';
import { apiGet, apiPost } from '@/lib/api';

function SafeOrgTreeBranch({
  node,
  byManager,
  depth = 0,
  visited = new Set<string>(),
  maxDepth = 10,
}: {
  node: any;
  byManager: Map<string, any[]>;
  depth?: number;
  visited?: Set<string>;
  maxDepth?: number;
}) {
  if (visited.has(node.id) || depth > maxDepth) {
    return null;
  }
  const nextVisited = new Set(visited);
  nextVisited.add(node.id);
  const children = byManager.get(node.id) ?? [];

  return (
    <div className={depth > 0 ? 'ml-4 mt-2.5 border-l border-stone-200 pl-4' : 'mt-2.5'}>
      <Link
        href={`/people/${node.id}`}
        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-stone-200 bg-[#faf8f5] px-3.5 py-2.5 text-xs transition-colors hover:border-[#C71D1D]/40 hover:bg-white"
      >
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] font-bold text-[#bd2725]">
              {node.employeeNumber}
            </span>
            <span className="font-semibold text-stone-900">{node.fullName}</span>
            <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-medium text-stone-600 ring-1 ring-stone-200">
              {node.departmentName}
            </span>
            {node.isDepartmentHead && (
              <span className="rounded bg-[#fbf0da] px-1.5 py-0.5 text-[10px] font-bold text-[#785716]">
                Dept Lead
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[11px] text-stone-500">
            {node.jobTitle} · {node.location}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {node.directReportsCount > 0 && (
            <span className="rounded-full bg-[#f9e9e6] px-2 py-0.5 text-[10px] font-bold text-[#a91919]">
              {node.directReportsCount} direct · {node.totalSpanOfControl ?? node.directReportsCount} total span
            </span>
          )}
          <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-bold capitalize text-stone-700">
            {String(node.status).replaceAll('_', ' ')}
          </span>
        </div>
      </Link>
      {children.length > 0 && depth < maxDepth && (
        <div className="space-y-1">
          {children.map((child) => (
            <SafeOrgTreeBranch
              key={child.id}
              node={child}
              byManager={byManager}
              depth={depth + 1}
              visited={nextVisited}
              maxDepth={maxDepth}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function OrganizationDesignerView({
  departments,
  canManagePeople,
}: {
  departments: any[];
  canManagePeople: boolean;
}) {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<'designer' | 'positions'>('designer');
  const [view, setView] = useState<'company' | 'department' | 'manager' | 'employee' | 'position'>('company');
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [asOf, setAsOf] = useState('');
  const [tableMode, setTableMode] = useState(false);
  const [maxDepth, setMaxDepth] = useState(8);
  const [zoomPct, setZoomPct] = useState(100);
  const [posOpen, setPosOpen] = useState(false);
  const [posError, setPosError] = useState<string | null>(null);

  const queryStr = new URLSearchParams({
    view,
    ...(search ? { search } : {}),
    ...(deptFilter ? { departmentId: deptFilter } : {}),
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(asOf ? { asOf } : {}),
  }).toString();

  const orgChartQuery = useQuery({
    queryKey: ['peopleos-org-chart', queryStr],
    queryFn: () => apiGet<any>(`/api/peopleos/org-chart?${queryStr}`),
  });

  const positionsQuery = useQuery({
    queryKey: ['peopleos-positions'],
    queryFn: () => apiGet<{ summary: any; items: any[]; positions?: any[] }>('/api/peopleos/positions'),
  });

  const orgNodes: any[] = orgChartQuery.data?.nodes ?? [];
  const nodeIds = new Set(orgNodes.map((n) => n.id));
  const byManager = new Map<string, any[]>();
  const roots: any[] = [];
  for (const node of orgNodes) {
    if (!node.managerId || !nodeIds.has(node.managerId)) {
      roots.push(node);
    } else {
      const list = byManager.get(node.managerId) ?? [];
      list.push(node);
      byManager.set(node.managerId, list);
    }
  }

  const positions = positionsQuery.data?.positions ?? positionsQuery.data?.items ?? [];
  const estSummary = positionsQuery.data?.summary;

  const createPosition = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPosError(null);
    const fd = new FormData(e.currentTarget);
    try {
      await apiPost('/api/peopleos/positions', {
        positionCode: String(fd.get('positionCode')).trim(),
        title: String(fd.get('title')).trim(),
        departmentId: String(fd.get('departmentId')),
        location: String(fd.get('location')).trim(),
        employmentType: String(fd.get('employmentType')),
        budgetedHeadcount: Number(fd.get('budgetedHeadcount') || 1),
      });
      setPosOpen(false);
      qc.invalidateQueries({ queryKey: ['peopleos-positions'] });
      qc.invalidateQueries({ queryKey: ['peopleos-org-chart'] });
    } catch (err) {
      setPosError(err instanceof Error ? err.message : 'Unable to create position.');
    }
  };

  const transitionPosition = async (posId: string, nextStatus: string) => {
    await apiPost(`/api/peopleos/positions/${posId}/transition`, {
      targetStatus: nextStatus,
    });
    qc.invalidateQueries({ queryKey: ['peopleos-positions'] });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <span
            className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-stone-600 ring-1 ring-stone-200"
            data-testid="text-department-count"
          >
            {departments.length} departments
          </span>
          <span
            className="rounded-full bg-[#e8f2eb] px-3 py-1.5 text-xs font-semibold text-[#34734d]"
            data-testid="text-organization-headcount"
          >
            {departments.reduce((sum, d) => sum + (d.headcount ?? 0), 0)} active headcount
          </span>
          <span
            className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-stone-600 ring-1 ring-stone-200"
            data-testid="text-org-chart-nodes"
          >
            {orgNodes.length} reporting nodes
          </span>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('designer')}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold ${
              activeTab === 'designer'
                ? 'bg-[#C71D1D] text-white'
                : 'bg-white text-stone-700 ring-1 ring-stone-200'
            }`}
          >
            <Layers size={14} /> Org Designer
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('positions')}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold ${
              activeTab === 'positions'
                ? 'bg-[#C71D1D] text-white'
                : 'bg-white text-stone-700 ring-1 ring-stone-200'
            }`}
            data-testid="tab-positions-register"
          >
            <Briefcase size={14} /> Position &amp; Establishment
          </button>
        </div>
      </div>

      {activeTab === 'designer' ? (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            {departments.map((dept) => (
              <section
                className="surface p-5 md:p-6"
                key={dept.id}
                data-testid={`card-department-${dept.id}`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="font-mono text-[10px] font-bold tracking-widest text-[#bd2725]">
                      {dept.code}
                    </span>
                    <h2 className="mt-2 font-display text-xl font-semibold text-stone-900">
                      {dept.name}
                    </h2>
                  </div>
                  <span className="rounded-lg bg-[#f5f1ec] p-2 text-stone-500">
                    <GitBranch size={17} />
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6 text-stone-500">
                  {dept.description ||
                    'Department information is available through the current organization record.'}
                </p>
                <div className="mt-5 grid grid-cols-2 gap-3 rounded-xl bg-[#faf8f5] p-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                      Headcount / Budget
                    </p>
                    <p className="mt-1 font-display text-2xl font-semibold text-stone-900">
                      {dept.headcount}
                      <span className="ml-1 text-xs font-medium text-stone-400">
                        / {dept.budgetedPositions}
                      </span>
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                      Department lead
                    </p>
                    <p className="mt-2 text-sm font-semibold text-stone-700">
                      {dept.managerName || 'Not assigned'}
                    </p>
                  </div>
                </div>
              </section>
            ))}
          </div>

          <section className="surface p-5 md:p-6" data-testid="section-org-hierarchy">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 pb-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#bd2725]">
                  Enterprise Organization Designer
                </p>
                <h2 className="mt-1 font-display text-lg font-semibold text-stone-900">
                  Reporting Lines, Integrity &amp; Historical Snapshot
                </h2>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setZoomPct((z) => Math.max(75, z - 10))}
                  className="btn btn-secondary min-h-8 px-2"
                  aria-label="Zoom out"
                >
                  <ZoomOut size={14} />
                </button>
                <span className="px-1 font-mono text-xs text-stone-600">{zoomPct}%</span>
                <button
                  type="button"
                  onClick={() => setZoomPct((z) => Math.min(125, z + 10))}
                  className="btn btn-secondary min-h-8 px-2"
                  aria-label="Zoom in"
                >
                  <ZoomIn size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setMaxDepth((d) => (d > 2 ? 1 : 8))}
                  className="btn btn-secondary min-h-8 px-2.5 text-xs"
                >
                  {maxDepth > 2 ? 'Collapse Branches' : 'Expand All'}
                </button>
                <button
                  type="button"
                  onClick={() => setTableMode((t) => !t)}
                  className="btn btn-secondary min-h-8 px-2.5 text-xs"
                >
                  <Table2 size={14} /> {tableMode ? 'Tree View' : 'Accessible Table'}
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-2.5 md:grid-cols-5">
              <label className="relative md:col-span-2">
                <span className="sr-only">Search chart</span>
                <Search size={14} className="absolute left-3 top-3 text-stone-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name, title, employee #…"
                  className="field pl-8 text-xs"
                />
              </label>
              <select
                aria-label="Chart view"
                value={view}
                onChange={(e) => setView(e.target.value as any)}
                className="field text-xs"
              >
                <option value="company">Company Tree</option>
                <option value="department">Department Focus</option>
                <option value="manager">Managers Only</option>
                <option value="employee">All Employees</option>
                <option value="position">Position Linked</option>
              </select>
              <select
                aria-label="Department filter"
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                className="field text-xs"
              >
                <option value="">All departments</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-1.5 text-xs">
                <span className="shrink-0 text-stone-500">As of:</span>
                <input
                  type="date"
                  value={asOf}
                  onChange={(e) => setAsOf(e.target.value)}
                  className="field text-xs"
                />
              </label>
            </div>

            {orgChartQuery.data?.historicalNotice && (
              <div className="mt-3 rounded-xl border border-[#ead4b1] bg-[#fbf3e4] p-3 text-xs text-[#6f5a30]">
                {orgChartQuery.data.historicalNotice}
              </div>
            )}

            {Array.isArray(orgChartQuery.data?.integrityAlerts) &&
              orgChartQuery.data.integrityAlerts.length > 0 && (
                <div
                  className="mt-3 rounded-xl border border-[#f2c8c8] bg-[#fdf2f2] p-3 text-xs text-[#9b1c1c]"
                  data-testid="org-integrity-alerts"
                >
                  <div className="flex items-center gap-1.5 font-bold">
                    <AlertTriangle size={14} /> Hierarchy Integrity Alerts (
                    {orgChartQuery.data.integrityAlerts.length})
                  </div>
                  <ul className="mt-1 list-disc pl-5">
                    {orgChartQuery.data.integrityAlerts.map((a: any, idx: number) => (
                      <li key={idx}>{a.message}</li>
                    ))}
                  </ul>
                </div>
              )}

            {tableMode ? (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-stone-200 text-[10px] uppercase tracking-wider text-stone-400">
                      <th className="py-2 pr-3">Employee</th>
                      <th className="py-2 pr-3">Title</th>
                      <th className="py-2 pr-3">Department</th>
                      <th className="py-2 pr-3">Direct / Span</th>
                      <th className="py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {orgNodes.map((n) => (
                      <tr key={n.id}>
                        <td className="py-2.5 pr-3 font-semibold text-stone-900">
                          <Link href={`/people/${n.id}`} className="hover:underline">
                            {n.fullName} ({n.employeeNumber})
                          </Link>
                        </td>
                        <td className="py-2.5 pr-3 text-stone-600">{n.jobTitle}</td>
                        <td className="py-2.5 pr-3 text-stone-600">{n.departmentName}</td>
                        <td className="py-2.5 pr-3 font-mono">
                          {n.directReportsCount} / {n.totalSpanOfControl ?? n.directReportsCount}
                        </td>
                        <td className="py-2.5 capitalize">{String(n.status).replaceAll('_', ' ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div
                className="mt-3 space-y-2 origin-top-left transition-transform"
                style={{ transform: `scale(${zoomPct / 100})` }}
              >
                {roots.map((root) => (
                  <SafeOrgTreeBranch
                    key={root.id}
                    node={root}
                    byManager={byManager}
                    maxDepth={maxDepth}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      ) : (
        <section className="surface p-5 md:p-6" data-testid="section-positions-establishment">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 pb-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#bd2725]">
                Headcount &amp; Vacancy Control
              </p>
              <h2 className="mt-1 font-display text-lg font-semibold text-stone-900">
                Position &amp; Establishment Register
              </h2>
            </div>
            {canManagePeople && (
              <button
                type="button"
                onClick={() => setPosOpen(true)}
                className="btn btn-primary text-xs"
                data-testid="button-create-position"
              >
                <Plus size={14} /> New Position
              </button>
            )}
          </div>

          {estSummary && (
            <div className="mt-4 grid gap-3 sm:grid-cols-4">
              <div className="rounded-xl bg-[#faf8f5] p-3.5">
                <p className="text-[10px] font-bold uppercase text-stone-400">Active Headcount</p>
                <p className="mt-1 font-display text-2xl font-semibold text-stone-900">
                  {estSummary.activeHeadcount ?? 0}
                </p>
              </div>
              <div className="rounded-xl bg-[#faf8f5] p-3.5">
                <p className="text-[10px] font-bold uppercase text-stone-400">Approved Slots</p>
                <p className="mt-1 font-display text-2xl font-semibold text-stone-900">
                  {estSummary.approvedBudgetedSlots ?? estSummary.totalApprovedPositions ?? 0}
                </p>
              </div>
              <div className="rounded-xl bg-[#faf8f5] p-3.5">
                <p className="text-[10px] font-bold uppercase text-stone-400">Open Vacancies</p>
                <p className="mt-1 font-display text-2xl font-semibold text-[#C71D1D]">
                  {estSummary.openVacanciesCount ?? estSummary.openVacancies ?? 0}
                </p>
              </div>
              <div className="rounded-xl bg-[#faf8f5] p-3.5">
                <p className="text-[10px] font-bold uppercase text-stone-400">Dept Budgeted Cap</p>
                <p className="mt-1 font-display text-2xl font-semibold text-stone-900">
                  {estSummary.departmentBudgetedCapacity ?? 0}
                </p>
              </div>
            </div>
          )}

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-stone-200 text-[10px] uppercase tracking-wider text-stone-400">
                  <th className="py-2 pr-3">Code</th>
                  <th className="py-2 pr-3">Position Title</th>
                  <th className="py-2 pr-3">Department</th>
                  <th className="py-2 pr-3">Filled / Budget</th>
                  <th className="py-2 pr-3">Status</th>
                  {canManagePeople && <th className="py-2">Governance Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {positions.map((pos: any) => (
                  <tr key={pos.id}>
                    <td className="py-2.5 pr-3 font-mono font-bold text-[#bd2725]">
                      {pos.positionCode}
                    </td>
                    <td className="py-2.5 pr-3 font-semibold text-stone-800">{pos.title}</td>
                    <td className="py-2.5 pr-3 text-stone-600">{pos.departmentName}</td>
                    <td className="py-2.5 pr-3 font-mono">
                      {pos.filledHeadcount ?? 0} / {pos.budgetedHeadcount ?? pos.headcountBudget ?? 1}
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-bold uppercase text-stone-700">
                        {pos.status}
                      </span>
                    </td>
                    {canManagePeople && (
                      <td className="py-2.5">
                        <div className="flex flex-wrap gap-1.5">
                          {pos.status === 'draft' && (
                            <button
                              type="button"
                              onClick={() => void transitionPosition(pos.id, 'pending_approval')}
                              className="btn btn-secondary min-h-7 px-2 text-[11px]"
                            >
                              Submit
                            </button>
                          )}
                          {pos.status === 'pending_approval' && (
                            <button
                              type="button"
                              onClick={() => void transitionPosition(pos.id, 'approved')}
                              className="btn btn-primary min-h-7 px-2 text-[11px]"
                            >
                              Approve
                            </button>
                          )}
                          {['approved', 'vacant', 'occupied'].includes(pos.status) && (
                            <button
                              type="button"
                              onClick={() => void transitionPosition(pos.id, 'frozen')}
                              className="btn btn-secondary min-h-7 px-2 text-[11px]"
                            >
                              Freeze
                            </button>
                          )}
                          {pos.status === 'frozen' && (
                            <button
                              type="button"
                              onClick={() => void transitionPosition(pos.id, 'vacant')}
                              className="btn btn-secondary min-h-7 px-2 text-[11px]"
                            >
                              Unfreeze
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {posOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-[520px] rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold text-stone-900">
                Create Establishment Position
              </h3>
              <button
                type="button"
                onClick={() => setPosOpen(false)}
                className="btn btn-ghost min-h-8 px-2"
              >
                <X size={16} />
              </button>
            </div>
            <form onSubmit={createPosition} className="space-y-3 text-xs">
              <div className="grid gap-3 sm:grid-cols-2">
                <label>
                  <span className="label">Position Code</span>
                  <input name="positionCode" required placeholder="POS-OPS-09" className="field" />
                </label>
                <label>
                  <span className="label">Budgeted Slots</span>
                  <input
                    name="budgetedHeadcount"
                    type="number"
                    min={1}
                    defaultValue={1}
                    required
                    className="field"
                  />
                </label>
              </div>
              <label className="block">
                <span className="label">Position Title</span>
                <input name="title" required placeholder="Production Shift Supervisor" className="field" />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label>
                  <span className="label">Department</span>
                  <select name="departmentId" className="field" required>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="label">Employment Type</span>
                  <select name="employmentType" className="field" defaultValue="permanent">
                    <option value="permanent">Permanent</option>
                    <option value="fixed_term">Fixed Term</option>
                    <option value="casual">Casual</option>
                    <option value="intern">Intern</option>
                  </select>
                </label>
              </div>
              <label className="block">
                <span className="label">Location</span>
                <input name="location" defaultValue="Nairobi Production Facility" required className="field" />
              </label>
              {posError && <p className="text-xs text-[#a91919]">{posError}</p>}
              <div className="flex justify-end gap-2 border-t border-stone-100 pt-3">
                <button
                  type="button"
                  onClick={() => setPosOpen(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Create Position
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
