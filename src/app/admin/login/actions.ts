"use server";

import { redirect } from "next/navigation";
import { setAdminCookie, clearAdminCookie } from "@/lib/admin-auth";

/**
 * Validates the submitted secret and sets the admin cookie. Always
 * redirects: success → /admin/status, failure → /admin/login?error=1.
 *
 * We don't return a typed result because the form is server-rendered
 * (no client-side useFormState). The error param drives the inline
 * error message on /admin/login.
 */
export async function loginAction(formData: FormData): Promise<void> {
  const secret = formData.get("secret");
  if (typeof secret !== "string" || !secret.trim()) {
    redirect("/admin/login?error=empty");
  }
  if (secret !== process.env.ADMIN_SECRET) {
    redirect("/admin/login?error=bad");
  }
  await setAdminCookie();
  redirect("/admin/status");
}

export async function logoutAction(): Promise<void> {
  await clearAdminCookie();
  redirect("/admin/login");
}
