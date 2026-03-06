'use client';
import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { ADSENSE_CLIENT_ID, AD_MIN_HEIGHT } from '@/lib/constants';

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

interface SideRailAdProps {
  slot: string;
  className?: string;
  minHeight?: number;
}

export function SideRailAd({ slot, className, minHeight = AD_MIN_HEIGHT }: SideRailAdProps) {
  const adRef = useRef<HTMLModElement | null>(null);
  const initializedRef = useRef(false);
  const pathname = usePathname();

  useEffect(() => {
    if (initializedRef.current || !adRef.current) {
      return;
    }

    const el = adRef.current;
    let rafId: number | null = null;
    let disposed = false;

    const hasRenderableSize = () => {
      if (!document.contains(el)) {
        return false;
      }
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') {
        return false;
      }
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };

    const tryInitAd = () => {
      if (disposed || initializedRef.current || !hasRenderableSize()) {
        return;
      }
      if (el.getAttribute('data-adsbygoogle-status') === 'done') {
        initializedRef.current = true;
        return;
      }
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
        initializedRef.current = true;
      } catch (error) {
        console.error('AdSense error:', error);
      }
    };

    const scheduleInit = () => {
      if (disposed) {
        return;
      }
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      rafId = requestAnimationFrame(() => {
        rafId = null;
        tryInitAd();
      });
    };

    // Avoid pushing when element is hidden/collapsed by responsive layout.
    const resizeObserver = new ResizeObserver(() => scheduleInit());
    resizeObserver.observe(el);

    const intersectionObserver = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) {
        scheduleInit();
      }
    });
    intersectionObserver.observe(el);

    window.addEventListener('resize', scheduleInit);
    scheduleInit();

    return () => {
      disposed = true;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      window.removeEventListener('resize', scheduleInit);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
    };
  }, [slot, pathname]);

  return (
    <div className={cn('w-full', className)} style={{ minHeight: `${minHeight}px` }}>
      <ins
        ref={adRef}
        className="adsbygoogle block"
        style={{ display: 'block', width: '100%', minHeight: `${minHeight}px` }}
        data-ad-client={ADSENSE_CLIENT_ID}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-ad-test={process.env.NODE_ENV === 'development' ? 'on' : undefined}
        data-full-width-responsive="true"
      />
    </div>
  );
}
