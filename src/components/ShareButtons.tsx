"use client";

import { useState } from "react";

interface ShareButtonsProps {
  /** Politician name + verdict + quote (short) */
  text: string;
  /** Full URL to the claim — fallback to current page if not provided */
  url?: string;
}

/**
 * Editorial share row: outlined ink-colored chips instead of brand-coloured
 * social bubbles. The visual goal is "newspaper byline footer", not "viral
 * marketing widget". Hover reveals platform tint subtly via accent colour.
 */
export function ShareButtons({ text, url }: ShareButtonsProps) {
  const [copied, setCopied] = useState(false);

  function getShareUrl(): string {
    if (url) return url;
    if (typeof window !== "undefined") return window.location.href;
    return "https://bduk.co.il";
  }

  function shareWhatsApp() {
    const shareUrl = getShareUrl();
    const msg = `${text}\n\nבדוק | בדיקת עובדות:\n${shareUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  }

  function shareTwitter() {
    const shareUrl = getShareUrl();
    const msg = `${text}\n\nבדוק | בדיקת עובדות:`;
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(msg)}&url=${encodeURIComponent(shareUrl)}`,
      "_blank",
    );
  }

  function shareTelegram() {
    const shareUrl = getShareUrl();
    window.open(
      `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(text)}`,
      "_blank",
    );
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(getShareUrl());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* silent */
    }
  }

  const btn =
    "h-7 w-7 inline-flex items-center justify-center border border-border text-foreground-muted hover:border-foreground hover:text-foreground transition-colors";

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={shareWhatsApp}
        title="שתפו בוואטסאפ"
        className={btn}
        style={{ borderRadius: 2 }}
        aria-label="שתפו בוואטסאפ"
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
        </svg>
      </button>
      <button
        onClick={shareTwitter}
        title="שתפו ב-X"
        className={btn}
        style={{ borderRadius: 2 }}
        aria-label="שתפו ב-X"
      >
        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      </button>
      <button
        onClick={shareTelegram}
        title="שתפו בטלגרם"
        className={btn}
        style={{ borderRadius: 2 }}
        aria-label="שתפו בטלגרם"
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.464.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
        </svg>
      </button>
      <button
        onClick={copyLink}
        title="העתיקו קישור"
        className={btn}
        style={{ borderRadius: 2 }}
        aria-label="העתיקו קישור"
      >
        {copied ? (
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
        )}
      </button>
      {copied && (
        <span className="text-[10px] text-foreground-muted font-medium">הועתק</span>
      )}
    </div>
  );
}
