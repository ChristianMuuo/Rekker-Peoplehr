import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { ArrowRight, ExternalLink, ShoppingBag } from 'lucide-react';
import { apiGet } from '../lib/api';

function PortalHeader({ active }: { active: 'careers' | 'legal' }) {
  return (
    <header className="border-b border-stone-200 bg-white">
      <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between px-4 md:px-8">
        <Link href="/" className="flex items-center gap-3">
          <img src="https://rekker.co.ke/Logo.jpg" alt="Rekker" className="h-8 w-auto" />
          <span className="border-l border-stone-300 pl-3 font-display text-sm font-bold text-stone-800">PeopleOS Hub</span>
        </Link>
        <div className="flex flex-wrap items-center gap-3 text-xs font-semibold">
          <a href="https://rekker.co.ke/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-stone-600 hover:text-stone-950">
            Corporate Site <ExternalLink size={12} />
          </a>
          <a href="https://shop.rekker.co.ke/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-stone-600 hover:text-stone-950">
            <ShoppingBag size={12} /> Shop Online <ExternalLink size={12} />
          </a>
          <Link href="/careers" className={active === 'careers' ? 'text-[#C71D1D]' : 'text-stone-600 hover:text-stone-950'}>Careers</Link>
          <Link href="/portal" className="text-stone-600 hover:text-stone-950">Customer Portal</Link>
          <Link href="/distributor" className="text-stone-600 hover:text-stone-950">Distributor Portal</Link>
          <Link href="/overview" className="btn btn-primary min-h-8 px-3 text-xs">Open ERP</Link>
        </div>
      </div>
    </header>
  );
}

export function CareersPage() {
  const jobs = useQuery({ queryKey: ['public-careers'], queryFn: () => apiGet('/api/public/careers') });
  const items: any[] = jobs.data?.items ?? [];

  return (
    <div className="min-h-[100dvh] bg-[#f7f5f1] text-stone-900">
      <PortalHeader active="careers" />
      <section className="bg-[#161413] py-14 text-white">
        <div className="mx-auto max-w-[1280px] px-4 md:px-8">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#e87c76]">Rekker PeopleOS · Live Requisitions</p>
          <h1 className="mt-2 font-display text-3xl font-bold md:text-5xl">Open Roles at Rekker Limited</h1>
          <p className="mt-3 max-w-2xl text-sm text-white/70">
            Published directly from Rekker PeopleOS Recruitment. Internal payroll bands and applicant evaluations remain private to HR.
          </p>
        </div>
      </section>
      <main className="mx-auto max-w-[1280px] px-4 py-10 md:px-8">
        <div className="grid gap-4">
          {items.map((job) => (
            <div key={job.id} className="surface flex flex-col justify-between gap-4 p-6 md:flex-row md:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-[#C71D1D]">
                  <span>{job.departmentName}</span>
                  <span className="text-stone-300">·</span>
                  <span className="text-stone-500">{job.location}</span>
                  <span className="rounded bg-stone-100 px-2 py-0.5 text-stone-600">{job.openings} opening(s)</span>
                </div>
                <h2 className="mt-1 font-display text-xl font-bold text-stone-900">{job.title}</h2>
                <p className="mt-2 max-w-2xl text-xs leading-5 text-stone-600">{job.description}</p>
              </div>
              <a href={`mailto:info@rekker.co.ke?subject=Application: ${encodeURIComponent(job.title)}`} className="btn btn-primary shrink-0 text-xs">
                Apply via HR <ArrowRight size={14} />
              </a>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

export function LegalPage({ mode }: { mode: 'privacy' | 'terms' }) {
  return (
    <div className="min-h-[100dvh] bg-[#f7f5f1] text-stone-900">
      <PortalHeader active="legal" />
      <main className="mx-auto max-w-3xl px-4 py-12 md:px-8">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#C71D1D]">Governance &amp; Compliance</p>
        <h1 className="mt-2 font-display text-3xl font-bold text-stone-900">
          {mode === 'privacy' ? 'ODPC Data Protection & Privacy Policy' : 'B2B Portal & ERP Terms of Service'}
        </h1>
        <div className="surface mt-6 space-y-4 p-7 text-sm leading-7 text-stone-600">
          {mode === 'privacy' ? (
            <>
              <p>Rekker PeopleOS processes employee, B2B customer quotation, and distributor onboarding records strictly in compliance with the Kenya Data Protection Act 2019 (ODPC).</p>
              <p>Customer and distributor accounts are strictly isolated by authenticated organization and user ownership controls.</p>
            </>
          ) : (
            <>
              <p>Wholesale orders, B2B quotations, and regional partner approvals processed inside Rekker PeopleOS Portals are subject to official review, minimum order quantity rules, and formal acceptance by Rekker Limited.</p>
              <p>For corporate branding and retail e-commerce terms, visit <a href="https://rekker.co.ke" target="_blank" rel="noreferrer" className="font-bold text-[#C71D1D]">rekker.co.ke</a> and <a href="https://shop.rekker.co.ke" target="_blank" rel="noreferrer" className="font-bold text-[#C71D1D]">shop.rekker.co.ke</a>.</p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
