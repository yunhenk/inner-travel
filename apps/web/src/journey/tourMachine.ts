import { assign, createMachine } from 'xstate';

/** 走廊内可停靠的三站；商阳/曲池在走廊外，暂不参与逐穴巡游 */
export const TOUR_STOPS = ['LI3', 'LI4', 'LI5'] as const;
export type TourStop = (typeof TOUR_STOPS)[number];

export type TourStateName = 'idle' | 'moving' | 'holding' | 'finished';

interface TourContext {
  index: number;
  total: number;
}

export type TourEvent =
  | { type: 'START'; total?: number }
  | { type: 'STOP' }
  | { type: 'ARRIVED' }
  | { type: 'SELECT'; index: number; total?: number };

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
  context: { index: 0, total: TOUR_STOPS.length },
  states: {
    idle: {
      on: {
        START: {
          target: 'moving',
          actions: assign({
            index: 0,
            total: ({ event }) => event.total ?? TOUR_STOPS.length,
          }),
        },
        SELECT: {
          target: 'moving',
          actions: assign({
            index: ({ event }) => event.index,
            total: ({ event }) => event.total ?? TOUR_STOPS.length,
          }),
        },
      },
    },
    moving: {
      on: {
        ARRIVED: 'holding',
        STOP: 'idle',
        SELECT: {
          target: 'moving',
          actions: assign({
            index: ({ event }) => event.index,
            total: ({ event }) => event.total ?? TOUR_STOPS.length,
          }),
        },
      },
    },
    holding: {
      after: {
        [HOLD_MS]: [
          {
            guard: ({ context }) => context.index < context.total - 1,
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
          actions: assign({
            index: ({ event }) => event.index,
            total: ({ event }) => event.total ?? TOUR_STOPS.length,
          }),
        },
      },
    },
    finished: {
      on: {
        START: {
          target: 'moving',
          actions: assign({
            index: 0,
            total: ({ event }) => event.total ?? TOUR_STOPS.length,
          }),
        },
        SELECT: {
          target: 'moving',
          actions: assign({
            index: ({ event }) => event.index,
            total: ({ event }) => event.total ?? TOUR_STOPS.length,
          }),
        },
        STOP: 'idle',
      },
    },
  },
});
