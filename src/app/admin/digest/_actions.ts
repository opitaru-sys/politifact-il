"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { digestSlug } from "@/lib/digest-helpers";

function assertAdmin(formData: FormData): string {
  const key = formData.get("key");
  const secret = process.env.ADMIN_SECRET;
  if (!secret) throw new Error("ADMIN_SECRET not configured");
  if (typeof key !== "string" || key !== secret) throw new Error("Unauthorized");
  return key;
}

export async function updateDigest(formData: FormData): Promise<void> {
  assertAdmin(formData);
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
  assertAdmin(formData);
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
  assertAdmin(formData);
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
  assertAdmin(formData);
  const id = formData.get("id");
  if (typeof id !== "string" || !id) throw new Error("Missing digest id");

  await prisma.digest.delete({ where: { id } });
  revalidatePath("/admin/digest");
  revalidatePath("/digest");
}
