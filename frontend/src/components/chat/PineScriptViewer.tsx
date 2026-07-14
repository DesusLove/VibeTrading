import { useTranslation } from 'react-i18next';
import { memo, useState, useCallback } from "react";
import { X, Copy, Check, ExternalLink } from "lucide-react";

interface Props {
  code: string;
  onClose: () => void;
}

export const PineScriptViewer = memo(function PineScriptViewer({ code, onClose }: Props) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement("textarea");
      textarea.value = code;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [code]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'hsl(0 0% 0% / 0.5)' }} onClick={onClose}>
      <div
        className="relative w-full max-w-3xl max-h-[80vh] mx-4 rounded-xl shadow-2xl flex flex-col"
        style={{ border: '1px solid hsl(var(--border-hairline))', background: 'hsl(var(--bg-elevated))' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'hsl(var(--border-hairline))' }}>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-text-primary">{t("pineViewer.pineScript")}</span>
            <span className="text-xs" style={{ color: 'hsl(var(--text-tertiary))' }}>strategy.pine</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleCopy}
              className="v2-btn-primary text-xs px-3 py-1.5"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? t("pineViewer.copied") : t("pineViewer.copy")}
            </button>
            <a
              href="https://www.tradingview.com/pine-script-docs/welcome/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs transition-colors"
              style={{ color: 'hsl(var(--text-tertiary))' }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'hsl(var(--text-primary))'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'hsl(var(--text-tertiary))'}
            >
              <ExternalLink className="h-3 w-3" />
              {t("pineViewer.docs")}
            </a>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: 'hsl(var(--text-tertiary))' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'hsl(var(--text-primary))'; e.currentTarget.style.background = 'hsl(var(--surface-muted))'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'hsl(var(--text-tertiary))'; e.currentTarget.style.background = 'transparent'; }}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Code */}
        <div className="flex-1 overflow-auto p-4">
          <pre className="text-xs leading-relaxed font-mono whitespace-pre-wrap break-words" style={{ color: 'hsl(var(--text-primary) / 0.9)' }}>
            {code}
          </pre>
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t" style={{ borderColor: 'hsl(var(--border-hairline))', background: 'hsl(var(--surface-muted) / 0.5)' }}>
          <p className="text-xs" style={{ color: 'hsl(var(--text-tertiary))' }}>
            {t("pineViewer.footer")}
          </p>
        </div>
      </div>
    </div>
  );
});
