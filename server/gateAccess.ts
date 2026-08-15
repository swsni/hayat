type GateAccessDecision = {
  allowed: boolean;
  status: "GRANTED" | "DENIED";
  reason: string;
  customerId: string;
  customerName: string;
  membershipType?: "staff" | "family" | "member" | "blocked";
};

function parseGateEndDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    parsed.setHours(23, 59, 59, 999);
  }

  return parsed;
}

export async function evaluateGateAccess(
  db: any,
  customerId: string,
  customerData: any,
  branch: string,
  qrPayload?: string,
): Promise<GateAccessDecision> {
  const customerName = customerData?.name || "Unknown";

  if (customerData?.isBlocked) {
    return {
      allowed: false,
      status: "DENIED",
      reason: `Blocked account. Reason: ${customerData.blockedReason || "None"}`,
      customerId,
      customerName,
      membershipType: "blocked",
    };
  }

  if (customerData?.gymAccess === "staff" || customerData?.gymAccess === "family") {
    return {
      allowed: true,
      status: "GRANTED",
      reason: `Bypass: ${customerData.gymAccess.toUpperCase()}`,
      customerId,
      customerName,
      membershipType: customerData.gymAccess,
    };
  }

  const packagesSnap = await db.collection("customerPackages")
    .where("customerId", "==", customerId)
    .where("category", "==", "gym")
    .where("isActive", "==", true)
    .get();

  if (packagesSnap.empty) {
    return {
      allowed: false,
      status: "DENIED",
      reason: "No active gym membership",
      customerId,
      customerName,
      membershipType: "member",
    };
  }

  const now = new Date();
  let hasValidAccess = false;
  let isFrozen = false;

  for (const doc of packagesSnap.docs) {
    const pkg = doc.data();
    if (pkg?.isFrozen && pkg?.frozenUntil) {
      const frozenUntil = new Date(pkg.frozenUntil);
      if (!Number.isNaN(frozenUntil.getTime()) && frozenUntil > now) {
        isFrozen = true;
        continue;
      }
    }

    const endDate = parseGateEndDate(pkg?.endDate);
    if (endDate && endDate < now) {
      continue;
    }

    hasValidAccess = true;
    break;
  }

  if (!hasValidAccess) {
    const reason = isFrozen ? "Gym membership is currently frozen" : "Subscription is expired or no active gym membership";
    return {
      allowed: false,
      status: "DENIED",
      reason,
      customerId,
      customerName,
      membershipType: "member",
    };
  }

  return {
    allowed: true,
    status: "GRANTED",
    reason: "Active Membership",
    customerId,
    customerName,
    membershipType: "member",
  };
}

export function buildGateResponsePayload(decision: GateAccessDecision, successMessage: string, deniedMessage: string) {
  return {
    success: decision.allowed,
    access: decision.allowed ? 1 : 0,
    message: decision.allowed ? successMessage : deniedMessage,
    customerId: decision.customerId,
    customerName: decision.customerName,
    reason: decision.reason,
  };
}
