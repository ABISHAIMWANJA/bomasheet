export const colors = {
  light: {
    info: '#2f9fd4',
    infoContent: '#04293a',
    success: '#1f9d6b',
    successContent: '#03271a',
    warning: '#d99518',
    warningContent: '#3d2a02',
    error: '#d94a3d',
    errorContent: '#3f0d08',
  },
  dark: {
    info: '#4cb8e8',
    infoContent: '#04293a',
    success: '#35c48c',
    successContent: '#03271a',
    warning: '#f0ad2e',
    warningContent: '#3d2a02',
    error: '#ef6a5c',
    errorContent: '#3f0d08',
  },
};

export type IColor = typeof colors.light | typeof colors.dark;
