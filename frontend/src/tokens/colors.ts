// 莫兰迪豆沙绿 — 配色 Token (使用 interface 而非 const literal 避免类型冲突)
export interface Colors {
  primary: string;
  primaryLight: string;
  primaryDark: string;
  success: string;
  danger: string;
  warning: string;
  bg: string;
  surface: string;
  surfaceHover: string;
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
  primary: "#8a9a8a",
  primaryLight: "#c8d6c0",
  primaryDark: "#6b7e6b",
  success: "#6b9a6b",
  danger: "#c47a7a",
  warning: "#c4a46a",
  bg: "#d4c5b5",
  surface: "#f0ebe3",
  surfaceHover: "#e8e0d8",
  border: "#d4c5b5",
  text: "#4a5a4a",
  textSecondary: "#8a9a8a",
  textTertiary: "#b0b5b0",
  bgDark: "#2a342a",
  surfaceDark: "#3a4a3a",
  borderDark: "#4a5a4a",
  textDark: "#e8ece4",
  overlay: "rgba(42,52,42,0.4)",
};
