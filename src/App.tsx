import { BottomControlDock } from './components/BottomControlDock';
import { PowertrainViewport } from './components/PowertrainViewport';
import { PsdLogModal } from './components/PsdLogModal';
import { useHybridSimulation } from './engine';

export default function App() {
  const sim = useHybridSimulation();

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#090d16] text-slate-100">
      <main className="w-full h-full">
        <PowertrainViewport
          stateRef={sim.stateRef}
          uiState={sim.uiState}
          activeTab={sim.activeTab}
          onTickSimulation={sim.handleTickSimulation}
          cameraPreset={sim.cameraPreset}
          cameraPresetTrigger={sim.cameraPresetTrigger}
          explodeFactor={sim.explodeFactor}
          visualSpinScale={sim.effectiveTimeScale}
          animationSpeedMode={sim.animationSpeedMode}
          showStreams={true}
          onOpenLogModal={() => sim.setLogModalOpen(true)}
          logNotifEnabled={sim.logNotifEnabled}
          onToggleLogNotif={sim.handleToggleLogNotif}
          activeNotification={sim.activeNotification}
          onDismissNotification={sim.handleDismissNotification}
        />
      </main>

      <BottomControlDock
        activeTab={sim.activeTab}
        onSelectTab={sim.handleSelectTab}
        collapsed={sim.dockCollapsed}
        onToggleCollapse={() => sim.setDockCollapsed((prev) => !prev)}
        state={sim.uiState}
        onGearChange={sim.handleGearChange}
        onToggleEvMode={sim.handleToggleEvMode}
        autoDriveMode={sim.autoDriveMode}
        onSelectAutoDriveMode={sim.handleSelectAutoDriveMode}
        onThrottleChange={sim.handleThrottleChange}
        onBrakeChange={sim.handleBrakeChange}
        onRoadGradeChange={sim.handleRoadGradeChange}
        onSelectOperationMode={sim.handleSelectOperationMode}
        solveTarget={sim.solveTarget}
        onChangeSolveTarget={sim.setSolveTarget}
        onManualShaftChange={sim.handleManualShaftChange}
        cameraPreset={sim.cameraPreset}
        onSelectCameraPreset={sim.handleSelectCameraPreset}
        explodeFactor={sim.explodeFactor}
        onExplodeChange={sim.setExplodeFactor}
        animationSpeedMode={sim.animationSpeedMode}
        onSelectAnimationSpeedMode={sim.handleSelectAnimationSpeedMode}
        timeScale={sim.effectiveTimeScale}
        onTimeScaleChange={sim.handleManualTimeScaleChange}
        autoSloMo={sim.autoSloMo}
        autoSloMoActive={sim.autoSloMoActive}
        onToggleAutoSloMo={sim.handleToggleAutoSloMo}
        soundEnabled={sim.soundEnabled}
        onToggleSound={sim.handleToggleSound}
        onReset={sim.handleResetSystem}
      />

      <PsdLogModal
        open={sim.logModalOpen}
        entries={sim.logEntries}
        onClose={() => sim.setLogModalOpen(false)}
        onClear={sim.handleClearLogs}
      />
    </div>
  );
}
