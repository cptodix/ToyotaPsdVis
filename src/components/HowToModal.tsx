import React, { useEffect, useState } from 'react';
import { BookOpen, Cpu, X } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';

interface HowToModalProps {
  open: boolean;
  onClose: () => void;
}

type HowToTab = 'controls' | 'drivetrain';

export const HowToModal: React.FC<HowToModalProps> = ({ open, onClose }) => {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<HowToTab>('controls');

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const h = t.howToModal;
  const cards = activeTab === 'controls' ? h.controlsCards : h.drivetrainCards;
  const intro = activeTab === 'controls' ? h.controlsIntro : h.drivetrainIntro;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/78 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={h.title}
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[85vh] flex flex-col rounded-xl bg-[#0c1220] border border-slate-700/80 shadow-2xl overflow-hidden text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-slate-800 bg-slate-950/75">
          <div>
            <h2 className="text-base font-display font-bold text-slate-100">{h.title}</h2>
            <p className="text-xs text-slate-400 mt-0.5">{h.subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={h.close}
            className="p-1.5 rounded-md border border-slate-700/70 bg-slate-900/80 text-slate-300 hover:text-white transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Section Tabs */}
        <div className="flex items-center gap-1.5 px-4 py-2 border-b border-slate-800/80 bg-slate-900/45 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('controls')}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md font-medium transition-colors ${
              activeTab === 'controls'
                ? 'bg-slate-100 text-slate-950 font-semibold'
                : 'bg-slate-900/75 text-slate-300 hover:text-white border border-slate-700/60'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>{h.tabControls}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('drivetrain')}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md font-medium transition-colors ${
              activeTab === 'drivetrain'
                ? 'bg-cyan-400 text-slate-950 font-semibold'
                : 'bg-slate-900/75 text-slate-300 hover:text-white border border-slate-700/60'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>{h.tabDrivetrain}</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <p className="text-[13px] text-slate-300 leading-relaxed">{intro}</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {cards.map((card, idx) => (
              <div
                key={idx}
                className="p-3 rounded-lg bg-slate-900/65 border border-slate-800/90 space-y-1.5"
              >
                {card.badge && (
                  <span className="inline-block px-1.5 py-0.5 rounded border border-cyan-500/40 bg-cyan-500/12 font-mono text-[10.5px] font-bold text-cyan-300 tracking-wide">
                    {card.badge}
                  </span>
                )}
                <h3 className="text-[13.5px] font-semibold text-slate-100 leading-snug">
                  {card.title}
                </h3>
                <p className="text-[12.5px] text-slate-300 leading-relaxed">{card.body}</p>
              </div>
            ))}
          </div>

          {/* Willis Planetary Identity Callout */}
          <div className="px-3 py-2 rounded-lg bg-slate-950/85 border border-amber-500/35 flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono text-xs text-amber-200 font-semibold">
              {h.willisFormulaNote}
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-4 py-2.5 border-t border-slate-800 bg-slate-950/70">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg bg-slate-100 text-slate-950 text-xs font-semibold hover:bg-white transition-colors"
          >
            {h.close}
          </button>
        </div>
      </div>
    </div>
  );
};
