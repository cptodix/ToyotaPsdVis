import { AutoDriveEventKind, AutoDriveMode, AutoDriveStatus } from '../types/hybrid';

export const IDLE_AUTODRIVE_STATUS: AutoDriveStatus = {
  mode: AutoDriveMode.OFF,
  eventKind: AutoDriveEventKind.NONE,
  eventBadge: '',
  contextText: '',
  targetSpeedKmh: 0,
};
