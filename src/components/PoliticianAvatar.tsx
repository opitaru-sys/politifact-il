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
}: {
  id: string;
  name: string;
  image?: string | null;
  size?: "sm" | "md" | "lg";
}) {
  const { px, className } = SIZES[size];
  const [errored, setErrored] = useState(false);
  const initials = name.slice(0, 2);
  const src = image || `/politicians/${id}.jpg`;

  if (errored) {
    return (
      <div
        className={`${className} rounded-full bg-brand/10 text-brand flex items-center justify-center font-bold shrink-0`}
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
      loading="lazy"
      decoding="async"
      onError={() => setErrored(true)}
      className={`${className} rounded-full object-cover bg-gray-200 shrink-0`}
    />
  );
}
