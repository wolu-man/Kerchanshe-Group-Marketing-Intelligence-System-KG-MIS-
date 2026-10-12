import type { AppearanceConfig } from './types';

export function getDefaultAppearanceConfig(): AppearanceConfig {
  return {
    header: {
      enabled: false,
      height: 'medium',
      fit: 'cover',
      position: 'center',
    },
    watermark: {
      enabled: false,
      type: 'text',
      position: 'center',
      opacity: 0.1,
      size: 100,
      rotation: -45,
    },
    bodyBackground: {
      type: 'default',
      gradientDirection: 135,
    },
    footer: {
      enabled: false,
      textAlign: 'center',
      showPoweredBy: true,
    },
  };
}