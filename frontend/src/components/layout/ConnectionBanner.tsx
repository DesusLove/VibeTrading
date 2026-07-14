import { useTranslation } from 'react-i18next';
import { RefreshCw } from "lucide-react";
import type { SSEStatus } from "@/hooks/useSSE";

interface Props {
  status: SSEStatus;
  retryAttempt?: number;
}

export function ConnectionBanner({ status, retryAttempt }: Props) {
  const { t } = useTranslation();
  if (status !== "reconnecting") return null;

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 text-[11px] text-warning border-b" style={{ background: 'hsl(38 85% 50% / 0.08)', borderColor: 'hsl(38 85% 50% / 0.2)' }}>
      <RefreshCw className="h-3 w-3 animate-spin shrink-0" />
      <span className="num-xs">{t('connection.reconnecting', { attempt: retryAttempt || 1 })}</span>
    </div>
  );
}
