/**
 * Central manifest for decorative photography. Every photo the UI shows comes from here.
 *
 * Rules (enforced by how <Atmosphere> renders them):
 * - These are GENERIC atmosphere images. They never depict a specific event, artist
 *   or venue in the app, so they are only used as page/section backdrops behind
 *   app UI — never inside an event card, never next to an event's title as if it
 *   were the event's poster, and always with alt="" (decorative).
 * - No text, logos or recognisable performers are visible in them.
 * - Self-hosted (no hotlinking). Sizes are pre-built by scripts/build-atmosphere-images.mjs.
 */
export type AtmosphereKey = "concert-crowd" | "festival-sunset" | "gold-stage" | "panorama-band";

export interface AtmosphereAsset {
  key: AtmosphereKey;
  /** Largest file; `small` is used on narrow screens via srcset. */
  src: string;
  small?: string;
  width: number;
  height: number;
  aspect: string;
  /** What is in the photo (used for this manifest and the visual audit, not shown). */
  content: string;
  /** CSS object-position that keeps the interesting part visible on narrow crops. */
  focal: string;
  /** Where in the app it is used. */
  usedOn: string[];
  source: string;
  licence: string;
  credit?: { label: string; url: string };
}

export const ATMOSPHERE: Record<AtmosphereKey, AtmosphereAsset> = {
  "concert-crowd": {
    key: "concert-crowd",
    src: "/media/concert-crowd.jpg",
    width: 2400,
    height: 1596,
    aspect: "3:2",
    content: "Crowd with raised arms facing a lit stage; no legible text or identifiable performer.",
    focal: "50% 55%",
    usedOn: ["/radar (Discover hero)"],
    source: "Unsplash — Adrià Sánchez Roqué, https://unsplash.com/photos/DMYmEtYRf3Y",
    licence: "Unsplash License (commercial use allowed; credited anyway)",
    credit: { label: "Photo: Adrià Sánchez Roqué / Unsplash", url: "https://unsplash.com/photos/DMYmEtYRf3Y" },
  },
  "festival-sunset": {
    key: "festival-sunset",
    src: "/images/atmosphere/festival-sunset-1600.webp",
    small: "/images/atmosphere/festival-sunset-800.webp",
    width: 1600,
    height: 900,
    aspect: "16:9",
    content:
      "Open-air festival at sunset: city skyline and string lights on the left, stage with LED screens and confetti on the right, crowd with phones in the foreground.",
    focal: "70% 45%",
    usedOn: ["/saved", "/bookings", "/onboarding/* (step aside panel)"],
    source: "Supplied by the project owner (original 1672×941 WebP)",
    licence: "Provided by the project owner for use in this app — confirm usage rights before a public launch",
  },
  "gold-stage": {
    key: "gold-stage",
    src: "/images/atmosphere/gold-stage-1600.webp",
    small: "/images/atmosphere/gold-stage-800.webp",
    width: 1600,
    height: 900,
    aspect: "16:9",
    content: "Night stage under gold beams and confetti, crowd with raised hands in silhouette; centre-weighted.",
    focal: "55% 40%",
    usedOn: ["/artists", "Live on Stage stage panel", "landing call-to-action"],
    source: "Supplied by the project owner (original 1672×941 WebP)",
    licence: "Provided by the project owner for use in this app — confirm usage rights before a public launch",
  },
  "panorama-band": {
    key: "panorama-band",
    src: "/images/atmosphere/panorama-band-1600.webp",
    small: "/images/atmosphere/panorama-band-800.webp",
    width: 1600,
    height: 569,
    aspect: "≈2.8:1 (panorama)",
    content: "Wide shot of a band on an orange-lit stage, crowd silhouettes in front; left third is dark foliage.",
    focal: "72% 50%",
    usedOn: ["/explore header", "/inbox", "/settings"],
    source: "Supplied by the project owner (original 2000×711 WebP)",
    licence: "Provided by the project owner for use in this app — confirm usage rights before a public launch",
  },
};
