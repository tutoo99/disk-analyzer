# disk-analyzer

macOS 磁盘空间分析与清理建议工具。扫描开发环境常见的缓存、构建产物、包管理器缓存等目录，给出可视化报告和一键清理命令。

## 特性

- 扫描 12 类常见磁盘占用：npm/pnpm/yarn 缓存、系统应用缓存、uv/pip 缓存、HuggingFace 模型、Docker、node_modules、Miniconda、下载目录、废纸篓等
- 按风险等级分级：SAFE / WARN / DANGER / CHECK
- 彩色终端报告，含进度条和占比
- JSON 输出模式，方便脚本集成

## 安装

```bash
git clone git@github.com:tutoo99/disk-analyzer.git
cd disk-analyzer
npm link
```

## 使用

```bash
# 方式一：全局链接后直接使用（推荐日常使用）
npm link
disk-analyzer
disk-analyzer --detail
disk-analyzer --safe-only
disk-analyzer --json

# 方式二：不安装，直接运行
node index.js
node index.js --detail

# 方式三：npx 临时运行
npx disk-analyzer
```

## 示例输出

```
══════════════════════════════════════════════════
          磁盘空间分析报告
══════════════════════════════════════════════════

  磁盘总容量:  500.0 GB
  已使用:      420.5 GB  (84.1%)
  可用空间:    79.5 GB  (15.9%)

  ████████████████████░░░░ 84.1% used

──────────────────────────────────────────────────
  可清理空间分析 (按大小排序)
──────────────────────────────────────────────────

  SAFE   npm 缓存
          npm 下载的包缓存，删除后下次 install 会重新下载
          总计: 2.3 GB  (15.2% 可回收)
          ~/.npm (全局缓存) 1.8 GB  |  pnpm 缓存 500.0 MB
          清理: npm cache clean --force

  WARN   HuggingFace 模型缓存
          下载的 AI 模型文件，删除后需要重新下载（按需保留）
          总计: 5.1 GB  (33.8% 可回收)

  ...
```

## 风险等级

| 等级 | 含义 |
|------|------|
| SAFE | 随时可删，无副作用 |
| WARN | 可删，但删后某些功能需重新下载 |
| DANGER | 慎重，删除前确认不再需要 |
| CHECK | 需手动检查后决定 |

## 要求

- macOS
- Node.js >= 18

## License

MIT
