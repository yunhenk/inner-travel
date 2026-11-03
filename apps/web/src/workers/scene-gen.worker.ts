/// <reference lib="webworker" />

import { buildRoute } from '@inner/core';
import { TerrainField, buildCorridorData, type CorridorData } from '@inner/scene-gen';
import type { CorridorRequest, CorridorResponse } from '../scene/corridorProtocol.js';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (event: MessageEvent<CorridorRequest>) => {
  const { id, meridian, codes, options } = event.data;
  try {
    const route = buildRoute(meridian, [...codes]);
    const field = new TerrainField(route, options);
    const data = buildCorridorData(field, options);
    const response: CorridorResponse = { id, data };
    ctx.postMessage(response, collectBuffers(data));
  } catch (error) {
    const response: CorridorResponse = {
      id,
      error: error instanceof Error ? error.message : String(error),
    };
    ctx.postMessage(response);
  }
};

function collectBuffers(data: CorridorData): Transferable[] {
  return [
    data.terrain.positions.buffer,
    data.terrain.normals.buffer,
    data.terrain.uvs.buffer,
    data.terrain.indices.buffer,
    data.wet.buffer,
    data.edge.buffer,
    data.concavity.buffer,
    data.water.river.positions.buffer,
    data.water.river.normals.buffer,
    data.water.river.uvs.buffer,
    data.water.river.indices.buffer,
    data.water.pool.positions.buffer,
    data.water.pool.normals.buffer,
    data.water.pool.uvs.buffer,
    data.water.pool.indices.buffer,
  ];
}
