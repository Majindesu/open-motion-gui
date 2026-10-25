export type DeviceId = 'DESKTOP' | 'TABLET' | 'MOBILE';

/** Fixed CSS-pixel viewports. The canvas iframe is exactly this size, so vh units, scroll
 *  start/end positions and media queries behave as they will on a real device. */
export const DEVICES: Record<DeviceId, { label: string; w: number; h: number }> = {
  DESKTOP: { label: 'Desktop', w: 1440, h: 900 },
  TABLET: { label: 'Tablet', w: 768, h: 1024 },
  MOBILE: { label: 'Mobile', w: 390, h: 844 },
};