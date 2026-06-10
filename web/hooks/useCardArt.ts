'use client';
import { useState } from 'react';

/**
 * Resolves the image a movie card should show, with a graceful fallback.
 *
 * Playable titles get bespoke "cinematic" art (`/Images/cards/card-{key}.jpg`) with the
 * title composited into the frame — so the card should NOT draw a title overlay. Until that
 * art is uploaded the file 404s; on error we fall back to the title-less backdrop and tell the
 * card to draw the title overlay again. Non-playable titles never have card art, so they always
 * use the backdrop + drawn title. This keeps the home screen looking right before *and* after
 * the new art lands in R2.
 */
export function useCardArt(
  cardUrl?: string | null,
  backdropUrl?: string | null,
  posterUrl?: string | null,
) {
  const fallback = backdropUrl || posterUrl || null;
  const [failed, setFailed] = useState(false);

  const usingCardArt = !!cardUrl && !failed;
  const src = usingCardArt ? cardUrl! : fallback;

  return {
    /** The image URL to render right now. */
    src,
    /** True while the baked-in cinematic art is showing (title is in the image). */
    usingCardArt,
    /** True when the card itself should draw the title (no baked-in art is visible). */
    showTitle: !usingCardArt,
    /** Pass to <Image onError>; flips to the title-less backdrop + drawn title. */
    onError: () => {
      if (cardUrl && !failed) setFailed(true);
    },
  };
}
