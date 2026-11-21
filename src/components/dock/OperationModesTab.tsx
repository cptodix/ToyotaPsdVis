import React from 'react';
import { OPERATION_MODES } from '../../drivetrain';
import { useI18n } from '../../i18n/I18nContext';
import { OperationModeId, PowertrainState } from '../../types/hybrid';
import { PowerAndBrakingSplitCard } from './PowerAndBrakingSplitCard';

interface OperationModesTabProps {
  state: PowertrainState;
  onSelectOperationMode: (modeId: OperationModeId) => void;
}

export const OperationModesTab: React.FC<OperationModesTabProps> = ({
  state,
  onSelectOperationMode,
}) => {
  const { t } = useI18n();

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
        {OPERATION_MODES.map((m) => {
          const selected = state.activeModeId === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onSelectOperationMode(m.id)}
              className={`px-2.5 py-1.5 rounded-lg border text-[13px] font-medium transition-colors whitespace-nowrap ${
                selected
                  ? 'bg-slate-100 text-slate-950 border-white font-semibold'
                  : 'bg-slate-900/45 text-slate-200 border-slate-700/50 hover:border-slate-500'
              }`}
            >
              {t.modes[m.id].shortLabel}
            </button>
          );
        })}
      </div>

      <PowerAndBrakingSplitCard state={state} horizontal />
    </div>
  );
};
