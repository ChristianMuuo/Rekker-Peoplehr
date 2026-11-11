import crypto from "node:crypto";
import { maskPhoneNumber } from "./security";

export interface MpesaDisbursementRequest {
  employeeId: string;
  employeeName: string;
  phone: string;
  amountKes: number;
  period: string;
}

export interface MpesaDisbursementResult {
  employeeId: string;
  employeeName: string;
  recipientMasked: string;
  amountKes: number;
  channel: "mpesa_b2c";
  providerMode: "LIVE_DARAJA" | "SANDBOX_SIMULATION";
  transactionReference: string;
  status: "queued" | "disbursed" | "failed";
  message: string;
}

function normalizeKenyanMsisdn(phone: string): string {
  const digits = phone.replace(/[^\d]/g, "");
  if (digits.startsWith("254") && digits.length >= 12) return digits.slice(0, 12);
  if (digits.startsWith("0") && digits.length >= 10) return `254${digits.slice(1, 10)}`;
  if (digits.startsWith("7") || digits.startsWith("1")) return `254${digits.slice(0, 9)}`;
  return digits;
}

export function isMpesaLiveConfigured(): boolean {
  return Boolean(
    process.env.MPESA_CONSUMER_KEY &&
      process.env.MPESA_CONSUMER_SECRET &&
      process.env.MPESA_SHORTCODE &&
      process.env.MPESA_SECURITY_CREDENTIAL &&
      process.env.MPESA_INITIATOR_NAME,
  );
}

async function getDarajaAccessToken(): Promise<string> {
  const baseUrl =
    process.env.MPESA_ENV === "production"
      ? "https://api.safaricom.co.ke"
      : "https://sandbox.safaricom.co.ke";
  const creds = Buffer.from(
    `${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`,
  ).toString("base64");

  const res = await fetch(
    `${baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
    {
      headers: { Authorization: `Basic ${creds}` },
    },
  );
  if (!res.ok) {
    throw new Error(`Daraja OAuth failed with HTTP ${res.status}`);
  }
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) {
    throw new Error("Daraja OAuth did not return access_token");
  }
  return data.access_token;
}

export async function initiateMpesaSalaryPayout(
  item: MpesaDisbursementRequest,
): Promise<MpesaDisbursementResult> {
  const msisdn = normalizeKenyanMsisdn(item.phone);
  const masked = maskPhoneNumber(msisdn) || "2547****000";

  if (!msisdn || msisdn.length < 12) {
    return {
      employeeId: item.employeeId,
      employeeName: item.employeeName,
      recipientMasked: masked,
      amountKes: Math.round(item.amountKes),
      channel: "mpesa_b2c",
      providerMode: isMpesaLiveConfigured()
        ? "LIVE_DARAJA"
        : "SANDBOX_SIMULATION",
      transactionReference: `REJ-${Date.now()}`,
      status: "failed",
      message: "Invalid Kenyan MSISDN phone number for M-Pesa B2C payout.",
    };
  }

  if (!isMpesaLiveConfigured()) {
    return {
      employeeId: item.employeeId,
      employeeName: item.employeeName,
      recipientMasked: masked,
      amountKes: Math.round(item.amountKes),
      channel: "mpesa_b2c",
      providerMode: "SANDBOX_SIMULATION",
      transactionReference: `SIM-MPESA-${crypto.randomBytes(4).toString("hex").toUpperCase()}`,
      status: "disbursed",
      message:
        "Simulated M-Pesa B2C disbursement recorded (MPESA_* Daraja secrets not configured; no real funds moved).",
    };
  }

  try {
    const token = await getDarajaAccessToken();
    const baseUrl =
      process.env.MPESA_ENV === "production"
        ? "https://api.safaricom.co.ke"
        : "https://sandbox.safaricom.co.ke";

    const response = await fetch(`${baseUrl}/mpesa/b2c/v3/paymentrequest`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        OriginatorConversationID: `REKKER-${crypto.randomUUID()}`,
        InitiatorName: process.env.MPESA_INITIATOR_NAME,
        SecurityCredential: process.env.MPESA_SECURITY_CREDENTIAL,
        CommandID: "SalaryPayment",
        Amount: Math.round(item.amountKes),
        PartyA: process.env.MPESA_SHORTCODE,
        PartyB: msisdn,
        Remarks: `Rekker PeopleOS Salary - ${item.period}`,
        QueueTimeOutURL:
          process.env.MPESA_TIMEOUT_URL ||
          "https://rekker.co.ke/api/mpesa/timeout",
        ResultURL:
          process.env.MPESA_RESULT_URL ||
          "https://rekker.co.ke/api/mpesa/result",
        Occasion: item.period,
      }),
    });

    const data = (await response.json()) as {
      ConversationID?: string;
      OriginatorConversationID?: string;
      ResponseDescription?: string;
    };

    if (!response.ok) {
      return {
        employeeId: item.employeeId,
        employeeName: item.employeeName,
        recipientMasked: masked,
        amountKes: Math.round(item.amountKes),
        channel: "mpesa_b2c",
        providerMode: "LIVE_DARAJA",
        transactionReference: `ERR-${Date.now()}`,
        status: "failed",
        message: data.ResponseDescription || `Daraja HTTP ${response.status}`,
      };
    }

    return {
      employeeId: item.employeeId,
      employeeName: item.employeeName,
      recipientMasked: masked,
      amountKes: Math.round(item.amountKes),
      channel: "mpesa_b2c",
      providerMode: "LIVE_DARAJA",
      transactionReference:
        data.ConversationID || data.OriginatorConversationID || `DAR-${Date.now()}`,
      status: "queued",
      message:
        data.ResponseDescription ||
        "Submitted to Safaricom Daraja B2C payment queue.",
    };
  } catch (err) {
    return {
      employeeId: item.employeeId,
      employeeName: item.employeeName,
      recipientMasked: masked,
      amountKes: Math.round(item.amountKes),
      channel: "mpesa_b2c",
      providerMode: "LIVE_DARAJA",
      transactionReference: `ERR-${Date.now()}`,
      status: "failed",
      message: err instanceof Error ? err.message : "Daraja network failure",
    };
  }
}
