'use client'

import { DeferredAdSenseScript } from '@/components/deferred-adsense-script'
import { DeferredAnalytics } from '@/components/deferred-analytics'
import { DeferredGoogleAnalyticsScript } from '@/components/deferred-google-analytics-script'
import { DeferredSpeedInsights } from '@/components/deferred-speed-insights'
import { DeferredWebVitalsTracker } from '@/components/deferred-web-vitals-tracker'
import { ServiceWorkerRegistration } from '@/components/service-worker-registration'

export function RuntimeServices() {
    return (
        <>
            <ServiceWorkerRegistration />
            <DeferredAdSenseScript />
            <DeferredGoogleAnalyticsScript />
            <DeferredAnalytics />
            <DeferredSpeedInsights />
            <DeferredWebVitalsTracker />
        </>
    )
}
