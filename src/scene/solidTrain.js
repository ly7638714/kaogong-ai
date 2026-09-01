// ===== 立体图推 · 3D 引擎与训练题库（v2.3 增强版） =====
// 拆分说明：原 solidTrain.js（1408 行）已按《22_6B剩余拆分交接手册》拆为 src/scene/solid/ 六模块，
// 本文件仅作 re-export 转发层，保持外部 import 路径（如 `../scene/solidTrain`）完全不变。
// 支持：参数化基础立体 / 复杂体素组合立体（小正方体自由拼搭）/ 三视图自动生成 / 展开图折叠动画
// 参考 OpenFold (https://github.com/paladini/OpenFold, MIT)：展开图折叠映射与“枢轴组”折叠动画思路
export * from './solid/three.js'
export * from './solid/voxel.js'
export * from './solid/solids.js'
export * from './solid/nets.js'
export * from './solid/slice.js'
export * from './solid/quizData.js'
