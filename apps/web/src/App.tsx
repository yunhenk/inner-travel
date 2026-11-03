import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useActor } from '@xstate/react';
import { findPoint, parseMeridian } from '@inner/core';
import type { ViewMode } from '@inner/render';
import { ARCHETYPE_OPTIONS, type ArchetypeChoice } from '@inner/scene-gen';
import { TOUR_STOPS, tourMachine, type TourStateName } from './journey/tourMachine.js';
import meridianJson from '../../../content/meridians/hand-yangming-large-intestine.json';
import { SceneHost } from './scene/SceneHost.js';
import type { SceneParams, SceneVisibility } from './scene/SceneHost.js';
import { Panel } from './ui/Panel.js';

const DEFAULT_PARAMS: SceneParams = {
  valleyDepth: 1,
  riverWidth: 1,
  relief: 1,
  fogDensity: 7,
  archetype: 'auto',
};

function parseArchetype(value: string | null): ArchetypeChoice {
  return ARCHETYPE_OPTIONS.some((option) => option.id === value)
    ? (value as ArchetypeChoice)
    : 'auto';
}

function storedArchetype(): ArchetypeChoice {
  try {
    const value = localStorage.getItem('md:archetype');
    if (ARCHETYPE_OPTIONS.some((option) => option.id === value)) {
      return value as ArchetypeChoice;
    }
  } catch {
    // localStorage 不可用时用默认
  }
  return 'auto';
}

const DEFAULT_VISIBILITY: SceneVisibility = {
  terrain: true,
  water: true,
  body: false,
  ink: true,
  qi: true,
  mist: true,
  markers: true,
  labels: false,
};

function parseMode(value: string | null): ViewMode {
  return value === 'fly' || value === 'dwell' ? value : 'observe';
}

function parseNumber(value: string | null, fallback: number): number {
  if (value === null || value.trim() === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function App() {
  const query = useMemo(() => new URLSearchParams(window.location.search), []);
  const meridian = useMemo(() => parseMeridian(meridianJson), []);
  const [activeCode, setActiveCode] = useState('LI4');
  const master = useMemo(() => findPoint(meridian, activeCode), [meridian, activeCode]);
  const hideUi = query.get('ui') === '0';

  const [tourSnapshot, sendTour] = useActor(tourMachine);
  const tourState = tourSnapshot.value as TourStateName;
  const tourIndex = tourSnapshot.context.index;
  const tourStops = useMemo(
    () => TOUR_STOPS.map((code) => findPoint(meridian, code)),
    [meridian],
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<SceneHost | null>(null);

  const [mode, setMode] = useState<ViewMode>(() => parseMode(query.get('mode')));
  const [params, setParams] = useState<SceneParams>(() => ({
    valleyDepth: parseNumber(query.get('valley'), DEFAULT_PARAMS.valleyDepth),
    riverWidth: parseNumber(query.get('river'), DEFAULT_PARAMS.riverWidth),
    relief: parseNumber(query.get('relief'), DEFAULT_PARAMS.relief),
    fogDensity: parseNumber(query.get('fog'), DEFAULT_PARAMS.fogDensity),
    archetype: query.has('archetype')
      ? parseArchetype(query.get('archetype'))
      : storedArchetype(),
  }));
  const [visibility, setVisibility] = useState<SceneVisibility>(() => ({
    ...DEFAULT_VISIBILITY,
    labels: query.get('labels') === '1',
    body: query.get('body') === '1',
    qi: query.get('qi') !== '0',
    mist: query.get('mist') !== '0',
  }));
  const [fps, setFps] = useState(0);
  const [triangles, setTriangles] = useState(0);
  const [ready, setReady] = useState(false);
  const [pressing, setPressing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let host: SceneHost | null = null;
    try {
      host = new SceneHost(container, {
        meridian,
        mode,
        params,
        visibility,
        onStats: setFps,
        onReady: () => {
          setReady(true);
          setTriangles(hostRef.current?.getTriangleCount() ?? 0);
        },
        onStopChange: setActiveCode,
        onPressChange: setPressing,
        onTourArrive: () => sendTour({ type: 'ARRIVED' }),
      });
      hostRef.current = host;
      setTriangles(host.getTriangleCount());
    } catch (cause) {
      console.error(cause);
      setError('无法初始化 WebGL。请使用支持 WebGL2 的桌面浏览器打开。');
    }
    return () => {
      host?.dispose();
      hostRef.current = null;
    };
    // 场景只创建一次，后续通过 setter 更新
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meridian]);

  useEffect(() => {
    hostRef.current?.setMode(mode);
  }, [mode]);

  useEffect(() => {
    hostRef.current?.setParams(params);
  }, [params]);

  useEffect(() => {
    hostRef.current?.setVisibility(visibility);
  }, [visibility]);

  useEffect(() => {
    try {
      localStorage.setItem('md:archetype', params.archetype);
    } catch {
      // 忽略隐私模式下的写入失败
    }
  }, [params.archetype]);

  const handleReset = useCallback(() => {
    hostRef.current?.resetCamera();
  }, []);

  useEffect(() => {
    if (tourState === 'moving') {
      hostRef.current?.goToStop(TOUR_STOPS[tourIndex]!);
    }
  }, [tourState, tourIndex]);

  const handleMode = useCallback(
    (next: ViewMode) => {
      if (tourState !== 'idle') {
        sendTour({ type: 'STOP' });
        hostRef.current?.stopTour();
      }
      setMode(next);
    },
    [sendTour, tourState],
  );

  const handleTourStart = useCallback(() => {
    if (tourState === 'moving' || tourState === 'holding') {
      sendTour({ type: 'STOP' });
      hostRef.current?.stopTour();
      setMode('observe');
      return;
    }
    setMode('fly');
    hostRef.current?.startTour();
    sendTour({ type: 'START' });
  }, [sendTour, tourState]);

  const handleTourSelect = useCallback(
    (index: number) => {
      if (tourState === 'idle' || tourState === 'finished') {
        setMode('fly');
        hostRef.current?.startTour();
      }
      sendTour({ type: 'SELECT', index });
    },
    [sendTour, tourState],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (event.key === '1') handleMode('observe');
      else if (event.key === '2') handleMode('fly');
      else if (event.key === '3') handleMode('dwell');
      else if (event.key.toLowerCase() === 'r') hostRef.current?.resetCamera();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleMode]);

  return (
    <div className={hideUi ? 'app app-bare' : 'app'}>
      <div ref={containerRef} className="canvas-host" />

      <div className="paper-grain" aria-hidden="true" />
      <div className="vignette" aria-hidden="true" />

      {!hideUi && (
        <>
          <header className="brand">
            <div className="brand-mark" aria-hidden="true">
              游
            </div>
            <div>
              <h1>游脉山河</h1>
              <p>
                Meridian Drift <span className="dot">·</span> 合谷
              </p>
            </div>
            <span className="stage-pill">M0</span>
          </header>

          <Panel
            mode={mode}
            params={params}
            visibility={visibility}
            fps={fps}
            triangles={triangles}
            master={master}
            tourState={tourState}
            tourIndex={tourIndex}
            tourStops={tourStops}
            onMode={handleMode}
            onTourStart={handleTourStart}
            onTourSelect={handleTourSelect}
            onParams={(next) => setParams((prev) => ({ ...prev, ...next }))}
            onVisibility={(next) => setVisibility((prev) => ({ ...prev, ...next }))}
            onReset={handleReset}
          />

          <div className={pressing ? 'press-badge active' : 'press-badge'} aria-hidden={!pressing}>
            <span className="press-dot" />
            候气 · 气聚于谷
          </div>

          <footer className="hint" aria-hidden="true">
            <span>拖动环视 · 滚轮远近 · 按住地面候气</span>
            <span className="sep">/</span>
            <span>1 观 · 2 游 · 3 驻 · R 复位</span>
          </footer>
        </>
      )}

      <div className={ready ? 'loading hidden' : 'loading'} aria-hidden={ready}>
        <div className="loading-mark">气</div>
        <p>正在立象…</p>
      </div>

      {error && (
        <div className="error" role="alert">
          <h2>场景未能点亮</h2>
          <p>{error}</p>
        </div>
      )}
    </div>
  );
}
