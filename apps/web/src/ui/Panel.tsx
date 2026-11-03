import type { ViewMode } from '@inner/render';
import type { SceneParams, SceneVisibility } from '../scene/SceneHost.js';
import type { Acupoint } from '@inner/core';

const TAGLINES: Record<string, string> = {
  LI1: '一线初泉',
  LI3: '碎石浅溪',
  LI4: '两山相合，众水归谷',
  LI5: '两筋如峡',
  LI11: '大河回旋',
};

const MODES: Array<{ id: ViewMode; label: string; hint: string }> = [
  { id: 'observe', label: '观', hint: '自由环视' },
  { id: 'fly', label: '游', hint: '贴谷飞行' },
  { id: 'dwell', label: '驻', hint: '停驻合谷' },
];

export interface PanelProps {
  mode: ViewMode;
  params: SceneParams;
  visibility: SceneVisibility;
  fps: number;
  triangles: number;
  master: Acupoint;
  onMode(mode: ViewMode): void;
  onParams(params: Partial<SceneParams>): void;
  onVisibility(visibility: Partial<SceneVisibility>): void;
  onReset(): void;
}

export function Panel(props: PanelProps) {
  const { mode, params, visibility, fps, triangles, master } = props;
  const text = master.text;

  return (
    <aside className="panel" aria-label="场景控制">
      <header className="panel-head">
        <span className="eyebrow">手阳明大肠经 · 金</span>
        <h2>
          {master.name} <span className="code">{master.code}</span>
        </h2>
        <p className="tagline">{TAGLINES[master.code] ?? master.text.sceneCue}</p>
      </header>

      <section className="panel-section">
        <h3>三境</h3>
        <div className="segmented" role="group" aria-label="巡游方式">
          {MODES.map((item) => (
            <button
              key={item.id}
              type="button"
              className={mode === item.id ? 'segment active' : 'segment'}
              aria-pressed={mode === item.id}
              onClick={() => props.onMode(item.id)}
              title={item.hint}
            >
              <span className="segment-label">{item.label}</span>
              <span className="segment-hint">{item.hint}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="panel-section">
        <h3>地形</h3>
        <Slider
          label="谷深"
          value={params.valleyDepth}
          min={0.4}
          max={1.8}
          step={0.05}
          format={(v) => `${(v * 2.6).toFixed(1)} mm`}
          onChange={(v) => props.onParams({ valleyDepth: v })}
        />
        <Slider
          label="河宽"
          value={params.riverWidth}
          min={0.5}
          max={1.8}
          step={0.05}
          format={(v) => `${(v * 1.45).toFixed(1)} mm`}
          onChange={(v) => props.onParams({ riverWidth: v })}
        />
        <Slider
          label="位移"
          value={params.relief}
          min={0.6}
          max={1.4}
          step={0.05}
          format={(v) => `${v.toFixed(2)}×`}
          onChange={(v) => props.onParams({ relief: v })}
        />
        <Slider
          label="雾"
          value={params.fogDensity}
          min={6}
          max={34}
          step={1}
          format={(v) => v.toFixed(0)}
          onChange={(v) => props.onParams({ fogDensity: v })}
        />
      </section>

      <section className="panel-section">
        <h3>图层</h3>
        <div className="toggles">
          <Toggle
            label="地形"
            checked={visibility.terrain}
            onChange={(v) => props.onVisibility({ terrain: v })}
          />
          <Toggle
            label="水"
            checked={visibility.water}
            onChange={(v) => props.onVisibility({ water: v })}
          />
          <Toggle
            label="气"
            checked={visibility.qi}
            onChange={(v) => props.onVisibility({ qi: v })}
          />
          <Toggle
            label="身体"
            checked={visibility.body}
            onChange={(v) => props.onVisibility({ body: v })}
          />
          <Toggle
            label="雾"
            checked={visibility.mist}
            onChange={(v) => props.onVisibility({ mist: v })}
          />
          <Toggle
            label="穴位"
            checked={visibility.markers}
            onChange={(v) => props.onVisibility({ markers: v })}
          />
          <Toggle
            label="标签"
            checked={visibility.labels}
            onChange={(v) => props.onVisibility({ labels: v })}
          />
        </div>
      </section>

      <details className="card" open>
        <summary>
          <span>象卡</span>
          <span className="summary-hint">字 · 象 · 气</span>
        </summary>
        <div className="card-body">
          <p className="card-label">字解</p>
          <p>{text.literal}</p>
          <p className="card-label">象</p>
          <p>{text.imagery}</p>
          <p className="card-label">气</p>
          <p>{text.qi}</p>
          {text.function && (
            <>
              <p className="card-label">传统功用</p>
              <p className="muted">{text.function}</p>
            </>
          )}
          {text.classics.length > 0 && (
            <ul className="classics">
              {text.classics.map((classic) => (
                <li key={classic.source}>
                  <span>{classic.source}</span>
                  {classic.note ? <em>{classic.note}</em> : null}
                </li>
              ))}
            </ul>
          )}
          <p className="disclaimer">传统理论中的说法，仅作文化展示，不构成医疗建议。</p>
        </div>
      </details>

      <footer className="panel-foot">
        <span>{fps} fps</span>
        <span>{formatCount(triangles)} 三角面</span>
        <button type="button" className="ghost" onClick={props.onReset}>
          复位视角
        </button>
      </footer>
    </aside>
  );
}

function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format(value: number): string;
  onChange(value: number): void;
}) {
  return (
    <label className="slider">
      <span className="slider-row">
        <span>{props.label}</span>
        <span className="value">{props.format(props.value)}</span>
      </span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(event) => props.onChange(Number(event.target.value))}
      />
    </label>
  );
}

function Toggle(props: {
  label: string;
  checked: boolean;
  onChange(value: boolean): void;
}) {
  return (
    <label className="toggle">
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(event) => props.onChange(event.target.checked)}
      />
      <span>{props.label}</span>
    </label>
  );
}

function formatCount(value: number): string {
  if (value >= 10000) return `${(value / 10000).toFixed(1)} 万`;
  return value.toLocaleString('zh-CN');
}
