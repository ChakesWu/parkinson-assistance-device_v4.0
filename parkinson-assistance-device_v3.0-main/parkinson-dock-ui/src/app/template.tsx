'use client';

import React from 'react';
import { motion } from 'framer-motion';

/**
 * Next.js `template.tsx` re-mounts on every navigation while `layout.tsx`
 * stays mounted. We use this to fade/slide the page content in on route
 * change without disturbing the persistent AppShell (device panel + state).
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}
