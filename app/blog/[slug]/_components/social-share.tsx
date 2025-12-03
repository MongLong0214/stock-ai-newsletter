'use client';

import { useState } from 'react';
import { Check, Copy, Facebook, Linkedin, Twitter } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SocialShareProps {
  title: string;
  url: string;
}

/**
 * 소셜 공유 버튼 컴포넌트
 * Twitter, Facebook, LinkedIn, URL 복사
 */
export function SocialShare({ title, url }: SocialShareProps) {
  const [copied, setCopied] = useState(false);

  const encodedTitle = encodeURIComponent(title);
  const encodedUrl = encodeURIComponent(url);

  const shareLinks = {
    twitter: `https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const buttonClass =
    'flex items-center justify-center w-10 h-10 rounded-lg border border-slate-800 bg-slate-900/50 text-slate-400 hover:text-white hover:border-slate-700 hover:bg-slate-800/50 transition-all';

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-500 mr-1">공유</span>
      <a
        href={shareLinks.twitter}
        target="_blank"
        rel="noopener noreferrer"
        className={buttonClass}
        aria-label="Twitter에 공유"
      >
        <Twitter className="w-4 h-4" />
      </a>
      <a
        href={shareLinks.facebook}
        target="_blank"
        rel="noopener noreferrer"
        className={buttonClass}
        aria-label="Facebook에 공유"
      >
        <Facebook className="w-4 h-4" />
      </a>
      <a
        href={shareLinks.linkedin}
        target="_blank"
        rel="noopener noreferrer"
        className={buttonClass}
        aria-label="LinkedIn에 공유"
      >
        <Linkedin className="w-4 h-4" />
      </a>
      <button
        onClick={handleCopy}
        className={cn(buttonClass, copied && 'text-emerald-400 border-emerald-500/30')}
        aria-label="URL 복사"
      >
        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
      </button>
    </div>
  );
}