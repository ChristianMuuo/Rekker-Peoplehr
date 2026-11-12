import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getListEmployeesQueryKey, useListDepartments } from '@workspace/api-client-react';
import { CheckCircle2, UserPlus, X } from 'lucide-react';
import { apiGet, apiPost } from '@/lib/api';

export function ConvertCandidateModal({
  candidate,
  onClose,
}: {
  candidate: any;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const deptsQuery = useListDepartments();
  const positionsQuery = useQuery({
    queryKey: ['peopleos-positions'],
    queryFn: () => apiGet<{ items?: any[]; positions?: any[] }>('/api/peopleos/positions'),
  });

  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [convertedResult, setConvertedResult] = useState<any | null>(null);

  const openPositions = (positionsQuery.data?.positions ?? positionsQuery.data?.items ?? []).filter(
    (p: any) => ['approved', 'vacant', 'occupied'].includes(p.status),
  );

  const submitConversion = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setErrorMsg(null);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await apiPost<any>(
        `/api/recruitment/candidates/${candidate.id}/convert-to-employee`,
        {
          jobTitle: String(fd.get('jobTitle') || candidate.jobTitle),
          departmentId: String(fd.get('departmentId')),
          positionId: String(fd.get('positionId') || '') || null,
          location: String(fd.get('location')),
          employmentType: String(fd.get('employmentType')),
          startDate: String(fd.get('startDate')),
        },
      );
      setConvertedResult(res);
      qc.invalidateQueries({ queryKey: ['recruitment-candidates'] });
      qc.invalidateQueries({ queryKey: ['onboarding-tasks'] });
      qc.invalidateQueries({ queryKey: getListEmployeesQueryKey() });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to convert candidate.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-stone-100 pb-3">
          <div className="flex items-center gap-2">
            <UserPlus size={16} className="text-[#C71D1D]" />
            <h3 className="font-display text-base font-bold text-stone-900">
              Convert Candidate to Employee Record
            </h3>
          </div>
          <button type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {convertedResult ? (
          <div className="mt-4 space-y-3 text-xs">
            <div className="flex items-start gap-2 rounded-xl border border-[#b9dfc6] bg-[#e8f2eb] p-3 text-[#235436]">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-bold">Employee Record &amp; Onboarding Provisioned</p>
                <p className="mt-1">
                  Candidate converted idempotently to employee{' '}
                  <strong>{convertedResult.employee?.employeeNumber ?? convertedResult.employee?.id}</strong> and onboarding tasks spawned.
                </p>
              </div>
            </div>
            <div className="flex justify-end">
              <button type="button" onClick={onClose} className="btn btn-primary text-xs">
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={submitConversion} className="mt-4 space-y-3 text-xs">
            <div className="rounded-xl bg-[#faf8f5] p-3">
              <p className="font-semibold text-stone-900">{candidate.fullName}</p>
              <p className="text-stone-500">
                {candidate.email} · {candidate.jobTitle}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label>
                <span className="label">Job Title</span>
                <input name="jobTitle" defaultValue={candidate.jobTitle} required className="field" />
              </label>
              <label>
                <span className="label">Department</span>
                <select name="departmentId" required className="field">
                  {(deptsQuery.data ?? []).map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="label">Establishment Position (Optional)</span>
                <select name="positionId" className="field">
                  <option value="">No position link</option>
                  {openPositions.map((p: any) => (
                    <option key={p.id} value={p.id}>
                      {p.positionCode} — {p.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="label">Work Location</span>
                <input
                  name="location"
                  defaultValue="Nairobi Production Facility"
                  required
                  className="field"
                />
              </label>
              <label>
                <span className="label">Employment Type</span>
                <select name="employmentType" defaultValue="permanent" className="field">
                  <option value="permanent">Permanent</option>
                  <option value="fixed_term">Fixed Term</option>
                  <option value="casual">Casual</option>
                  <option value="intern">Intern</option>
                </select>
              </label>
              <label>
                <span className="label">Start Date</span>
                <input
                  name="startDate"
                  type="date"
                  defaultValue={new Date().toISOString().slice(0, 10)}
                  required
                  className="field"
                />
              </label>
            </div>
            {errorMsg && <p className="text-xs text-[#a91919]">{errorMsg}</p>}
            <div className="flex justify-end gap-2 border-t border-stone-100 pt-3">
              <button type="button" onClick={onClose} className="btn btn-secondary text-xs">
                Cancel
              </button>
              <button type="submit" disabled={busy} className="btn btn-primary text-xs">
                {busy ? 'Converting…' : 'Convert & Spawn Onboarding'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

