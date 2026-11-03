import { assign, createMachine } from 'xstate';

/** 走廊内可停靠的三站；商阳/曲池在走廊外，暂不参与逐穴巡游 */
export const TOUR_STOPS = ['LI3', 'LI4', 'LI5'] as const;
export type TourStop = (typeof TOUR_STOPS)[number];

export type TourStateName = 'idle' | 'moving' | 'holding' | 'finished';

interface TourContext {
  index: number;
}

export type TourEvent =
  | { type: 'START' }
  | { type: 'STOP' }
  | { type: 'ARRIVED' }
  | { type: 'SELECT'; index: number };

const HOLD_MS = 3600;

/**
 * 逐穴巡游状态机：
 *
 *   idle ──START/SELECT──► moving ──ARRIVED──► holding
 *                            ▲                   │ after 3.6s（还有下一站）
 *                            └───────────────────┘
 *   holding（最后一站）──after──► finished
 *   任意状态 ──STOP──► idle
 *
 * 相机是否到达由 SceneHost 的 onTourArrive 事件驱动，状态机只负责顺序与停留。
 */
export const tourMachine = createMachine({
  id: 'tour',
  initial: 'idle',
  types: {} as { context: TourContext; events: TourEvent },
  context: { index: 0 },
  states: {
    idle: {
      on: {
        START: { target: 'moving', actions: assign({ index: 0 }) },
        SELECT: {
          target: 'moving',
          actions: assign({ index: ({ event }) => event.index }),
        },
      },
    },
    moving: {
      on: {
        ARRIVED: 'holding',
        STOP: 'idle',
        SELECT: {
          target: 'moving',
          actions: assign({ index: ({ event }) => event.index }),
        },
      },
    },
    holding: {
      after: {
        [HOLD_MS]: [
          {
            guard: ({ context }) => context.index < TOUR_STOPS.length - 1,
            target: 'moving',
            actions: assign({ index: ({ context }) => context.index + 1 }),
          },
          { target: 'finished' },
        ],
      },
      on: {
        STOP: 'idle',
        SELECT: {
          target: 'moving',
          actions: assign({ index: ({ event }) => event.index }),
        },
      },
    },
    finished: {
      on: {
        START: { target: 'moving', actions: assign({ index: 0 }) },
        SELECT: {
          target: 'moving',
          actions: assign({ index: ({ event }) => event.index }),
        },
        STOP: 'idle',
      },
    },
  },
});
