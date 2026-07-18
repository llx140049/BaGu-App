import type { ComponentType } from "react";

declare const MarkdownDocument: ComponentType<{ markdown: string; imageBaseUrl?: string; isDark?: boolean }>;

export default MarkdownDocument;
