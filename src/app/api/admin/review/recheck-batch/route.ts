/**
 * POST /api/admin/review/recheck-batch
 *
 * Re-checks a batch of status="review" claims with grounding (now with article
 * context), so the admin can drain the human-review queue without going one by
 * one. The client (RecheckAllReviewButton) calls this repeatedly with a
 * `before` timestamp captured once at the start of the run.
 *
 * Each processed claim has its verifiedAt stamped to "now" (recheckClaimById
 * does this on success; we do it on failure too), so it falls out of the
 * "not yet checked this run" filter and is never re-checked twice in the same
 * drain — which also guarantees the loop terminates. Confidently-verified
 * claims publish and leave the queue; inconclusive ones stay in review for
 * manual triage.
 *
 * Cost: each claim is a grounded fact-check (~$0.05). A full 70-claim drain is
 * ~$3-4. Admin-triggered only.
 *
 * Auth: cookie-based admin session.
 */
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { isAdmin } from "@/lib/admin-auth";
import { recheckClaimById } from "@/lib/recheck";

export const maxDuration = 300;

const BATCH = 6; // claims per request
const CONCURRENCY = 3; // grounded checks in flight at once

export async function POST(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { before?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  // Claims re-checked at/after this instant are "already done this run".
  const before = body.before ? new Date(body.before) : new Date();
  const where: Prisma.ClaimWhereInput = {
    status: "review",
    OR: [{ verifiedAt: null }, { verifiedAt: { lt: before } }],
  };

  const claims = await prisma.claim.findMany({
    where,
    orderBy: { verifiedAt: "asc" },
    take: BATCH,
    select: { id: true },
  });

  let corrected = 0;
  let confirmed = 0;
  let withheld = 0;
  let failed = 0;

  for (let i = 0; i < claims.length; i += CONCURRENCY) {
    const chunk = claims.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(
      chunk.map((c) => recheckClaimById(c.id)),
    );
    for (let j = 0; j < settled.length; j++) {
      const s = settled[j];
      if (s.status === "fulfilled") {
        if (s.value.outcome === "corrected") corrected++;
        else if (s.value.outcome === "confirmed") confirmed++;
        else withheld++;
      } else {
        failed++;
        console.error(
          "[recheck-batch] failed:",
          s.reason instanceof Error ? s.reason.message : s.reason,
        );
        // Stamp verifiedAt so a persistently-failing claim doesn't loop
        // forever and block the drain from finishing.
        await prisma.claim
          .update({ where: { id: chunk[j].id }, data: { verifiedAt: new Date() } })
          .catch(() => {});
      }
    }
  }

  const remaining = await prisma.claim.count({ where });

  revalidatePath("/admin/review");
  revalidatePath("/admin/claims");
  revalidatePath("/admin/status");
  revalidatePath("/corrections");
  revalidatePath("/");

  return NextResponse.json({
    processed: claims.length,
    corrected,
    confirmed,
    withheld,
    failed,
    remaining,
  });
}
