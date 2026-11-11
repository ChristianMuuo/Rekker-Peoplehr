import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useRoute } from 'wouter';
import {
  ArrowRight, Award, BriefcaseBusiness, CheckCircle2, ExternalLink, Factory,
  Layers, Mail, MapPin, PackageCheck, Search, ShieldCheck, ShoppingBag, Sparkles, Truck, Users, X,
} from 'lucide-react';
import { apiGet, apiPost } from '../../lib/api';
import { PublicLayout, QuoteModal, useSeoMeta } from '../../components/PublicLayout';

/* ============================================================================
 * 1. CORPORATE HOMEPAGE (/) — PHASE 2.1 REDESIGN
 * ==========================================================================*/
export function PublicHomePage() {
  useSeoMeta(
    'Rekker Limited | Manufacturing & Distribution of Kenya’s Everyday Brands',
    'Rekker manufactures and distributes trusted consumer brands across Kenya — Saffron Milan, Bio Saff, Cornells and PetCare. Partner with us, request quotations, or open Portals.',
    '/',
  );
  const overview = useQuery({
    queryKey: ['public-overview'],
    queryFn: () => apiGet('/api/public/overview'),
  });
  const [quoteProduct, setQuoteProduct] = useState<any | null>(null);

  const brands: any[] = overview.data?.brands ?? [];
  const featured: any[] = overview.data?.featuredProducts ?? [];

  return (
    <PublicLayout>
      {/* Hero Section */}
      <section className="relative isolate overflow-hidden bg-[#141312] text-white">
        <img
          src="https://rekker.co.ke/images/hero-rekker.jpg"
          alt="Rekker manufacturing and nationwide distribution warehouse in Nairobi, Kenya"
          className="absolute inset-0 h-full w-full object-cover opacity-35"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#141312] via-[#141312]/90 to-[#141312]/40" />

        <div className="relative mx-auto max-w-[1360px] px-4 py-20 md:px-8 md:py-28">
          <div className="max-w-3xl enter">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white/85">
              <span className="h-1.5 w-1.5 rounded-full bg-[#e87c76]" /> Nairobi, Kenya · Manufacturing &amp; Nationwide Trade
            </span>
            <h1 className="mt-6 font-display text-4xl font-bold leading-[1.06] tracking-tight sm:text-5xl md:text-6xl">
              We build, make and move the brands Kenya <span className="text-[#e15a52]">uses every day.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-white/75 md:text-lg">
              Rekker Limited operates across the full consumer goods value chain: local formulation and manufacturing in Nairobi, end-to-end brand building, 47-county trade distribution, and direct consumer commerce.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/products" className="btn btn-primary min-h-12 px-6 text-sm" data-testid="button-hero-products">
                Explore Products <ArrowRight size={16} />
              </Link>
              <Link href="/partnerships" className="btn min-h-12 border border-white/25 bg-white/5 px-6 text-sm text-white hover:bg-white/15" data-testid="button-hero-partner">
                Partner With Us
              </Link>
              <Link href="/contact" className="btn min-h-12 px-5 text-sm text-white/80 hover:bg-white/10 hover:text-white">
                Contact Our Team
              </Link>
            </div>
          </div>

          <div className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-white/15 bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: 'Owned & Distributed Brands', value: '4 Core Lines', sub: 'Saffron Milan, Bio Saff, Cornells, PetCare' },
              { label: 'Distribution Footprint Target', value: '47 Counties', sub: 'Modern trade, general trade & wholesalers' },
              { label: 'Stocked Line Turnaround Target', value: '24 Hours', sub: 'Central Nairobi order-to-dispatch cadence' },
              { label: 'Direct Consumer Commerce', value: 'shop.rekker.co.ke', sub: 'Unified M-Pesa D2C online store' },
            ].map((stat) => (
              <div key={stat.label} className="bg-[#1b1917]/95 p-5">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/50">{stat.label}</p>
                <p className="mt-2 font-display text-2xl font-bold text-white">{stat.value}</p>
                <p className="mt-1 text-xs text-white/60">{stat.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Company Introduction */}
      <section className="border-b border-stone-200 bg-white py-16 md:py-24">
        <div className="mx-auto grid max-w-[1360px] gap-12 px-4 md:grid-cols-[1.05fr_1.2fr] md:items-center md:px-8">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#C71D1D]">Who We Are</p>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-stone-900 md:text-4xl">
              From local formulation to shelves in all 47 counties.
            </h2>
            <p className="mt-4 text-sm leading-7 text-stone-600 md:text-base">
              We build brands end to end — formulation, packaging, pricing, wholesale coverage, and direct-to-consumer shopping — rather than simply moving boxes.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/about" className="btn btn-secondary text-xs">Our Story &amp; Milestones <ArrowRight size={14} /></Link>
              <Link href="/portal" className="btn btn-ghost text-xs font-semibold text-[#C71D1D]">Open Customer Portal</Link>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {[
              { icon: Factory, title: 'Mission', body: 'Deliver dependable, quality-tested home care, personal care, fragrance, and pet care brands tailored to Kenyan households and trade partners.' },
              { icon: Sparkles, title: 'Vision', body: 'To connect local manufacturing precision with seamless nationwide wholesale and digital commerce across East Africa.' },
              { icon: ShieldCheck, title: 'Quality & Integrity', body: 'Batch-level formulation checks, transparent pricing, Kenya ODPC data governance, and compliance with Kenyan consumer goods standards.' },
              { icon: Truck, title: 'Execution Speed', body: 'Local Nairobi production eliminates long import lead times so retailers and regional distributors stay consistently in stock.' },
            ].map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-xl border border-stone-200 bg-[#faf8f5] p-5">
                <Icon size={18} className="text-[#C71D1D]" />
                <h3 className="mt-3 font-display text-base font-bold text-stone-900">{title}</h3>
                <p className="mt-1.5 text-xs leading-5 text-stone-600">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Portfolio Brands Showcase */}
      <section className="py-16 md:py-24">
        <div className="mx-auto max-w-[1360px] px-4 md:px-8">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#C71D1D]">Brand Portfolio</p>
              <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-stone-900 md:text-4xl">
                One company. Distinct identities.
              </h2>
            </div>
            <Link href="/brands" className="text-xs font-bold text-[#C71D1D] hover:underline">
              Explore all 4 brands <ArrowRight size={13} className="inline" />
            </Link>
          </div>

          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {brands.map((brand) => (
              <Link
                key={brand.slug}
                href={`/brands/${brand.slug}`}
                className="group flex flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white transition-all hover:-translate-y-0.5 hover:shadow-lg"
                data-testid={`card-brand-${brand.slug}`}
              >
                <div className="relative h-52 overflow-hidden bg-stone-100">
                  <img
                    src={brand.image}
                    alt={`${brand.name} — ${brand.category}`}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    loading="lazy"
                  />
                  <span className="absolute left-3 top-3 rounded-md bg-[#C71D1D] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white">
                    {brand.category}
                  </span>
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">{brand.origin}</p>
                  <h3 className="mt-1 font-display text-xl font-bold text-stone-900">{brand.name}</h3>
                  <p className="mt-2 flex-1 text-xs leading-5 text-stone-600">{brand.tagline}</p>
                  <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-[#C71D1D]">
                    View portfolio <ArrowRight size={13} />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Catalogue */}
      <section className="border-y border-stone-200 bg-white py-16 md:py-20">
        <div className="mx-auto max-w-[1360px] px-4 md:px-8">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#C71D1D]">Trade Product Catalogue</p>
              <h2 className="mt-2 font-display text-2xl font-bold text-stone-900 md:text-3xl">Featured Commercial Lines</h2>
              <p className="mt-1 text-xs text-stone-500">Live catalogue managed in Rekker CMS. Request formal trade quotations directly into our CRM.</p>
            </div>
            <Link href="/products" className="btn btn-secondary text-xs">Open Full Catalogue</Link>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {featured.map((prod) => (
              <div key={prod.id} className="flex flex-col rounded-xl border border-stone-200 bg-[#faf8f5] p-4">
                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-stone-500">
                  <span>{prod.brandName}</span>
                  <span className="font-mono text-stone-400">{prod.sku}</span>
                </div>
                <h3 className="mt-2 font-display text-base font-bold text-stone-900">{prod.name}</h3>
                <p className="mt-2 flex-1 text-xs leading-5 text-stone-600">{prod.shortDescription}</p>
                <p className="mt-3 text-[11px] font-semibold text-stone-500">MOQ: {prod.moqUnits} units · {prod.packagingInfo}</p>
                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => setQuoteProduct(prod)}
                    className="btn btn-primary min-h-9 flex-1 text-xs"
                    data-testid={`button-quote-${prod.sku}`}
                  >
                    Request Quote
                  </button>
                  <Link href={`/products`} className="btn btn-secondary min-h-9 px-3 text-xs">Details</Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Manufacturing + Quality + Distribution */}
      <section className="py-16 md:py-24">
        <div className="mx-auto grid max-w-[1360px] gap-6 px-4 lg:grid-cols-3 md:px-8">
          <div className="rounded-2xl border border-stone-200 bg-white p-7">
            <Factory size={22} className="text-[#C71D1D]" />
            <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.16em] text-stone-400">Production</p>
            <h3 className="mt-1 font-display text-xl font-bold text-stone-900">Manufacturing &amp; Filling</h3>
            <p className="mt-2 text-xs leading-6 text-stone-600">
              Formulation &amp; R&amp;D tuned for Kenyan hard water, climate, and daily habits, paired with batch production, capping, labelling, and private label manufacturing under one roof in Nairobi.
            </p>
            <Link href="/manufacturing" className="mt-5 inline-flex items-center gap-1.5 text-xs font-bold text-[#C71D1D] hover:underline">
              Explore manufacturing <ArrowRight size={13} />
            </Link>
          </div>

          <div className="rounded-2xl border border-stone-200 bg-white p-7">
            <Truck size={22} className="text-[#C71D1D]" />
            <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.16em] text-stone-400">Channels</p>
            <h3 className="mt-1 font-display text-xl font-bold text-stone-900">Nationwide Distribution</h3>
            <p className="mt-2 text-xs leading-6 text-stone-600">
              Supplying supermarkets, minimarkets, dukas, salons, wholesalers, and regional county distributors with structured route logistics targeting all 47 counties.
            </p>
            <Link href="/distribution" className="mt-5 inline-flex items-center gap-1.5 text-xs font-bold text-[#C71D1D] hover:underline">
              Distribution network <ArrowRight size={13} />
            </Link>
          </div>

          <div className="rounded-2xl border border-stone-200 bg-white p-7">
            <Award size={22} className="text-[#C71D1D]" />
            <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.16em] text-stone-400">Standards</p>
            <h3 className="mt-1 font-display text-xl font-bold text-stone-900">Quality Control &amp; Compliance</h3>
            <p className="mt-2 text-xs leading-6 text-stone-600">
              Batch-level quality checks, packaging verification, and adherence to Kenyan consumer goods regulatory standards prior to every warehouse dispatch.
            </p>
            <Link href="/about" className="mt-5 inline-flex items-center gap-1.5 text-xs font-bold text-[#C71D1D] hover:underline">
              Quality &amp; credibility <ArrowRight size={13} />
            </Link>
          </div>
        </div>
      </section>

      {/* Conversion CTA */}
      <section className="bg-[#C71D1D] py-14 text-white">
        <div className="mx-auto flex max-w-[1360px] flex-col items-start justify-between gap-6 px-4 md:flex-row md:items-center md:px-8">
          <div className="max-w-2xl">
            <h2 className="font-display text-3xl font-bold tracking-tight">Ready to stock, distribute, or manufacture with Rekker?</h2>
            <p className="mt-2 text-sm text-white/85">
              Apply for regional trade terms, open the Wholesale Distributor Portal, or shop individual items online via <span className="font-bold underline">shop.rekker.co.ke</span>.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/partnerships" className="btn min-h-11 bg-white px-5 text-xs font-bold text-[#C71D1D] hover:bg-stone-100">
              Become a Distributor
            </Link>
            <button onClick={() => setQuoteProduct({})} className="btn min-h-11 border border-white/40 bg-[#141312] px-5 text-xs font-bold text-white hover:bg-black">
              Request Trade Quote
            </button>
          </div>
        </div>
      </section>

      {quoteProduct && <QuoteModal initialProduct={quoteProduct} onClose={() => setQuoteProduct(null)} />}
    </PublicLayout>
  );
}

/* ============================================================================
 * 2. ABOUT PAGE (/about)
 * ==========================================================================*/
export function AboutPage() {
  useSeoMeta(
    'About Rekker Limited | Consumer Goods Manufacturing & Distribution in Kenya',
    'Who Rekker is: a Kenyan consumer goods company building, manufacturing and distributing household, beauty, fragrance and pet-care brands nationwide.',
    '/about',
  );

  const milestones = [
    { step: '01', title: 'Built on trade', copy: 'Rekker started by moving fast-moving consumer goods through Kenya’s general trade and modern retail channels.' },
    { step: '02', title: 'Into manufacturing', copy: 'Moved upstream into local formulation and production of home care and personal care lines in Nairobi, controlling quality, pack sizes, and landed cost.' },
    { step: '03', title: 'Brand ownership', copy: 'Developed Saffron Milan and Bio Saff in-house, launched PetCare gentle pet shampoo, and expanded nationwide Cornells fragrance distribution.' },
    { step: '04', title: 'Consumer commerce', copy: 'Launched shop.rekker.co.ke with unified cart and M-Pesa D2C delivery alongside nationwide wholesale trade.' },
    { step: '05', title: 'Digital Ecosystem', copy: 'Connected public brand storefronts, quotation-to-CRM pipelines, B2B distributor portals, and PeopleOS workforce operations.' },
  ];

  return (
    <PublicLayout>
      <section className="bg-[#141312] py-16 text-white md:py-24">
        <div className="mx-auto max-w-[1360px] px-4 md:px-8">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#e87c76]">Company Profile</p>
          <h1 className="mt-3 max-w-3xl font-display text-4xl font-bold tracking-tight md:text-5xl">
            A Kenyan consumer goods company built for scale.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-white/70">
            Rekker Limited develops, manufactures, and distributes household, beauty, fragrance, and pet-care brands across Kenya from its Nairobi operations hub.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-[1360px] px-4 py-16 md:px-8">
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#C71D1D]">Operations</p>
            <h2 className="mt-2 font-display text-3xl font-bold text-stone-900">Products people actually reach for.</h2>
            <div className="mt-4 space-y-4 text-sm leading-7 text-stone-600">
              <p>Rekker Limited operates across formulation, manufacturing, brand building, trade sales, and nationwide distribution across modern retail and general trade outlets.</p>
              <p>Our objective is practical: produce and supply brands that perform consistently on the shelf and online, backed by responsive commercial support for every stockist and regional distributor.</p>
            </div>
          </div>
          <div className="rounded-2xl border border-stone-200 bg-white p-7">
            <h3 className="font-display text-lg font-bold text-stone-900">Quality Commitments</h3>
            <ul className="mt-4 space-y-3 text-sm text-stone-600">
              <li className="flex gap-2.5"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-[#338956]" /> Local batch-level checks and packaging verification before warehouse release.</li>
              <li className="flex gap-2.5"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-[#338956]" /> Adherence to Kenyan statutory consumer goods standards across formulations and labels.</li>
              <li className="flex gap-2.5"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-[#338956]" /> ODPC Kenya Data Protection Act 2019 governance across trade partner and customer records.</li>
            </ul>
          </div>
        </div>

        <div className="mt-16">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#C71D1D]">Company Timeline</p>
          <h2 className="mt-2 font-display text-3xl font-bold text-stone-900">Verified Evolution</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-5">
            {milestones.map((m) => (
              <div key={m.step} className="rounded-xl border border-stone-200 bg-white p-5">
                <span className="font-display text-3xl font-bold text-[#C71D1D]/25">{m.step}</span>
                <h3 className="mt-2 font-display text-base font-bold text-stone-900">{m.title}</h3>
                <p className="mt-2 text-xs leading-5 text-stone-600">{m.copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}

/* ============================================================================
 * 3. BRANDS & PRODUCT CATALOGUE (/brands, /brands/:slug, /products) — PHASE 3
 * ==========================================================================*/
export function BrandsCatalogPage() {
  const [matchBrand, params] = useRoute('/brands/:slug');
  const brandSlugFilter = matchBrand ? params?.slug ?? '' : '';
  useSeoMeta(
    brandSlugFilter ? `${brandSlugFilter.replace('-', ' ').toUpperCase()} | Rekker Brands` : 'Product Catalogue & Brands | Rekker Limited',
    'Browse Saffron Milan home care, Bio Saff beauty, Cornells fragrance and PetCare lines. Search SKUs and request trade quotations.',
    brandSlugFilter ? `/brands/${brandSlugFilter}` : '/products',
  );

  const [selectedBrand, setSelectedBrand] = useState(brandSlugFilter);
  const [search, setSearch] = useState('');
  const [quoteProduct, setQuoteProduct] = useState<any | null>(null);
  const [detailProduct, setDetailProduct] = useState<any | null>(null);

  const activeBrand = brandSlugFilter || selectedBrand;
  const catalogQuery = useQuery({
    queryKey: ['public-catalog', activeBrand, search],
    queryFn: () => {
      const sp = new URLSearchParams();
      if (activeBrand) sp.set('brand', activeBrand);
      if (search.trim()) sp.set('search', search.trim());
      return apiGet(`/api/public/catalog?${sp.toString()}`);
    },
  });

  const brands: any[] = catalogQuery.data?.brands ?? [];
  const items: any[] = catalogQuery.data?.items ?? [];
  const spotlightBrand = brands.find((b) => b.slug === activeBrand);

  return (
    <PublicLayout>
      <section className="bg-[#141312] py-14 text-white">
        <div className="mx-auto max-w-[1360px] px-4 md:px-8">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#e87c76]">Portfolio &amp; Trade Catalogue</p>
          <h1 className="mt-2 font-display text-3xl font-bold md:text-5xl">
            {spotlightBrand ? spotlightBrand.name : 'One platform. Multiple trusted brands.'}
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-white/70">
            {spotlightBrand
              ? spotlightBrand.description
              : 'Filter by brand or SKU, inspect packaging specifications, and submit formal trade quotation requests directly into Rekker CRM.'}
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-[1360px] px-4 py-10 md:px-8">
        {/* Filter bar */}
        <div className="flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-2">
            <Link
              href="/products"
              onClick={() => setSelectedBrand('')}
              className={`rounded-lg px-3.5 py-2 text-xs font-bold ${!activeBrand ? 'bg-[#C71D1D] text-white' : 'bg-stone-100 text-stone-700 hover:bg-stone-200'}`}
            >
              All Brands
            </Link>
            {brands.map((b) => (
              <Link
                key={b.slug}
                href={`/brands/${b.slug}`}
                onClick={() => setSelectedBrand(b.slug)}
                className={`rounded-lg px-3.5 py-2 text-xs font-bold ${activeBrand === b.slug ? 'bg-[#C71D1D] text-white' : 'bg-stone-100 text-stone-700 hover:bg-stone-200'}`}
              >
                {b.name}
              </Link>
            ))}
          </div>

          <div className="relative w-full md:w-72">
            <Search size={15} className="absolute left-3 top-3 text-stone-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search SKU or product..."
              className="field pl-9"
              data-testid="input-catalog-search"
            />
          </div>
        </div>

        {/* Product Grid */}
        {catalogQuery.isLoading ? (
          <div className="mt-8 grid gap-4 md:grid-cols-3"><div className="skeleton h-72" /><div className="skeleton h-72" /><div className="skeleton h-72" /></div>
        ) : items.length === 0 ? (
          <div className="surface mt-8 p-12 text-center">
            <p className="font-display text-lg font-bold text-stone-800">No published products match this filter</p>
            <p className="mt-1 text-xs text-stone-500">Adjust the brand filter or search keywords.</p>
          </div>
        ) : (
          <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {items.map((p) => (
              <article key={p.id} className="flex flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white" data-testid={`card-product-${p.sku}`}>
                <div className="relative h-48 bg-stone-100">
                  <img src={p.imageUrls?.[0] || 'https://rekker.co.ke/images/hero-rekker.jpg'} alt={p.name} className="h-full w-full object-cover" loading="lazy" />
                  {p.isFeatured && (
                    <span className="absolute right-3 top-3 rounded bg-[#141312] px-2.5 py-1 text-[10px] font-bold uppercase text-white">
                      Featured
                    </span>
                  )}
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <div className="flex items-center justify-between text-[11px] font-bold text-stone-400">
                    <span className="text-[#C71D1D]">{p.brandName}</span>
                    <span className="font-mono">{p.sku}</span>
                  </div>
                  <h2 className="mt-2 font-display text-lg font-bold text-stone-900">{p.name}</h2>
                  <p className="mt-2 flex-1 text-xs leading-5 text-stone-600">{p.shortDescription}</p>
                  <div className="mt-4 rounded-lg bg-stone-50 p-2.5 text-[11px] text-stone-600">
                    <span className="font-bold">MOQ:</span> {p.moqUnits} units · <span className="font-bold">Pack:</span> {p.packagingInfo}
                  </div>
                  <div className="mt-4 flex gap-2">
                    <button onClick={() => setQuoteProduct(p)} className="btn btn-primary min-h-9 flex-1 text-xs">
                      Request Quotation
                    </button>
                    <button onClick={() => setDetailProduct(p)} className="btn btn-secondary min-h-9 px-3 text-xs">
                      Specs
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {detailProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/60 p-4" onClick={() => setDetailProduct(null)}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between border-b border-stone-100 pb-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#C71D1D]">{detailProduct.brandName} · {detailProduct.sku}</p>
                <h3 className="font-display text-xl font-bold text-stone-900">{detailProduct.name}</h3>
              </div>
              <button onClick={() => setDetailProduct(null)}><X size={18} /></button>
            </div>
            <p className="mt-4 text-sm text-stone-600">{detailProduct.description}</p>
            {Array.isArray(detailProduct.specifications) && detailProduct.specifications.length > 0 && (
              <div className="mt-4 divide-y divide-stone-100 rounded-xl border border-stone-200 bg-stone-50 p-3 text-xs">
                {detailProduct.specifications.map((s: any, idx: number) => (
                  <div key={idx} className="flex justify-between py-2">
                    <span className="font-semibold text-stone-500">{s.label}</span>
                    <span className="font-bold text-stone-800">{s.value}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setDetailProduct(null)} className="btn btn-secondary text-xs">Close</button>
              <button onClick={() => { const p = detailProduct; setDetailProduct(null); setQuoteProduct(p); }} className="btn btn-primary text-xs">
                Request Quotation
              </button>
            </div>
          </div>
        </div>
      )}

      {quoteProduct && <QuoteModal initialProduct={quoteProduct} onClose={() => setQuoteProduct(null)} />}
    </PublicLayout>
  );
}

/* ============================================================================
 * 4. MANUFACTURING (/manufacturing) & DISTRIBUTION (/distribution)
 * ==========================================================================*/
export function ManufacturingPage() {
  useSeoMeta(
    'Manufacturing Capabilities | Rekker Limited',
    'Rekker’s local formulation, batch production, filling, quality control and private label capabilities in Nairobi.',
    '/manufacturing',
  );
  const [quoteOpen, setQuoteOpen] = useState(false);
  return (
    <PublicLayout>
      <section className="bg-[#141312] py-16 text-white md:py-24">
        <div className="mx-auto max-w-[1360px] px-4 md:px-8">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#e87c76]">Capabilities</p>
          <h1 className="mt-3 max-w-3xl font-display text-4xl font-bold md:text-5xl">
            Manufacturing that controls quality, cost and speed.
          </h1>
          <p className="mt-4 max-w-2xl text-base text-white/70">
            We produce locally in Nairobi so our consumer brands can respond quickly on formulation, pack sizes, and pricing without waiting on long import cycles.
          </p>
        </div>
      </section>
      <section className="mx-auto grid max-w-[1360px] gap-6 px-4 py-16 md:grid-cols-2 md:px-8">
        {[
          { title: 'Formulation & R&D', desc: 'Product development for home care, personal care, and pet care tuned for Kenyan water conditions, climate, and everyday routines.' },
          { title: 'Production & Filling', desc: 'Batch production, automated filling, capping, and labelling across consumer retail bottles and wholesale trade formats.' },
          { title: 'Quality Control', desc: 'Batch-level inspections, stability verification, and adherence to Kenyan standards for consumer goods.' },
          { title: 'Private Label Manufacturing', desc: 'Contract manufacturing and filling for supermarkets, institutional buyers, and regional partner brands with recurring volume.' },
        ].map((item) => (
          <div key={item.title} className="rounded-2xl border border-stone-200 bg-white p-7">
            <h2 className="font-display text-xl font-bold text-stone-900">{item.title}</h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">{item.desc}</p>
          </div>
        ))}
        <div className="rounded-2xl bg-[#141312] p-8 text-white md:col-span-2 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h3 className="font-display text-2xl font-bold">Need a product manufactured or packed under private label?</h3>
            <p className="mt-1 text-xs text-white/70">Send specifications and target volumes directly to Rekker Commercial &amp; Manufacturing Desk.</p>
          </div>
          <button onClick={() => setQuoteOpen(true)} className="btn btn-primary shrink-0">Request Manufacturing Quote</button>
        </div>
      </section>
      {quoteOpen && <QuoteModal initialProduct={{ name: 'Private Label / Contract Manufacturing' }} onClose={() => setQuoteOpen(false)} />}
    </PublicLayout>
  );
}

export function DistributionPage() {
  useSeoMeta(
    'Distribution Network | Rekker Limited Kenya',
    'Nationwide FMCG distribution across modern trade, general trade, wholesalers, salons, and regional county distributors.',
    '/distribution',
  );
  return (
    <PublicLayout>
      <section className="bg-[#141312] py-16 text-white md:py-24">
        <div className="mx-auto max-w-[1360px] px-4 md:px-8">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#e87c76]">Nationwide Trade Network</p>
          <h1 className="mt-3 max-w-3xl font-display text-4xl font-bold md:text-5xl">
            Nationwide reach, channel by channel.
          </h1>
          <p className="mt-4 max-w-2xl text-base text-white/70">
            Distribution is where brands are won. Rekker supplies everyday consumer goods from Nairobi into every retail channel Kenyan households shop.
          </p>
        </div>
      </section>
      <section className="mx-auto max-w-[1360px] px-4 py-16 md:px-8">
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {[
            { title: 'Modern & General Trade', desc: 'Supermarkets, minimarkets, dukas, pharmacies, salons, and independent stockists.' },
            { title: 'Wholesale Supply', desc: 'Volume supply to wholesalers and sub-distributors with structured MOQs and trade terms.' },
            { title: 'Regional Distributors', desc: 'County-level territory partnerships covering warehousing, activation, and last-mile resupply.' },
            { title: 'Direct Dispatch', desc: 'Central Nairobi order-to-delivery dispatch targeting 24-hour turnaround on stocked lines.' },
          ].map((c) => (
            <div key={c.title} className="rounded-2xl border border-stone-200 bg-white p-6">
              <Truck size={20} className="text-[#C71D1D]" />
              <h2 className="mt-4 font-display text-lg font-bold text-stone-900">{c.title}</h2>
              <p className="mt-2 text-xs leading-5 text-stone-600">{c.desc}</p>
            </div>
          ))}
        </div>
        <div className="mt-10 rounded-2xl border border-stone-200 bg-white p-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h3 className="font-display text-2xl font-bold text-stone-900">Territory partnerships are open across Kenya</h3>
            <p className="mt-1 text-sm text-stone-600">Already an approved partner? Log in to place MOQ wholesale orders directly in the Distributor Portal.</p>
          </div>
          <div className="flex gap-3">
            <Link href="/partnerships" className="btn btn-primary text-xs">Apply to Distribute</Link>
            <Link href="/distributor" className="btn btn-secondary text-xs">Distributor Portal</Link>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}

/* ============================================================================
 * 5. PARTNERSHIPS & DISTRIBUTOR APPLICATION (/partnerships) — PHASE 5.1
 * ==========================================================================*/
export function PartnershipsPage() {
  useSeoMeta(
    'Partnerships | Stock, Distribute or Manufacture with Rekker',
    'Apply online to stock Saffron Milan, Bio Saff, Cornells, and PetCare or become an authorized regional distributor.',
    '/partnerships',
  );
  const [businessName, setBusinessName] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [businessType, setBusinessType] = useState('stockist');
  const [distributionArea, setDistributionArea] = useState('');
  const [outletsServed, setOutletsServed] = useState('');
  const [interests, setInterests] = useState<string[]>(['Saffron Milan', 'Bio Saff']);
  const [submitting, setSubmitting] = useState(false);
  const [submittedRef, setSubmittedRef] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggleInterest = (brand: string) => {
    setInterests((prev) => (prev.includes(brand) ? prev.filter((x) => x !== brand) : [...prev, brand]));
  };

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiPost('/api/public/distributors/apply', {
        businessName,
        registrationNumber,
        contactName,
        email,
        phone,
        businessType,
        distributionArea,
        outletsServed: outletsServed ? Number(outletsServed) : null,
        productInterests: interests,
      });
      setSubmittedRef(res.referenceCode);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit partner application.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PublicLayout>
      <section className="bg-[#141312] py-16 text-white">
        <div className="mx-auto max-w-[1360px] px-4 md:px-8">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#e87c76]">Work With Us</p>
          <h1 className="mt-2 font-display text-4xl font-bold md:text-5xl">Four ways to grow with Rekker.</h1>
          <p className="mt-3 max-w-2xl text-sm text-white/70">
            Retailers &amp; stockists, regional distributors, private label clients, and brand partners — submit your onboarding profile directly into Rekker’s Partner Review Pipeline.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-[1360px] px-4 py-12 md:px-8">
        <div className="grid gap-8 lg:grid-cols-[1fr_1.4fr]">
          <div className="space-y-4">
            {[
              { title: 'Retailers & Stockists', desc: 'Stock Saffron Milan, Bio Saff, Cornells & PetCare with trade pricing and reliable resupply.' },
              { title: 'Regional Distributors', desc: 'Cover defined Kenyan territories with wholesale volume pricing, POS support, and priority launch stock.' },
              { title: 'Private Label Clients', desc: 'Leverage Nairobi formulation & filling infrastructure for your branded home or personal care range.' },
              { title: 'Brand Partnerships', desc: 'Distribute aligned FMCG lines nationwide and reach consumers on shop.rekker.co.ke.' },
            ].map((p) => (
              <div key={p.title} className="rounded-xl border border-stone-200 bg-white p-5">
                <h3 className="font-display text-base font-bold text-stone-900">{p.title}</h3>
                <p className="mt-1 text-xs leading-5 text-stone-600">{p.desc}</p>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-stone-200 bg-white p-6 md:p-8">
            {submittedRef ? (
              <div className="py-8 text-center" data-testid="distributor-application-confirmation">
                <CheckCircle2 size={36} className="mx-auto text-emerald-600" />
                <h2 className="mt-3 font-display text-2xl font-bold text-stone-900">Partner Application Submitted</h2>
                <p className="mt-2 text-sm text-stone-600">Our Commercial &amp; Territory team reviews applications within 1–2 working days.</p>
                <div className="mt-4 inline-block rounded-lg border border-stone-200 bg-stone-50 px-4 py-2 font-mono text-sm font-bold text-[#C71D1D]">
                  Application Ref: {submittedRef}
                </div>
                <div className="mt-6">
                  <Link href="/distributor" className="btn btn-primary text-xs">Open Distributor Portal</Link>
                </div>
              </div>
            ) : (
              <form onSubmit={handleApply} className="grid gap-4 sm:grid-cols-2" data-testid="form-distributor-apply">
                <h2 className="font-display text-xl font-bold text-stone-900 sm:col-span-2">Apply to Stock or Distribute</h2>
                <label className="text-xs">
                  <span className="font-semibold text-stone-700">Registered Business Name *</span>
                  <input required value={businessName} onChange={(e) => setBusinessName(e.target.value)} className="field mt-1" placeholder="Rift Valley Traders Ltd" />
                </label>
                <label className="text-xs">
                  <span className="font-semibold text-stone-700">Business Reg / Certificate No.</span>
                  <input value={registrationNumber} onChange={(e) => setRegistrationNumber(e.target.value)} className="field mt-1" placeholder="PVT-XXXX" />
                </label>
                <label className="text-xs">
                  <span className="font-semibold text-stone-700">Primary Contact Person *</span>
                  <input required value={contactName} onChange={(e) => setContactName(e.target.value)} className="field mt-1" />
                </label>
                <label className="text-xs">
                  <span className="font-semibold text-stone-700">Partner Category *</span>
                  <select value={businessType} onChange={(e) => setBusinessType(e.target.value)} className="field mt-1">
                    <option value="stockist">Stockist / Retailer</option>
                    <option value="wholesaler">Wholesale Business</option>
                    <option value="regional_distributor">Regional Distributor</option>
                    <option value="private_label">Private Label Client</option>
                    <option value="brand_partner">Brand Partner</option>
                  </select>
                </label>
                <label className="text-xs">
                  <span className="font-semibold text-stone-700">Email *</span>
                  <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="field mt-1" />
                </label>
                <label className="text-xs">
                  <span className="font-semibold text-stone-700">Phone Number *</span>
                  <input required value={phone} onChange={(e) => setPhone(e.target.value)} className="field mt-1" placeholder="+254 7XX XXX XXX" />
                </label>
                <label className="text-xs">
                  <span className="font-semibold text-stone-700">Target County / Region *</span>
                  <input required value={distributionArea} onChange={(e) => setDistributionArea(e.target.value)} className="field mt-1" placeholder="e.g., Nakuru & South Rift" />
                </label>
                <label className="text-xs">
                  <span className="font-semibold text-stone-700">Active Outlets Served</span>
                  <input type="number" min={0} value={outletsServed} onChange={(e) => setOutletsServed(e.target.value)} className="field mt-1" placeholder="e.g., 45" />
                </label>
                <div className="text-xs sm:col-span-2">
                  <span className="font-semibold text-stone-700">Brands of Interest (MOQ 12 units/line)</span>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {['Saffron Milan', 'Bio Saff', 'Cornells', 'PetCare'].map((b) => (
                      <button
                        type="button"
                        key={b}
                        onClick={() => toggleInterest(b)}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                          interests.includes(b) ? 'border-[#C71D1D] bg-[#f9e9e6] text-[#C71D1D]' : 'border-stone-200 text-stone-600'
                        }`}
                      >
                        {b}
                      </button>
                    ))}
                  </div>
                </div>
                {error && <p className="text-xs font-semibold text-[#C71D1D] sm:col-span-2">{error}</p>}
                <button type="submit" disabled={submitting} className="btn btn-primary sm:col-span-2" data-testid="button-submit-partner-app">
                  {submitting ? 'Submitting Application…' : 'Submit Partner Application'}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}

/* ============================================================================
 * 6. CAREERS (/careers) — CONNECTED TO PEOPLEOS RECRUITMENT
 * ==========================================================================*/
export function CareersPage() {
  useSeoMeta(
    'Careers at Rekker | Join Our Manufacturing & Commercial Teams',
    'Open positions across Rekker Limited formulation, filling, distribution logistics, and commercial sales in Kenya.',
    '/careers',
  );
  const jobs = useQuery({
    queryKey: ['public-careers'],
    queryFn: () => apiGet('/api/public/careers'),
  });
  const items: any[] = jobs.data?.items ?? [];

  return (
    <PublicLayout>
      <section className="bg-[#141312] py-16 text-white">
        <div className="mx-auto max-w-[1360px] px-4 md:px-8">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#e87c76]">Careers at Rekker</p>
          <h1 className="mt-2 font-display text-4xl font-bold md:text-5xl">Build Everyday Brands Across Kenya</h1>
          <p className="mt-3 max-w-2xl text-sm text-white/70">
            Live openings synchronized with Rekker PeopleOS Recruitment. Internal candidate records and payroll bands remain private to HR.
          </p>
        </div>
      </section>
      <section className="mx-auto max-w-[1360px] px-4 py-12 md:px-8">
        <div className="grid gap-4">
          {items.map((job) => (
            <div key={job.id} className="flex flex-col justify-between gap-4 rounded-2xl border border-stone-200 bg-white p-6 md:flex-row md:items-center">
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
                Apply via Commercial HR <ArrowRight size={14} />
              </a>
            </div>
          ))}
        </div>
      </section>
    </PublicLayout>
  );
}

/* ============================================================================
 * 7. CONTACT (/contact) & LEGAL (/privacy, /terms)
 * ==========================================================================*/
export function ContactPage() {
  useSeoMeta(
    'Contact Rekker | Trade, Distribution & Manufacturing Enquiries',
    'Get in touch with Rekker Limited in Nairobi for stocking, distribution, private label manufacturing, and brand partnerships.',
    '/contact',
  );
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [interest, setInterest] = useState('Stockist & Retail Trade');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiPost('/api/public/contact', { name, company, email, phone, interest, message });
      setConfirmation(res.referenceCode);
      setMessage('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send enquiry.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PublicLayout>
      <section className="bg-[#141312] py-16 text-white">
        <div className="mx-auto max-w-[1360px] px-4 md:px-8">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#e87c76]">Contact</p>
          <h1 className="mt-2 font-display text-4xl font-bold md:text-5xl">Talk to Rekker’s Commercial Team</h1>
          <p className="mt-3 max-w-2xl text-sm text-white/70">Our Nairobi commercial desk responds to trade enquiries within one business day.</p>
        </div>
      </section>

      <section className="mx-auto grid max-w-[1360px] gap-8 px-4 py-12 lg:grid-cols-[1fr_1.5fr] md:px-8">
        <div className="space-y-4">
          <div className="rounded-2xl border border-stone-200 bg-white p-6 space-y-4 text-sm">
            <div className="flex items-start gap-3">
              <MapPin size={18} className="mt-0.5 text-[#C71D1D]" />
              <div><p className="font-bold text-stone-900">Head Office &amp; Operations</p><p className="text-xs text-stone-600">Nairobi, Kenya</p></div>
            </div>
            <div className="flex items-start gap-3">
              <Mail size={18} className="mt-0.5 text-[#C71D1D]" />
              <div><p className="font-bold text-stone-900">Trade &amp; Commercial Desk</p><p className="text-xs text-stone-600">info@rekker.co.ke</p></div>
            </div>
            <div className="flex items-start gap-3">
              <ShoppingBag size={18} className="mt-0.5 text-[#C71D1D]" />
              <div><p className="font-bold text-stone-900">Consumer Store</p><a href="https://shop.rekker.co.ke" target="_blank" rel="noreferrer" className="text-xs font-semibold text-[#C71D1D] hover:underline">shop.rekker.co.ke</a></div>
            </div>
          </div>
          <div className="rounded-xl border border-stone-200 bg-stone-100 p-5 text-xs leading-5 text-stone-600">
            Looking to buy single items as a retail shopper? Visit <a href="https://shop.rekker.co.ke" target="_blank" rel="noreferrer" className="font-bold text-[#C71D1D]">shop.rekker.co.ke</a> for M-Pesa checkout and nationwide delivery.
          </div>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-6 md:p-8">
          {confirmation ? (
            <div className="py-6 text-center" data-testid="contact-confirmation">
              <CheckCircle2 size={36} className="mx-auto text-emerald-600" />
              <h2 className="mt-3 font-display text-2xl font-bold text-stone-900">Enquiry Received</h2>
              <p className="mt-2 text-sm text-stone-600">Logged directly in Rekker CRM (`{confirmation}`). A commercial representative will respond within 1 business day.</p>
              <button onClick={() => setConfirmation(null)} className="btn btn-secondary mt-5 text-xs">Send Another Enquiry</button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2" data-testid="form-public-contact">
              <label className="text-xs"><span className="font-semibold text-stone-700">Your Name *</span><input required value={name} onChange={(e) => setName(e.target.value)} className="field mt-1" /></label>
              <label className="text-xs"><span className="font-semibold text-stone-700">Company / Shop</span><input value={company} onChange={(e) => setCompany(e.target.value)} className="field mt-1" /></label>
              <label className="text-xs"><span className="font-semibold text-stone-700">Email *</span><input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="field mt-1" /></label>
              <label className="text-xs"><span className="font-semibold text-stone-700">Phone</span><input value={phone} onChange={(e) => setPhone(e.target.value)} className="field mt-1" /></label>
              <label className="text-xs sm:col-span-2">
                <span className="font-semibold text-stone-700">Enquiry Subject *</span>
                <select value={interest} onChange={(e) => setInterest(e.target.value)} className="field mt-1">
                  <option>Stockist &amp; Retail Trade</option>
                  <option>Regional Distribution Territory</option>
                  <option>Private Label / Contract Manufacturing</option>
                  <option>Brand Partnership</option>
                  <option>General Commercial Enquiry</option>
                </select>
              </label>
              <label className="text-xs sm:col-span-2">
                <span className="font-semibold text-stone-700">Message *</span>
                <textarea required minLength={10} value={message} onChange={(e) => setMessage(e.target.value)} className="field mt-1 min-h-28" placeholder="Tell us your town/county, products of interest, or manufacturing scope..." />
              </label>
              {error && <p className="text-xs font-semibold text-[#C71D1D] sm:col-span-2">{error}</p>}
              <button type="submit" disabled={submitting} className="btn btn-primary sm:col-span-2" data-testid="button-submit-contact">
                {submitting ? 'Sending…' : 'Send Enquiry'}
              </button>
            </form>
          )}
        </div>
      </section>
    </PublicLayout>
  );
}

export function LegalPage({ mode }: { mode: 'privacy' | 'terms' }) {
  useSeoMeta(
    mode === 'privacy' ? 'ODPC Privacy Policy | Rekker Limited' : 'Terms of Service | Rekker Limited',
    'Rekker Limited data privacy (Kenya Data Protection Act 2019) and commercial terms.',
    mode === 'privacy' ? '/privacy' : '/terms',
  );
  return (
    <PublicLayout>
      <section className="mx-auto max-w-4xl px-4 py-14 md:px-8">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#C71D1D]">Legal &amp; Governance</p>
        <h1 className="mt-2 font-display text-3xl font-bold text-stone-900">
          {mode === 'privacy' ? 'Privacy Policy (Kenya Data Protection Act 2019)' : 'Commercial Terms of Service'}
        </h1>
        <div className="mt-6 space-y-4 rounded-2xl border border-stone-200 bg-white p-7 text-sm leading-7 text-stone-600">
          {mode === 'privacy' ? (
            <>
              <p>Rekker Limited processes business contact, quotation, distributor application, and employee records strictly in compliance with the Kenya Data Protection Act 2019 (ODPC guidelines).</p>
              <p>Public website submissions are transmitted into Rekker CRM solely to respond to commercial inquiries and quotation requests. Customer Portal and Distributor Portal records are isolated per authenticated account (`organization_id` and `user_id` ownership checks) and never shared with competing businesses.</p>
              <p>For data access or erasure requests, contact <a href="mailto:info@rekker.co.ke" className="font-bold text-[#C71D1D]">info@rekker.co.ke</a>.</p>
            </>
          ) : (
            <>
              <p>Trade quotations, distributor territory allocations, and wholesale purchase orders submitted via Rekker Digital Ecosystem are subject to formal commercial review, verified MOQ schedules, and written acceptance by Rekker Limited.</p>
              <p>Direct-to-consumer retail orders with M-Pesa checkout are governed by <a href="https://shop.rekker.co.ke" target="_blank" rel="noreferrer" className="font-bold text-[#C71D1D]">shop.rekker.co.ke</a>.</p>
            </>
          )}
        </div>
      </section>
    </PublicLayout>
  );
}
