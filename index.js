#!/usr/bin/env node

import { execSync } from 'child_process';
import { existsSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { homedir, tmpdir, platform } from 'os';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOME = homedir();
const IS_MAC = platform() === 'darwin';

// ── 颜色 ──
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

function color(text, c) {
  return `${c}${text}${C.reset}`;
}

function bold(text) { return color(text, C.bold); }
function red(text) { return color(text, C.red); }
function green(text) { return color(text, C.green); }
function yellow(text) { return color(text, C.yellow); }
function blue(text) { return color(text, C.blue); }
function dim(text) { return color(text, C.dim); }
function cyan(text) { return color(text, C.cyan); }
function magenta(text) { return color(text, C.magenta); }
function gray(text) { return color(text, C.gray); }

// ── 工具函数 ──
function duSh(path) {
  try {
    if (!existsSync(path)) return 0;
    const out = execSync(`du -sk "${path}" 2>/dev/null`, {
      encoding: 'utf8', timeout: 10000
    });
    return parseInt(out.split('\t')[0], 10) * 1024; // KB -> bytes
  } catch {
    return 0;
  }
}

function duShTop(path, n = 5) {
  try {
    if (!existsSync(path)) return [];
    const out = execSync(`du -sk "${path}"/* 2>/dev/null | sort -rn | head -${n}`, {
      encoding: 'utf8', timeout: 10000
    });
    return out.trim().split('\n').filter(Boolean).map(line => {
      const [size, name] = line.split('\t');
      return { size: parseInt(size, 10) * 1024, name };
    });
  } catch {
    return [];
  }
}

function fmt(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = (bytes / Math.pow(1024, i)).toFixed(1);
  return `${val} ${units[i]}`;
}

function bar(bytes, maxBytes, width = 20) {
  const ratio = Math.min(bytes / maxBytes, 1);
  const filled = Math.round(ratio * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function exists(path) { return existsSync(path); }

// ── 清理建议定义 ──
function getCategories() {
  const cats = [];

  // 1. npm cache
  cats.push({
    label: 'npm 缓存',
    risk: 'safe',
    description: 'npm 下载的包缓存，删除后下次 install 会重新下载',
    paths: [
      { path: join(HOME, '.npm'), label: '~/.npm (全局缓存)' },
      { path: join(HOME, 'Library', 'Caches', 'pnpm'), label: 'pnpm 缓存' },
      { path: join(HOME, 'Library', 'Caches', 'Yarn'), label: 'Yarn 缓存' },
    ],
    cleanCmd: 'npm cache clean --force',
    detail: 'npm cache clean --force; rm -rf ~/Library/Caches/pnpm',
  });

  // 2. Library/Caches
  cats.push({
    label: '系统应用缓存',
    risk: 'safe',
    description: 'macOS 应用缓存目录，清理后应用会自动重建',
    paths: [
      { path: join(HOME, 'Library', 'Caches'), label: '~/Library/Caches' },
    ],
    subPaths: () => {
      const known = {
        'pip': 'pip 缓存',
        'ms-playwright': 'Playwright 浏览器',
        'ms-playwright-go': 'Playwright Go',
        'JetBrains': 'JetBrains IDE 缓存',
        'Homebrew': 'Homebrew 下载缓存',
        'Google': 'Chrome 缓存',
        'pnpm': 'pnpm store',
        'remixdesktop-updater': 'Remix Desktop 更新',
        'bruno-updater': 'Bruno 更新',
        'hardhat-nodejs': 'Hardhat 节点缓存',
        'cherrystudio-updater': 'CherryStudio 更新',
      };
      return Object.entries(known).map(([dir, label]) => ({
        path: join(HOME, 'Library', 'Caches', dir),
        label,
      }));
    },
    cleanCmd: 'rm -rf ~/Library/Caches/*',
    detail: '全部清理: rm -rf ~/Library/Caches/*\n安全，应用会自动重建缓存',
  });

  // 3. uv cache (Python)
  cats.push({
    label: 'uv (Python) 缓存',
    risk: 'safe',
    description: 'uv 包管理器缓存，删除后下次安装重新下载',
    paths: [
      { path: join(HOME, '.cache', 'uv'), label: '~/.cache/uv' },
    ],
    cleanCmd: 'uv cache clean',
    detail: 'uv cache clean',
  });

  // 4. HuggingFace 模型缓存
  cats.push({
    label: 'HuggingFace 模型缓存',
    risk: 'warn',
    description: '下载的 AI 模型文件，删除后需要重新下载（按需保留）',
    paths: [
      { path: join(HOME, '.cache', 'huggingface'), label: '~/.cache/huggingface' },
    ],
    cleanCmd: 'rm -rf ~/.cache/huggingface/hub/*',
    detail: '全部清理: rm -rf ~/.cache/huggingface/hub/*\n⚠️  清理后需要重新下载模型',
  });

  // 5. Docker
  cats.push({
    label: 'Docker 镜像/容器',
    risk: 'warn',
    description: '未使用的 Docker 镜像、停止的容器、构建缓存',
    paths: [], // 动态获取
    dynamicSize: () => {
      try {
        const out = execSync('docker system df 2>/dev/null', { encoding: 'utf8', timeout: 10000 });
        // parse reclaimable
        const lines = out.split('\n');
        let reclaimable = 0;
        for (const line of lines) {
          const match = line.match(/(\d+\.?\d*\s*\w+GB?)\s*\(\d+%\)/);
          if (match) {
            const val = parseFloat(match[1]);
            if (match[1].includes('GB')) reclaimable += val * 1024 * 1024 * 1024;
            else if (match[1].includes('MB')) reclaimable += val * 1024 * 1024;
          }
        }
        return reclaimable;
      } catch { return 0; }
    },
    cleanCmd: 'docker system prune -a --volumes',
    detail: 'docker system prune -a --volumes\n⚠️  会删除所有未使用的镜像/容器/卷\n温和版: docker system prune (只清理悬空资源)',
  });

  // 6. 应用数据 - 大户
  cats.push({
    label: '应用数据大户',
    risk: 'warn',
    description: '应用存储的缓存/数据，部分可安全清理',
    paths: [
      { path: join(HOME, 'Library', 'Application Support', 'com.panda-player.app', 'cache'), label: 'Panda Player 缓存' },
      { path: join(HOME, 'Library', 'Application Support', 'Tabbit Browser'), label: 'Tabbit Browser 数据' },
      { path: join(HOME, 'Library', 'Application Support', 'bilibili'), label: 'Bilibili 缓存' },
    ],
    cleanCmd: null,
    detail: 'Panda Player 缓存: rm -rf ~/Library/Application\\ Support/com.panda-player.app/cache/*\nTabbit Browser: 在应用内设置清理\nBilibili: 在应用内设置清理',
  });

  // 7. node_modules (散落)
  cats.push({
    label: '散落的 node_modules',
    risk: 'warn',
    description: '非活跃项目的 node_modules，重新 npm install 即可恢复',
    paths: [], // 动态扫描
    dynamicPaths: () => {
      try {
        const out = execSync(
          `find "${HOME}" -maxdepth 4 -name "node_modules" -type d -prune 2>/dev/null | head -25`,
          { encoding: 'utf8', timeout: 30000 }
        );
        return out.trim().split('\n').filter(Boolean).map(p => ({
          path: p,
          label: p.replace(HOME, '~'),
        }));
      } catch { return []; }
    },
    cleanCmd: null,
    detail: '找到后逐个清理: rm -rf <path>/node_modules\n保留正在使用的项目目录',
  });

  // 8. miniconda
  cats.push({
    label: 'Miniconda 环境',
    risk: 'danger',
    description: 'Python conda 环境，清理不用的环境可释放大量空间',
    paths: [
      { path: '/opt/miniconda3', label: '/opt/miniconda3 (全部)' },
      { path: join(HOME, 'miniconda3'), label: '~/miniconda3' },
      { path: join(HOME, 'anaconda3'), label: '~/anaconda3' },
    ],
    cleanCmd: null,
    detail: '查看所有环境: conda env list\n删除指定环境: conda env remove -n <name>\n清理缓存: conda clean --all\n⚠️  不要删除 base 环境',
  });

  // 9. Hermes
  cats.push({
    label: 'Hermes 数据',
    risk: 'danger',
    description: 'AI Agent 的工作数据，包含模型检查点和技能文件',
    paths: [
      { path: join(HOME, '.hermes', 'checkpoints'), label: '~/.hermes/checkpoints (模型检查点)' },
      { path: join(HOME, '.hermes', 'skills'), label: '~/.hermes/skills (技能文件)' },
      { path: join(HOME, '.hermes', 'hermes-agent'), label: '~/.hermes/hermes-agent (agent代码)' },
      { path: join(HOME, '.hermes', 'sessions'), label: '~/.hermes/sessions (会话记录)' },
    ],
    cleanCmd: null,
    detail: 'checkpoints: rm -rf ~/.hermes/checkpoints/*\nsessions(旧): rm -rf ~/.hermes/sessions/*\n⚠️  skills 和 agent 是核心数据，不建议删除',
  });

  // 10. .cache 其他
  cats.push({
    label: '~/.cache 其他缓存',
    risk: 'safe',
    description: '各种工具的缓存文件',
    paths: [
      { path: join(HOME, '.cache', 'chrome-devtools-mcp'), label: 'Chrome DevTools MCP' },
      { path: join(HOME, '.cache', 'puppeteer'), label: 'Puppeteer' },
      { path: join(HOME, '.cache', 'whisper'), label: 'Whisper 模型' },
      { path: join(HOME, '.cache', 'prisma'), label: 'Prisma 引擎' },
    ],
    cleanCmd: 'rm -rf ~/.cache/chrome-devtools-mcp ~/.cache/puppeteer ~/.cache/whisper ~/.cache/prisma',
    detail: '按需清理，删除后对应工具会自动重新下载',
  });

  // 11. Downloads
  cats.push({
    label: 'Downloads 目录',
    risk: 'check',
    description: '下载目录，可能有已安装/过期的安装包',
    paths: [
      { path: join(HOME, 'Downloads'), label: '~/Downloads' },
    ],
    cleanCmd: null,
    detail: '手动检查: ls -lhS ~/Downloads | head -20\n删除不需要的安装包和旧文件',
  });

  // 12. Trash
  cats.push({
    label: '废纸篓',
    risk: 'safe',
    description: '已删除但未清空的文件',
    paths: [
      { path: join(HOME, '.Trash'), label: '~/.Trash' },
    ],
    cleanCmd: 'rm -rf ~/.Trash/*',
    detail: '清空废纸篓: rm -rf ~/.Trash/*',
  });

  return cats;
}

// ── 风险标签 ──
function riskBadge(risk) {
  switch (risk) {
    case 'safe': return green('  SAFE  ');
    case 'warn': return yellow('  WARN  ');
    case 'danger': return red(' DANGER ');
    case 'check': return cyan(' CHECK  ');
    default: return gray('  ???   ');
  }
}

function riskDesc(risk) {
  switch (risk) {
    case 'safe': return '随时可删，无副作用';
    case 'warn': return '可删但需注意，删后可能需重新下载';
    case 'danger': return '慎重！删除前确认不再需要';
    case 'check': return '需手动检查后决定';
    default: return '';
  }
}

// ── 主流程 ──
function main() {
  const args = process.argv.slice(2);
  const showDetail = args.includes('--detail') || args.includes('-d');
  const onlySafe = args.includes('--safe-only') || args.includes('-s');
  const json = args.includes('--json') || args.includes('-j');

  // 磁盘总览
  let diskTotal = 0, diskUsed = 0, diskAvail = 0;
  try {
    const df = execSync('df -k /', { encoding: 'utf8' });
    const [, , used, avail] = df.split('\n')[1].split(/\s+/);
    diskUsed = parseInt(used) * 1024;
    diskAvail = parseInt(avail) * 1024;
    diskTotal = diskUsed + diskAvail;
  } catch {}

  const categories = getCategories();

  // 计算每项大小
  for (const cat of categories) {
    cat.totalSize = 0;
    cat.items = [];

    // 静态路径
    if (cat.paths) {
      for (const p of cat.paths) {
        const size = duSh(p.path);
        if (size > 0) {
          cat.totalSize += size;
          cat.items.push({ ...p, size });
        }
      }
    }

    // 动态子路径
    if (cat.subPaths) {
      for (const p of cat.subPaths()) {
        const size = duSh(p.path);
        if (size > 0) {
          cat.totalSize += size;
          cat.items.push({ ...p, size });
        }
      }
    }

    // 动态路径 (node_modules 等)
    if (cat.dynamicPaths) {
      for (const p of cat.dynamicPaths()) {
        const size = duSh(p.path);
        if (size > 0) {
          cat.totalSize += size;
          cat.items.push({ ...p, size });
        }
      }
    }

    // 动态大小 (docker)
    if (cat.dynamicSize) {
      const size = cat.dynamicSize();
      if (size > 0) {
        cat.totalSize = size;
        cat.items.push({ label: '可回收空间', path: 'docker', size });
      }
    }
  }

  // 过滤
  let filtered = categories.filter(c => c.totalSize > 1024 * 1024); // > 1MB
  if (onlySafe) filtered = filtered.filter(c => c.risk === 'safe');

  // 排序
  filtered.sort((a, b) => b.totalSize - a.totalSize);

  // 总可回收
  const totalReclaimable = filtered.reduce((s, c) => s + c.totalSize, 0);

  // ── JSON 模式 ──
  if (json) {
    const output = {
      disk: { total: diskTotal, used: diskUsed, avail: diskAvail },
      reclaimable: totalReclaimable,
      categories: filtered.map(c => ({
        label: c.label,
        risk: c.risk,
        size: c.totalSize,
        items: c.items.map(i => ({ label: i.label, size: i.size })),
        cleanCmd: c.cleanCmd || c.detail?.split('\n')[0] || null,
      })),
    };
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  // ── 终端输出 ──
  const usedPct = ((diskUsed / diskTotal) * 100).toFixed(1);
  const availPct = ((diskAvail / diskTotal) * 100).toFixed(1);

  console.log('');
  console.log(bold('══════════════════════════════════════════════════'));
  console.log(bold('          磁盘空间分析报告'));
  console.log(bold('══════════════════════════════════════════════════'));
  console.log('');
  console.log(`  磁盘总容量:  ${bold(fmt(diskTotal))}`);
  console.log(`  已使用:      ${red(fmt(diskUsed))}  (${red(usedPct + '%')})`);
  console.log(`  可用空间:    ${diskAvail < 50 * 1024 ** 3 ? red(fmt(diskAvail)) : green(fmt(diskAvail))}  (${availPct}%)`);
  console.log('');
  console.log(`  ${bar(diskUsed, diskTotal)} ${red(usedPct)}% used`);
  console.log('');
  console.log(bold('──────────────────────────────────────────────────'));
  console.log(bold('  可清理空间分析 (按大小排序)'));
  console.log(bold('──────────────────────────────────────────────────'));
  console.log('');

  const maxSize = filtered.length > 0 ? filtered[0].totalSize : 1;

  for (const cat of filtered) {
    const pct = ((cat.totalSize / totalReclaimable) * 100).toFixed(1);
    console.log(`  ${riskBadge(cat.risk)} ${bold(cat.label)}`);
    console.log(`          ${cat.description}`);
    console.log(`          总计: ${bold(yellow(fmt(cat.totalSize)))}  (${dim(pct + '% 可回收')})`);

    if (showDetail && cat.items.length > 0) {
      console.log('');
      const itemMax = Math.max(...cat.items.map(i => i.size), 1);
      for (const item of cat.items) {
        const itemPct = ((item.size / cat.totalSize) * 100).toFixed(0);
        console.log(`            ${bar(item.size, itemMax, 12)} ${fmt(item.size).padStart(8)}  ${dim(itemPct + '%')}  ${dim(item.label)}`);
      }
    } else if (cat.items.length > 0) {
      // 简略模式只显示 top 3
      const top = cat.items.slice(0, 3);
      const summary = top.map(i => `${dim(i.label)} ${yellow(fmt(i.size))}`).join('  |  ');
      console.log(`          ${summary}`);
      if (cat.items.length > 3) {
        console.log(`          ${dim(`... 及其他 ${cat.items.length - 3} 项`)}`);
      }
    }

    if (cat.cleanCmd) {
      console.log(`          清理: ${green(dim(cat.cleanCmd))}`);
    }
    console.log('');
  }

  console.log(bold('──────────────────────────────────────────────────'));
  console.log(`  ${bold('可回收总计:')}  ${bold(yellow(fmt(totalReclaimable)))}`);
  if (totalReclaimable > 0) {
    console.log(`  清理后预计可用: ${green(fmt(diskAvail + totalReclaimable))}`);
  }
  console.log(bold('──────────────────────────────────────────────────'));
  console.log('');

  // 风险说明
  console.log(bold('  风险等级说明:'));
  console.log(`    ${green('SAFE')}   = 随时可删，无副作用`);
  console.log(`    ${yellow('WARN')}   = 可删，但删后某些功能需重新下载/重建`);
  console.log(`    ${red('DANGER')} = 慎重！删除前确认不再需要`);
  console.log(`    ${cyan('CHECK')}  = 需手动检查后决定`);
  console.log('');

  // 一键清理命令
  console.log(bold('──────────────────────────────────────────────────'));
  console.log(bold('  快速清理命令 (复制粘贴到终端):'));
  console.log(bold('──────────────────────────────────────────────────'));
  console.log('');
  console.log(red(bold('  # SAFE - 随时可执行，无风险:')));
  console.log(yellow('  npm cache clean --force'));
  console.log(yellow('  rm -rf ~/Library/Caches/pip'));
  console.log(yellow('  rm -rf ~/Library/Caches/ms-playwright'));
  console.log(yellow('  rm -rf ~/Library/Caches/ms-playwright-go'));
  console.log(yellow('  rm -rf ~/Library/Caches/Homebrew'));
  console.log(yellow('  rm -rf ~/Library/Caches/remixdesktop-updater'));
  console.log(yellow('  rm -rf ~/Library/Caches/bruno-updater'));
  console.log(yellow('  rm -rf ~/Library/Caches/cherrystudio-updater'));
  console.log(yellow('  rm -rf ~/Library/Caches/hardhat-nodejs'));
  console.log(yellow('  rm -rf ~/Library/Caches/Tabbit\\ Browser'));
  console.log(yellow('  rm -rf ~/.cache/chrome-devtools-mcp'));
  console.log(yellow('  rm -rf ~/.cache/puppeteer'));
  console.log(yellow('  rm -rf ~/.cache/prisma'));
  console.log(yellow('  uv cache clean'));
  console.log(yellow('  rm -rf ~/.Trash/*'));
  console.log('');
  console.log(red(bold('  # WARN - 确认不再需要后执行:')));
  console.log(yellow('  rm -rf ~/Library/Caches/JetBrains'));
  console.log(yellow('  rm -rf ~/Library/Application\\ Support/com.panda-player.app/cache/*'));
  console.log(yellow('  rm -rf ~/.cache/whisper'));
  console.log(yellow('  docker system prune -a'));
  console.log('');

  if (showDetail) {
    console.log(bold('──────────────────────────────────────────────────'));
    console.log(bold('  详细清理说明:'));
    console.log(bold('──────────────────────────────────────────────────'));
    console.log('');
    for (const cat of filtered) {
      if (cat.detail) {
        console.log(`  ${bold(cat.label)}:`);
        for (const line of cat.detail.split('\n')) {
          console.log(`    ${dim(line)}`);
        }
        console.log('');
      }
    }
  }

  console.log('');
  console.log(dim('  提示: --detail / -d  显示详细子项'));
  console.log(dim('        --safe-only / -s  只显示可安全清理项'));
  console.log(dim('        --json / -j  JSON 输出'));
  console.log('');
}

main();
