# 游脉山河 · M1 增量：地形 Worker 与缓存

> 参数面板不该在拖动时卡一下。地形网格从主线程搬进 Worker，并把结果缓存到 IndexedDB。

- 状态：已完成并部署（2026-11-03）
- 范围：合谷走廊的参数重建
- 线上：<https://yunhenk.github.io/inner-travel/>

---

## 1. 为什么拆

M0 的一次 `buildCorridor` 约 90ms，全部在主线程；拖动滑块时即使做了 120ms 防抖，重建仍会吞掉几帧。

这次拆成两层：

```text
主线程：TerrainField（很便宜）        Worker：网格 / 水面 / 属性
  ├─ 相机 pointAt / 水位              ├─ 199×123 顶点
  ├─ 标记位置                         ├─ 湿边水面
  ├─ 气路径                           ├─ wet / concavity / edge
  └─ 候气 raycast（用网格）           └─ 返回 transferable
```

`TerrainField` 的构造只是域与调色板，几乎不耗时；真正贵的是逐顶点采样与网格组装。把它放进 Worker，主线程在重建期间仍可渲染旧画面、处理输入。

---

## 2. 代码结构

| 文件 | 职责 |
| --- | --- |
| `packages/scene-gen/src/corridor/build.ts` | `buildCorridorData(field)` 只产数据；`buildCorridor(route)` 保留为同步便捷入口 |
| `apps/web/src/workers/scene-gen.worker.ts` | 接收 `{ meridian, codes, options }`，建 route/field，回传 `CorridorData` |
| `apps/web/src/scene/corridorService.ts` | 主线程服务：缓存 → Worker → 失败回退主线程 |
| `apps/web/src/scene/corridorCache.ts` | IndexedDB 读写（`meridian-drift/corridor-cache`） |
| `apps/web/src/scene/corridorProtocol.ts` | 请求/响应类型 |

### Worker 协议

```ts
interface CorridorRequest {
  id: number;
  meridian: Meridian;
  codes: string[];
  options: CorridorBuildOptions;
}
type CorridorResponse =
  | { id: number; data: CorridorData }
  | { id: number; error: string };
```

回传时把 `positions / normals / uvs / indices / wet / edge / concavity / water.*` 的 `ArrayBuffer` 放进 transfer list，避免结构化克隆的大数组拷贝。

### 主线程服务

```text
build(meridian, codes, options)
  ├─ 1. 查 IndexedDB（key = v1 + meridian JSON + codes + options 的哈希）
  ├─ 2. 命中 → 直接返回
  ├─ 3. 未命中 → Worker 生成（15s 超时）
  ├─ 4. Worker 失败/超时 → 主线程同步生成
  └─ 5. 写回 IndexedDB
```

---

## 3. 首屏异步与热启动

M0 的首屏是同步 `buildCorridor`，约 90ms；这次也改成异步：

```text
SceneHost 构造
  ├─ 建 route + TerrainField（主线程，便宜）
  ├─ 建 renderer / camera / rig / 灯光
  ├─ 启动渲染循环（此时还没有地形）
  └─ CorridorService.build() → 缓存或 Worker
        └─ 数据回来 → 建 terrain/water/body/markers/qi/press → onReady
```

- 加载遮罩由 `onReady` 控制，数据回来并完成首帧后才消失；
- 主循环在地形未就绪时只渲染纸色背景，不阻塞页面；
- 初始结果同样写入 IndexedDB，第二次进入可直接命中；
- 浏览器记住上次选的原型（`localStorage: md:archetype`），所以再次打开时通常正好命中同一份缓存。

## 4. 重建顺序

1. 滑块变化 → `SceneHost.setParams` 标记脏并递增 `rebuildToken`；
2. 静置 120ms 后在主线程建新的 `TerrainField`；
3. 向 `CorridorService` 请求网格；
4. 等待期间保留旧地形/水/气/标记，画面不中断；
5. 结果回来时校验 token（期间参数又变则丢弃），然后一次性替换图层、重绑相机 field；
6. 结果写入缓存。

---

## 5. 验证

| 项 | 结果 |
| --- | --- |
| `pnpm typecheck` | 通过 |
| `pnpm test` | 28 项通过（新增「纯数据构建与完整构建一致」） |
| `pnpm build` | 通过；产出 `scene-gen.worker-*.js`（约 70KB） |
| 生产子路径 | 用 `/inner-travel/` 构建并静态服务，Worker 正常加载、无 404 |
| 首屏异步 | `getTriangleCount()` 从 0 变为 50968，onReady 后遮罩消失 |
| 缓存 | 首次访问写入，IndexedDB 条目随原型切换增长（实测 2–3 条） |
| 浏览器探针 | `worker: true`，IndexedDB 条目随原型切换增长 |
| 回退 | Worker 失败时走主线程 `buildCorridor`，功能不丢 |

---

## 6. 已知取舍

- 首次访问仍需等待一次 Worker 生成（约 100ms），期间是空场景 + 加载遮罩；之后命中缓存。
- 缓存没有容量上限与 LRU 清理；条目是约 1MB 的 TypedArray，长期使用需要加 prune。
- 缓存 key 含 `CACHE_VERSION` 与 meridian JSON 哈希；改 schema 或内容结构时要手动 bump 版本。
- Worker 与主线程各建一次 `TerrainField`；这是刻意换来的简单性，field 本身很便宜。
- 没有重建进度 UI；旧画面一直保留到新数据 ready，这通常比进度条更好。
- Safari 旧版本对 module worker 支持有限，失败会自动回退主线程。

---

## 7. 下一步

- 首屏异步化 + 缓存预热（打开上次的 seed/原型）；
- Worker 进度事件与骨架过渡；
- DOF / Ink 后处理；
- GLB 手部与 20 穴。

---

## 8. 相关文档

- [设计文档](01-设计文档.md)
- [实现架构](02-实现架构.md)
- [取象词典](03-取象词典.md)
- [M0 实现说明](04-M0实现说明.md)
- [代码目录说明](05-代码目录说明.md)
- [M1：气、象卡与候气](06-M1-气与象卡.md)
- [M1：逐穴巡游](07-M1-逐穴巡游.md)
- [M1：场景原型](08-M1-场景原型.md)
- [README](../README.md)
