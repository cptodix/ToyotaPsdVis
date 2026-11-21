import React from 'react';
import { ChevronDown, ChevronUp, Volume2, VolumeX } from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';
import { AnimationSpeedMode, CameraPresetId, WorkspaceTab } from '../../types/hybrid';

interface SimulatorToolbarProps {
  activeTab: WorkspaceTab;
  onSelectTab: (tab: WorkspaceTab) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  cameraPreset: CameraPresetId;
  onSelectCameraPreset: (preset: CameraPresetId) => void;
  explodeFactor: number;
  onExplodeChange: (val: number) => void;
  animationSpeedMode: AnimationSpeedMode;
  onSelectAnimationSpeedMode: (mode: AnimationSpeedMode) => void;
  timeScale: number;
  onTimeScaleChange: (scale: number) => void;
  autoSloMo: boolean;
  autoSloMoActive: boolean;
  onToggleAutoSloMo: () => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onReset: () => void;
}

export const SimulatorToolbar: React.FC<SimulatorToolbarProps> = ({
  activeTab,
  onSelectTab,
  collapsed,
  onToggleCollapse,
  cameraPreset,
  onSelectCameraPreset,
  explodeFactor,
  onExplodeChange,
  animationSpeedMode,
  onSelectAnimationSpeedMode,
  timeScale,
  onTimeScaleChange,
  autoSloMo,
  autoSloMoActive,
  onToggleAutoSloMo,
  soundEnabled,
  onToggleSound,
  onReset,
}) => {
  const { t } = useI18n();
  const tb = t.toolbar;

  return (
    <div className="flex items-center justify-between gap-1 mb-1 px-0.5 flex-nowrap overflow-x-auto [scrollbar-width:none]">
      <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-slate-950/75 border border-slate-700/60 shrink-0">
        {(
          [
            { id: WorkspaceTab.SIMULATOR, label: tb.drive },
            { id: WorkspaceTab.MODES, label: tb.modes },
            { id: WorkspaceTab.MANUAL, label: tb.manual },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              onSelectTab(tab.id);
              if (collapsed) onToggleCollapse();
            }}
            className={`px-2 py-0.5 text-[11.5px] font-medium rounded-md transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-slate-100 text-slate-950 font-semibold'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1 flex-nowrap shrink-0">
        {/* Animation Speed Mode (Normal vs Realistic — mechanical spin speed; flow animation unchanged) */}
        <div
          className={`flex items-center gap-0.5 p-0.5 rounded-lg bg-slate-950/75 border text-[11.5px] shrink-0 ${
            animationSpeedMode === AnimationSpeedMode.REALISTIC
              ? 'border-emerald-500/65'
              : 'border-slate-700/60'
          }`}
          title={tb.speedTooltip}
        >
          <span className="hidden xl:inline px-1 text-slate-400 whitespace-nowrap">{tb.speed}</span>
          {(
            [
              { id: AnimationSpeedMode.NORMAL, label: tb.normal },
              { id: AnimationSpeedMode.REALISTIC, label: tb.realistic },
            ] as const
          ).map((opt) => {
            const active = animationSpeedMode === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => onSelectAnimationSpeedMode(opt.id)}
                className={`px-1.5 py-0.5 rounded font-medium transition-colors whitespace-nowrap ${
                  active
                    ? opt.id === AnimationSpeedMode.REALISTIC
                      ? 'bg-emerald-400 text-slate-950 font-semibold'
                      : 'bg-slate-700/90 text-white font-semibold'
                    : 'text-slate-400 hover:text-slate-100'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* Slow-Mo Selector (Auto · 1x · 0.5x · 0.25x) */}
        <div
          className={`flex items-center gap-0.5 p-0.5 rounded-lg bg-slate-950/75 border text-[11.5px] shrink-0 ${
            timeScale < 1
              ? 'border-amber-500/70'
              : autoSloMo
                ? 'border-cyan-500/55'
                : 'border-slate-700/60'
          }`}
          title={tb.slowMoTooltip}
        >
          <span className="hidden md:inline px-1 text-slate-400 whitespace-nowrap">{tb.slowMo}</span>
          <button
            type="button"
            onClick={onToggleAutoSloMo}
            title={tb.autoSloMoTooltip}
            className={`px-1.5 py-0.5 rounded font-medium transition-colors whitespace-nowrap ${
              autoSloMo
                ? autoSloMoActive
                  ? 'bg-amber-400 text-slate-950 font-semibold'
                  : 'bg-cyan-400 text-slate-950 font-semibold'
                : 'text-slate-400 hover:text-slate-100'
            }`}
          >
            {tb.auto}
          </button>
          {(
            [
              { val: 1, label: '1x' },
              { val: 0.5, label: '0.5x' },
              { val: 0.25, label: '0.25x' },
            ] as const
          ).map((opt) => {
            const active = Math.abs(timeScale - opt.val) < 0.005;
            return (
              <button
                key={opt.label}
                type="button"
                onClick={() => onTimeScaleChange(opt.val)}
                className={`px-1.5 py-0.5 rounded font-mono transition-colors whitespace-nowrap ${
                  active
                    ? opt.val < 1
                      ? 'bg-amber-400 text-slate-950 font-semibold'
                      : 'bg-slate-700/90 text-white font-semibold'
                    : 'text-slate-400 hover:text-slate-100'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        <div className="hidden sm:flex items-center gap-0.5 p-0.5 rounded-lg bg-slate-950/75 border border-slate-700/60 text-[11.5px] shrink-0">
          {(
            [
              { id: CameraPresetId.OVERVIEW, label: tb.camAll },
              { id: CameraPresetId.PLANETARY, label: tb.camPsd },
              { id: CameraPresetId.PARALLEL_SHAFTS, label: tb.camMg },
              { id: CameraPresetId.WHEEL_DIFF, label: tb.camWheel },
            ] as const
          ).map((cam) => (
            <button
              key={cam.id}
              type="button"
              onClick={() => onSelectCameraPreset(cam.id)}
              className={`px-1.5 py-0.5 rounded transition-colors whitespace-nowrap ${
                cameraPreset === cam.id
                  ? 'bg-slate-700/90 text-white font-semibold'
                  : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              {cam.label}
            </button>
          ))}
        </div>

        <div className="hidden lg:flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-950/75 border border-slate-700/60 text-[11.5px] text-slate-300 shrink-0">
          <label htmlFor="dock-explode" className="whitespace-nowrap">
            {tb.spread} {Math.round(explodeFactor * 100)}%
          </label>
          <input
            id="dock-explode"
            type="range"
            min={0}
            max={1}
            step={0.02}
            value={explodeFactor}
            onChange={(e) => onExplodeChange(Number(e.target.value))}
            className="ths-slider w-11 text-cyan-400"
          />
        </div>

        <button
          type="button"
          onClick={onToggleSound}
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[11.5px] font-medium transition-colors whitespace-nowrap shrink-0 ${
            soundEnabled
              ? 'bg-slate-950/75 border-emerald-500/50 text-emerald-300 hover:text-emerald-200'
              : 'bg-slate-950/75 border-slate-700/60 text-slate-400 hover:text-white'
          }`}
          title={soundEnabled ? tb.muted : tb.sound}
        >
          {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
          <span>{soundEnabled ? tb.sound : tb.muted}</span>
        </button>

        <button
          type="button"
          onClick={onReset}
          className="px-2 py-0.5 rounded-lg bg-slate-950/75 border border-slate-700/60 text-[11.5px] font-medium text-slate-300 hover:text-white transition-colors whitespace-nowrap shrink-0"
        >
          {tb.reset}
        </button>

        <button
          type="button"
          onClick={onToggleCollapse}
          className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-lg bg-slate-950/75 border border-slate-700/60 text-[11.5px] font-medium text-slate-200 hover:text-white transition-colors whitespace-nowrap shrink-0"
        >
          {collapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          <span>{collapsed ? tb.show : tb.hide}</span>
        </button>
      </div>
    </div>
  );
};
