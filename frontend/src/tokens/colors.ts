// 莫兰迪豆沙绿 — 配色 Token (使用 interface 而非 const literal 避免类型冲突)
export interface Colors {
  learning: string;
  learningLight: string;
  learningDark: string;
  info: string;
  infoLight: string;
  document: string;
  documentLight: string;
  statistics: string;
  statisticsLight: string;
  dangerLight: string;
  primary: string;
  primaryLight: string;
  primaryDark: string;
  success: string;
  danger: string;
  warning: string;
  bg: string;
  surface: string;
  surfaceHover: string;
  iconBackground: string;
  border: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  bgDark: string;
  surfaceDark: string;
  borderDark: string;
  textDark: string;
  overlay: string;
}

export const colors: Colors = {
  learning: "#E6A23C",
  learningLight: "#FFF3E0",
  learningDark: "#B8751B",
  info: "#5B8DEF",
  infoLight: "#EEF3FF",
  document: "#5FA86B",
  documentLight: "#EFF7F0",
  statistics: "#8A76D6",
  statisticsLight: "#F2EFFF",
  dangerLight: "#FCEEEE",
  primary: "#E6A23C",
  primaryLight: "#FFF3E0",
  primaryDark: "#B8751B",
  success: "#5FA86B",
  danger: "#D96C6C",
  warning: "#E6A23C",
  bg: "#FAFAFC",
  surface: "#ffffff",
  surfaceHover: "#F7F7F9",
  iconBackground: "#F4F5F7",
  border: "#ECEEF2",
  text: "#111318",
  textSecondary: "#8B8F9C",
  textTertiary: "#b4b4bf",
  bgDark: "#17171d",
  surfaceDark: "#23232c",
  borderDark: "#383842",
  textDark: "#f7f7fa",
  overlay: "rgba(0,0,0,0.35)",
};
