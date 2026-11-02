/**
 * app/api/voice/registry/route.ts
 * GET — Returns the vendor registry (phone numbers redacted for client safety).
 * PATCH — Updates a vendor's preferred language (Kannada, Hindi, English).
 */

import { VENDOR_REGISTRY, updateVendorLanguage } from "@/lib/vendor-registry";

export async function GET() {
  const safe = VENDOR_REGISTRY.map(({ phone: _phone, ...v }) => ({
    ...v,
    phone: "***REDACTED***",
  }));
  return Response.json({ ok: true, vendors: safe });
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { vendorId, preferredLanguage } = body as {
      vendorId?: string;
      preferredLanguage?: "kn" | "hi";
    };

    if (!vendorId || !preferredLanguage || !["kn", "hi"].includes(preferredLanguage)) {
      return Response.json({ ok: false, error: "Invalid vendorId or language" }, { status: 400 });
    }

    const success = updateVendorLanguage(vendorId, preferredLanguage);
    if (!success) {
      return Response.json({ ok: false, error: "Vendor not found" }, { status: 404 });
    }

    const safe = VENDOR_REGISTRY.map(({ phone: _phone, ...v }) => ({
      ...v,
      phone: "***REDACTED***",
    }));

    return Response.json({ ok: true, vendors: safe });
  } catch {
    return Response.json({ ok: false, error: "Bad request" }, { status: 400 });
  }
}
