'use client';

import dynamic from "next/dynamic";
import type { ReactNode } from 'react';

const UnifiedDownloaderDynamic = dynamic(
    () => import("./unified-downloader").then((m) => m.UnifiedDownloader)
);

interface Props {
    leftRail?: ReactNode;
    rightRail?: ReactNode;
    mobileAd?: ReactNode;
    mobileGuides?: ReactNode;
    heroMeta?: ReactNode;
    footer?: ReactNode;
}

export function UnifiedDownloaderClient({
    leftRail,
    rightRail,
    mobileAd,
    mobileGuides,
    heroMeta,
    footer,
}: Props) {
    return (
        <UnifiedDownloaderDynamic
            leftRail={leftRail}
            rightRail={rightRail}
            mobileAd={mobileAd}
            mobileGuides={mobileGuides}
            heroMeta={heroMeta}
            footer={footer}
        />
    );
}
