import type { Meridian } from '@inner/core';
import type { CorridorBuildOptions, CorridorData } from '@inner/scene-gen';

export interface CorridorRequest {
  id: number;
  meridian: Meridian;
  codes: readonly string[];
  options: CorridorBuildOptions;
}

export type CorridorResponse =
  | { id: number; data: CorridorData; error?: undefined }
  | { id: number; data?: undefined; error: string };
