'use client';

import Link from 'next/link';
import { Github, Heart, Info } from 'lucide-react';

/**
 * App-wide footer rendered once via the root layout.
 *
 * Stays out of the way of the persistent device side panel because
 * the body itself takes care of the right padding when the panel is
 * open (see `body.device-panel-open` in globals.css).
 */
export default function AppFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-auto border-t border-gray-200 dark:border-neutral-800 bg-white/70 dark:bg-neutral-950/70 backdrop-blur">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="grid gap-6 md:grid-cols-2">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-900 dark:text-white">
                SteadiGrip
              </span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-gray-500 dark:text-gray-400 max-w-xs">
              An offline AI rehabilitation glove making Parkinson's therapy
              affordable and engaging — built to democratize care for patients
              in rural communities.
            </p>
          </div>

          {/* Navigation */}
          <div>
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Explore
            </h4>
            <ul className="mt-3 grid grid-cols-2 gap-y-2 text-sm">
              <li><FooterLink href="/">Home</FooterLink></li>
              <li><FooterLink href="/rehab">Rehab</FooterLink></li>
              <li><FooterLink href="/garden">Garden</FooterLink></li>
              <li><FooterLink href="/rewards">Rewards</FooterLink></li>
              <li><FooterLink href="/profile">Profile</FooterLink></li>
              <li><FooterLink href="/summary-card">Progress Card</FooterLink></li>
              <li><FooterLink href="/records">Records</FooterLink></li>
              <li><FooterLink href="/about">About</FooterLink></li>
            </ul>
          </div>
        </div>

        <div className="mt-8 flex flex-col items-start justify-between gap-2 border-t border-gray-100 dark:border-neutral-800 pt-4 text-[11px] text-gray-400 dark:text-gray-500 sm:flex-row sm:items-center">
          <div>© {year} SteadiGrip: Affordable AI Parkinson's Rehab</div>
          <div className="flex items-center gap-3">
            <span>Not a medical device</span>
            <span aria-hidden>·</span>
            <span>Consult your physician</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
    >
      {children}
    </Link>
  );
}
