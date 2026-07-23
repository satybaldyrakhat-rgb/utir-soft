// ─── Автоматические бэкапы базы ───────────────────────────────────────
// Вся платформа — один файл SQLite. Потеря/повреждение файла = потеря
// данных ВСЕХ команд. Поэтому: онлайн-бэкап (не блокирует запросы) по
// расписанию + ротация + возможность скачать свежую копию из дашборда
// владельца (офсайт-копия по клику).
//
// Куда класть бэкапы: BACKUP_DIR (по умолчанию рядом с БД, папка backups).
// Для реальной защиты от потери диска эту папку стоит примонтировать на
// отдельный том или синхронизировать в облако (S3/бакет) — тогда даже
// смерть основного диска не унесёт данные.

import fs from 'fs';
import path from 'path';
import type Database from 'better-sqlite3';

const KEEP = Math.max(1, Number(process.env.BACKUP_KEEP) || 14);

function backupDir(dbPath: string): string {
  const dir = process.env.BACKUP_DIR || path.join(path.dirname(dbPath), 'backups');
  try { fs.mkdirSync(dir, { recursive: true }); } catch { /* ignore */ }
  return dir;
}

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export interface BackupInfo { file: string; size: number; at: string }

export function listBackups(dbPath: string): BackupInfo[] {
  const dir = backupDir(dbPath);
  try {
    return fs.readdirSync(dir)
      .filter(f => f.startsWith('utir-') && f.endsWith('.db'))
      .map(f => { const st = fs.statSync(path.join(dir, f)); return { file: f, size: st.size, at: st.mtime.toISOString() }; })
      .sort((a, b) => b.at.localeCompare(a.at));
  } catch { return []; }
}

// Онлайн-бэкап через better-sqlite3 .backup() — консистентная копия без
// остановки записи. Возвращает путь к созданному файлу.
export async function runBackup(db: Database.Database, dbPath: string): Promise<{ file: string; size: number }> {
  const dir = backupDir(dbPath);
  const dest = path.join(dir, `utir-${stamp()}.db`);
  await db.backup(dest);
  const size = fs.statSync(dest).size;
  // Ротация: держим последние KEEP.
  const all = listBackups(dbPath);
  for (const old of all.slice(KEEP)) { try { fs.unlinkSync(path.join(dir, old.file)); } catch { /* ignore */ } }
  return { file: dest, size };
}

export function latestBackupPath(dbPath: string): string | null {
  const list = listBackups(dbPath);
  if (list.length === 0) return null;
  return path.join(backupDir(dbPath), list[0].file);
}

let timer: ReturnType<typeof setInterval> | null = null;
export function startBackupScheduler(db: Database.Database, dbPath: string) {
  if (timer) return;
  const run = () => { runBackup(db, dbPath).then(r => console.log(`[backup] сохранён ${path.basename(r.file)} (${Math.round(r.size / 1024)} КБ)`)).catch(e => console.warn('[backup] не удался', e)); };
  setTimeout(run, 60 * 1000);                         // первый бэкап через минуту после старта
  timer = setInterval(run, 24 * 60 * 60 * 1000);      // затем раз в сутки
  console.log(`[backup] планировщик запущен (раз в сутки, храним ${KEEP})`);
}
