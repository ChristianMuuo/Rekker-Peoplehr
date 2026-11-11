import crypto from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db, statutoryConfigsTable } from "@workspace/db";

export interface PayeTaxBand {
  label: string;
  limitKes: number | null; // null = infinity (top band)
  rate: number; // e.g., 0.10 for 10%
}

export interface StatutoryRuleConfig {
  id: string;
  organizationId: string;
  name: string;
  effectiveFrom: string; // YYYY-MM-DD
  effectiveTo?: string | null;
  isActive: boolean;
  nssf: {
    rate: number; // 0.06
    tier1UpperLimitKes: number; // e.g. 8000 (Phase 3) or 9000 (Phase 4)
    tier2UpperLimitKes: number; // e.g. 72000 (Phase 3) or 108000 (Phase 4)
    employerMatch: boolean;
  };
  shif: {
    rate: number; // 0.0275
    minimumKes: number; // 300
    deductibleFromTaxablePay: boolean;
    insuranceReliefRate: number; // e.g. 0.15 if not deductible
    insuranceReliefMaxKes: number; // e.g. 5000
  };
  housingLevy: {
    employeeRate: number; // 0.015
    employerRate: number; // 0.015
    deductibleFromTaxablePay: boolean;
  };
  paye: {
    personalReliefKes: number; // 2400
    bands: PayeTaxBand[];
  };
}

export interface PayrollCalculationResult {
  configId: string;
  configName: string;
  effectiveFrom: string;
  grossPay: number;
  nssfTier1: number;
  nssfTier2: number;
  totalNssf: number;
  employerNssf: number;
  sha: number;
  housingLevy: number;
  employerHousingLevy: number;
  taxablePay: number;
  payeBeforeRelief: number;
  personalRelief: number;
  insuranceRelief: number;
  netPaye: number;
  totalDeductions: number;
  netPay: number;
  bandBreakdown: { label: string; taxableSlice: number; rate: number; tax: number }[];
}

export function createDefaultStatutoryConfigs(
  organizationId: string,
): StatutoryRuleConfig[] {
  return [
    {
      id: `stat-ke-2025-02-${organizationId}`,
      organizationId,
      name: "Kenya Statutory Schedule 2025/2026 (NSSF Phase 3 + SHIF + AHL)",
      effectiveFrom: "2025-02-01",
      effectiveTo: null,
      isActive: true,
      nssf: {
        rate: 0.06,
        tier1UpperLimitKes: 8000,
        tier2UpperLimitKes: 72000,
        employerMatch: true,
      },
      shif: {
        rate: 0.0275,
        minimumKes: 300,
        deductibleFromTaxablePay: false,
        insuranceReliefRate: 0.15,
        insuranceReliefMaxKes: 5000,
      },
      housingLevy: {
        employeeRate: 0.015,
        employerRate: 0.015,
        deductibleFromTaxablePay: false,
      },
      paye: {
        personalReliefKes: 2400,
        bands: [
          { label: "First KES 24,000", limitKes: 24000, rate: 0.1 },
          { label: "Next KES 8,333", limitKes: 8333, rate: 0.25 },
          { label: "Next KES 467,667", limitKes: 467667, rate: 0.3 },
          { label: "Next KES 300,000", limitKes: 300000, rate: 0.325 },
          { label: "Above KES 800,000", limitKes: null, rate: 0.35 },
        ],
      },
    },
    {
      id: `stat-ke-2026-phase4-${organizationId}`,
      organizationId,
      name: "Kenya Statutory Schedule (NSSF Phase 4 Draft + Tax-Allowable SHIF/AHL)",
      effectiveFrom: "2026-02-01",
      effectiveTo: null,
      isActive: false,
      nssf: {
        rate: 0.06,
        tier1UpperLimitKes: 9000,
        tier2UpperLimitKes: 108000,
        employerMatch: true,
      },
      shif: {
        rate: 0.0275,
        minimumKes: 300,
        deductibleFromTaxablePay: true,
        insuranceReliefRate: 0,
        insuranceReliefMaxKes: 0,
      },
      housingLevy: {
        employeeRate: 0.015,
        employerRate: 0.015,
        deductibleFromTaxablePay: true,
      },
      paye: {
        personalReliefKes: 2400,
        bands: [
          { label: "First KES 24,000", limitKes: 24000, rate: 0.1 },
          { label: "Next KES 8,333", limitKes: 8333, rate: 0.25 },
          { label: "Next KES 467,667", limitKes: 467667, rate: 0.3 },
          { label: "Next KES 300,000", limitKes: 300000, rate: 0.325 },
          { label: "Above KES 800,000", limitKes: null, rate: 0.35 },
        ],
      },
    },
  ];
}

const IN_MEMORY_CONFIG_STORE = new Map<string, StatutoryRuleConfig[]>();

export async function listStatutoryConfigs(
  organizationId: string,
): Promise<StatutoryRuleConfig[]> {
  if (!process.env.DATABASE_URL) {
    if (!IN_MEMORY_CONFIG_STORE.has(organizationId)) {
      IN_MEMORY_CONFIG_STORE.set(
        organizationId,
        createDefaultStatutoryConfigs(organizationId),
      );
    }
    return IN_MEMORY_CONFIG_STORE.get(organizationId)!;
  }

  try {
    const rows = await db
      .select()
      .from(statutoryConfigsTable)
      .where(eq(statutoryConfigsTable.organizationId, organizationId))
      .orderBy(desc(statutoryConfigsTable.effectiveFrom));

    if (!rows.length) {
      const defaults = createDefaultStatutoryConfigs(organizationId);
      for (const cfg of defaults) {
        await db.insert(statutoryConfigsTable).values({
          organizationId,
          name: cfg.name,
          effectiveFrom: cfg.effectiveFrom,
          effectiveTo: cfg.effectiveTo ?? null,
          configJson: JSON.stringify(cfg),
          isActive: cfg.isActive,
        });
      }
      return defaults;
    }

    return rows.map((r) => {
      const parsed = JSON.parse(r.configJson) as StatutoryRuleConfig;
      return {
        ...parsed,
        id: r.id,
        organizationId: r.organizationId,
        name: r.name,
        effectiveFrom: r.effectiveFrom,
        effectiveTo: r.effectiveTo,
        isActive: r.isActive,
      };
    });
  } catch {
    return createDefaultStatutoryConfigs(organizationId);
  }
}

export async function getActiveStatutoryConfig(
  organizationId: string,
  asOfDate?: string,
): Promise<StatutoryRuleConfig> {
  const configs = await listStatutoryConfigs(organizationId);
  const active = configs.find((c) => c.isActive && (!asOfDate || c.effectiveFrom <= asOfDate));
  return active ?? configs.find((c) => c.isActive) ?? configs[0]!;
}

export async function saveStatutoryConfig(params: {
  organizationId: string;
  userId: string;
  name: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  activate?: boolean;
  nssf: StatutoryRuleConfig["nssf"];
  shif: StatutoryRuleConfig["shif"];
  housingLevy: StatutoryRuleConfig["housingLevy"];
  paye: StatutoryRuleConfig["paye"];
}): Promise<StatutoryRuleConfig> {
  const newConfig: StatutoryRuleConfig = {
    id: crypto.randomUUID(),
    organizationId: params.organizationId,
    name: params.name,
    effectiveFrom: params.effectiveFrom,
    effectiveTo: params.effectiveTo ?? null,
    isActive: params.activate ?? true,
    nssf: params.nssf,
    shif: params.shif,
    housingLevy: params.housingLevy,
    paye: params.paye,
  };

  if (!process.env.DATABASE_URL) {
    const current = await listStatutoryConfigs(params.organizationId);
    if (newConfig.isActive) {
      current.forEach((c) => {
        c.isActive = false;
      });
    }
    current.unshift(newConfig);
    IN_MEMORY_CONFIG_STORE.set(params.organizationId, current);
    return newConfig;
  }

  return db.transaction(async (tx) => {
    if (newConfig.isActive) {
      await tx
        .update(statutoryConfigsTable)
        .set({ isActive: false })
        .where(
          and(
            eq(statutoryConfigsTable.organizationId, params.organizationId),
            eq(statutoryConfigsTable.isActive, true),
          ),
        );
    }
    const [inserted] = await tx
      .insert(statutoryConfigsTable)
      .values({
        organizationId: params.organizationId,
        name: newConfig.name,
        effectiveFrom: newConfig.effectiveFrom,
        effectiveTo: newConfig.effectiveTo ?? null,
        configJson: JSON.stringify(newConfig),
        isActive: newConfig.isActive,
        createdByUserId: params.userId,
      })
      .returning();

    return {
      ...newConfig,
      id: inserted!.id,
    };
  });
}

export async function activateStatutoryConfig(
  organizationId: string,
  configId: string,
): Promise<StatutoryRuleConfig | null> {
  if (!process.env.DATABASE_URL) {
    const configs = await listStatutoryConfigs(organizationId);
    const target = configs.find((c) => c.id === configId);
    if (!target) return null;
    configs.forEach((c) => {
      c.isActive = c.id === configId;
    });
    return target;
  }

  return db.transaction(async (tx) => {
    const [target] = await tx
      .select()
      .from(statutoryConfigsTable)
      .where(
        and(
          eq(statutoryConfigsTable.id, configId),
          eq(statutoryConfigsTable.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!target) return null;

    await tx
      .update(statutoryConfigsTable)
      .set({ isActive: false })
      .where(eq(statutoryConfigsTable.organizationId, organizationId));

    const [updated] = await tx
      .update(statutoryConfigsTable)
      .set({ isActive: true })
      .where(eq(statutoryConfigsTable.id, configId))
      .returning();

    const parsed = JSON.parse(updated!.configJson) as StatutoryRuleConfig;
    return { ...parsed, id: updated!.id, isActive: true };
  });
}

/**
 * Pure deterministic statutory calculator driven strictly by an explicit StatutoryRuleConfig object.
 * Never hardcodes business rates; all rates originate from versioned database/org rulesets.
 */
export function calculateKenyaStatutoryWithConfig(
  grossSalary: number,
  allowances: number,
  overtime: number,
  config: StatutoryRuleConfig,
): PayrollCalculationResult {
  const safeGross = Math.max(0, Number(grossSalary) || 0);
  const safeAllowances = Math.max(0, Number(allowances) || 0);
  const safeOvertime = Math.max(0, Number(overtime) || 0);
  const totalGross = safeGross + safeAllowances + safeOvertime;

  // 1. NSSF Tier I & II from rule config
  const tier1Slice = Math.min(totalGross, config.nssf.tier1UpperLimitKes);
  const tier2Slice = Math.max(
    0,
    Math.min(totalGross, config.nssf.tier2UpperLimitKes) -
      config.nssf.tier1UpperLimitKes,
  );
  const nssfTier1 = Math.round(tier1Slice * config.nssf.rate);
  const nssfTier2 = Math.round(tier2Slice * config.nssf.rate);
  const totalNssf = nssfTier1 + nssfTier2;
  const employerNssf = config.nssf.employerMatch ? totalNssf : 0;

  // 2. SHIF / SHA from rule config
  const sha =
    totalGross > 0
      ? Math.max(
          config.shif.minimumKes,
          Math.round(totalGross * config.shif.rate),
        )
      : 0;

  // 3. Affordable Housing Levy from rule config
  const housingLevy = Math.round(totalGross * config.housingLevy.employeeRate);
  const employerHousingLevy = Math.round(
    totalGross * config.housingLevy.employerRate,
  );

  // 4. Taxable Pay according to rule config allowability flags
  let allowableTotal = totalNssf;
  if (config.shif.deductibleFromTaxablePay) allowableTotal += sha;
  if (config.housingLevy.deductibleFromTaxablePay) allowableTotal += housingLevy;
  const taxablePay = Math.max(0, totalGross - allowableTotal);

  // 5. Progressive PAYE bands from rule config
  let rem = taxablePay;
  let totalTax = 0;
  const bandBreakdown: PayrollCalculationResult["bandBreakdown"] = [];

  for (const band of config.paye.bands) {
    if (rem <= 0) break;
    const slice = band.limitKes === null ? rem : Math.min(rem, band.limitKes);
    const bandTax = slice * band.rate;
    totalTax += bandTax;
    rem -= slice;
    bandBreakdown.push({
      label: band.label,
      taxableSlice: Math.round(slice),
      rate: band.rate,
      tax: Math.round(bandTax),
    });
  }

  const payeBeforeRelief = Math.round(totalTax);
  const personalRelief = totalGross > 0 ? config.paye.personalReliefKes : 0;
  const insuranceRelief =
    config.shif.insuranceReliefRate > 0 && !config.shif.deductibleFromTaxablePay
      ? Math.min(
          Math.round(sha * config.shif.insuranceReliefRate),
          config.shif.insuranceReliefMaxKes,
        )
      : 0;

  const netPaye = Math.max(
    0,
    payeBeforeRelief - personalRelief - insuranceRelief,
  );
  const totalDeductions = totalNssf + sha + housingLevy + netPaye;
  const netPay = Math.max(0, Math.round(totalGross - totalDeductions));

  return {
    configId: config.id,
    configName: config.name,
    effectiveFrom: config.effectiveFrom,
    grossPay: Math.round(totalGross),
    nssfTier1,
    nssfTier2,
    totalNssf,
    employerNssf,
    sha,
    housingLevy,
    employerHousingLevy,
    taxablePay: Math.round(taxablePay),
    payeBeforeRelief,
    personalRelief,
    insuranceRelief,
    netPaye,
    totalDeductions,
    netPay,
    bandBreakdown,
  };
}

