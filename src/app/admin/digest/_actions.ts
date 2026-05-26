"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { digestSlug } from "@/lib/digest-helpers";
import { assertAdmin } from "@/lib/admin-auth";

// Auth: cookie-based, via assertAdmin() — set on /admin/login. The
// cookie travels with form submissions automatically; no more `?key=`
// or hidden form inputs. See 2026-05-26 security audit (HIGH).

export async function updateDigest(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = formData.get("id");
  if (typeof id !== "string" || !id) throw new Error("Missing digest id");

  const title = formData.get("title");
  const intro = formData.get("intro");
  const sectionsJson = formData.get("sectionsJson");

  if (typeof title !== "string" || !title.trim()) throw new Error("Title required");
  if (typeof intro !== "string" || !intro.trim()) throw new Error("Intro required");
  if (typeof sectionsJson !== "string") throw new Error("Sections required");

  let parsed: unknown;
  try {
    parsed = JSON.parse(sectionsJson);
  } catch (err) {
    throw new Error(`Invalid sections JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!Array.isArray(parsed)) throw new Error("Sections must be a JSON array");

  await prisma.digest.update({
    where: { id },
    data: {
      title: title.trim(),
      intro: intro.trim(),
      sections: parsed as object[],
    },
  });

  revalidatePath("/admin/digest");
  revalidatePath("/digest");
}

export async function publishDigest(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = formData.get("id");
  if (typeof id !== "string" || !id) throw new Error("Missing digest id");

  const digest = await prisma.digest.update({
    where: { id },
    data: { status: "published", publishedAt: new Date() },
  });

  revalidatePath("/admin/digest");
  revalidatePath("/digest");
  revalidatePath(`/digest/${digestSlug(digest.weekOf)}`);
  revalidatePath("/"); // home page link points here
}

export async function unpublishDigest(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = formData.get("id");
  if (typeof id !== "string" || !id) throw new Error("Missing digest id");

  const digest = await prisma.digest.update({
    where: { id },
    data: { status: "draft", publishedAt: null },
  });

  revalidatePath("/admin/digest");
  revalidatePath("/digest");
  revalidatePath(`/digest/${digestSlug(digest.weekOf)}`);
}

export async function deleteDigest(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = formData.get("id");
  if (typeof id !== "string" || !id) throw new Error("Missing digest id");

  await prisma.digest.delete({ where: { id } });
  revalidatePath("/admin/digest");
  revalidatePath("/digest");
}
