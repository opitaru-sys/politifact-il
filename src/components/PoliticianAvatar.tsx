"use client";

import { useState } from "react";

const SIZES = {
  sm: { px: 32, className: "w-8 h-8 text-sm" },
  md: { px: 40, className: "w-10 h-10 text-lg" },
  lg: { px: 80, className: "w-20 h-20 text-3xl" },
};

export function PoliticianAvatar({
  id,
  name,
  image,
  size = "md",
  priority = false,
}: {
  id: string;
  name: string;
  image?: string | null;
  size?: "sm" | "md" | "lg";
  /**
   * When true, the image loads eagerly and decodes synchronously. Use this
   * for above-the-fold avatars on hero / detail pages where a brief gray
   * placeholder is jarring. Default false (lazy) for feed lists where the
   * fallback initials are an acceptable starting state.
   */
  priority?: boolean;
}) {
  const { px, className } = SIZES[size];
  const [errored, setErrored] = useState(false);
  const initials = name.slice(0, 2);
  const src = image || `/politicians/${id}.jpg`;

  if (errored) {
    return (
      <div
        className={`${className} rounded-full bg-muted text-foreground-muted flex items-center justify-center font-bold shrink-0 border border-border`}
        aria-label={name}
      >
        {initials}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      width={px}
      height={px}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      decoding={priority ? "sync" : "async"}
      onError={() => setErrored(true)}
      className={`${className} rounded-full object-cover bg-muted shrink-0 border border-border`}
    />
  );
}
