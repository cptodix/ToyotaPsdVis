import React, { useEffect, useState } from 'react';
import { Trash2, X } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { PsdLogCategory, PsdLogEntry } from '../types/hybrid';

interface PsdLogModalProps {
  open: boolean;
  entries: PsdLogEntry[];
  onClose: () => void;
  onClear: () => void;
}

const CATEGORY_STYLE: Record<PsdLogCategory, { label: string; cls: string }> = {
  HYBRID: {
    label: 'HYBRID',
    cls: 'bg-cyan-500/20 border-cyan-400/50 text-cyan-200',
  },
  FLOW: {
    label: 'FLOW',
    cls: 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200',
  },
  ROTATION: {
    label: 'ROTATION',
    cls: 'bg-amber-500/20 border-amber-400/50 text-amber-200',
  },
};

export const PsdLogModal: React.FC<PsdLogModalProps> = ({
  open,
  entries,
  onClose,
  onClear,
}) => {
  const { t } = useI18n();
  const [filter, setFilter] = useState<'ALL' | PsdLogCategory>('ALL');

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const visibleEntries =
    filter === 'ALL' ? entries : entries.filter((e) => e.categories.includes(filter));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="PSD Transition & Event Log"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[82vh] flex flex-col rounded-xl bg-[#0c1220] border border-slate-700/80 shadow-2xl overflow-hidden text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-slate-800 bg-slate-950/70">
          <div>
            <h2 className="text-base font-display font-bold text-slate-100">
              {t.logModal.title}
            </h2>
            <p className="text-xs text-slate-400">{t.logModal.subtitle}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onClear}
              disabled={entries.length === 0}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-700/70 bg-slate-900/80 text-xs text-slate-300 hover:text-white disabled:opacity-40 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{t.logModal.clear}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close PSD Log Modal"
              className="p-1.5 rounded-md border border-slate-700/70 bg-slate-900/80 text-slate-300 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-b border-slate-800/80 bg-slate-900/45 text-xs">
          <div className="flex items-center gap-1">
            {(
              [
                { id: 'ALL', label: `${t.logModal.filterAll} (${entries.length})` },
                { id: 'HYBRID', label: t.logModal.filterHybrid },
                { id: 'FLOW', label: t.logModal.filterFlow },
                { id: 'ROTATION', label: t.logModal.filterRotation },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={`px-2 py-0.5 rounded font-medium transition-colors whitespace-nowrap ${
                  filter === f.id
                    ? 'bg-slate-100 text-slate-950 font-semibold'
                    : 'bg-slate-900/70 text-slate-400 hover:text-white border border-slate-700/60'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <span className="font-mono text-[11px] text-slate-400">{t.logModal.newestOnTop}</span>
        </div>

        {/* Scrollable Entries */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {visibleEntries.length === 0 ? (
            <div className="py-10 text-center text-[13px] text-slate-400">
              {t.logModal.empty}
            </div>
          ) : (
            visibleEntries.map((entry) => (
              <div
                key={entry.id}
                className="p-2.5 rounded-lg bg-slate-900/65 border border-slate-800/90 space-y-1.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="font-mono text-[11px] text-slate-400 mr-0.5">
                      {entry.timestampLabel}
                    </span>
                    {entry.categories.map((cat) => (
                      <span
                        key={cat}
                        className={`px-1.5 py-0.2 rounded border font-mono text-[10.5px] font-bold ${CATEGORY_STYLE[cat].cls}`}
                      >
                        {CATEGORY_STYLE[cat].label}
                      </span>
                    ))}
                    <span className="text-[13px] font-semibold text-slate-100 ml-0.5">
                      {entry.title}
                    </span>
                  </div>
                  <span className="font-mono tabular-nums text-[11.5px] text-violet-300 font-semibold">
                    {Math.abs(entry.speedKmh)} km/h
                  </span>
                </div>

                <p className="text-[12.5px] text-slate-300 leading-relaxed">
                  <span className="text-slate-400 font-medium">{t.logModal.whyPrefix}</span>
                  {entry.explanation}
                </p>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 pt-0.5 text-[11px] font-mono tabular-nums text-slate-400">
                  <span>
                    ICE <strong className="text-red-300">{entry.iceRpm}</strong> RPM
                  </span>
                  <span>
                    MG1 <strong className="text-amber-300">{entry.mg1Rpm}</strong> RPM
                  </span>
                  <span>
                    MG2 <strong className="text-cyan-300">{entry.mg2Rpm}</strong> RPM
                  </span>
                  <span>
                    {t.logModal.battLabel}{' '}
                    <strong className="text-emerald-300">
                      {entry.batteryKw > 0
                        ? `-${entry.batteryKw.toFixed(1)} kW`
                        : entry.batteryKw < 0
                          ? `+${Math.abs(entry.batteryKw).toFixed(1)} kW`
                          : '0.0 kW'}
                    </strong>
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
