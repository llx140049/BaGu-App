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
  primary: "#f2a23a",
  primaryLight: "#fff0d9",
  primaryDark: "#c97817",
  success: "#5f9c71",
  danger: "#d75e5e",
  warning: "#f2a23a",
  bg: "#fbfbfd",
  surface: "#ffffff",
  surfaceHover: "#fffaf3",
  border: "#ececf1",
  text: "#11111a",
  textSecondary: "#858592",
  textTertiary: "#b4b4bf",
  bgDark: "#17171d",
  surfaceDark: "#23232c",
  borderDark: "#383842",
  textDark: "#f7f7fa",
  overlay: "rgba(0,0,0,0.35)",
};
