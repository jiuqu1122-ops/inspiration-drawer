import { invoke } from '@tauri-apps/api/core';

export type MigrationStatus = {
  mode: 'json' | 'sqlite' | string;
  databasePath: string;
  databaseExists: boolean;
  jsonModeForced: boolean;
  status: string;
  totalCount: number;
  processedCount: number;
  successCount: number;
  failedCount: number;
  currentFile?: string | null;
  error?: string | null;
  startedAt?: number | null;
  finishedAt?: number | null;
};

export const getMigrationStatus = () =>
  invoke<MigrationStatus>('get_migration_status');

export const ensureSqliteAssetLibrary = () =>
  invoke<MigrationStatus>('ensure_sqlite_asset_library');

export const migrateJsonToSqlite = () =>
  invoke<MigrationStatus>('migrate_json_to_sqlite');

export const rollbackToJsonMode = () =>
  invoke<MigrationStatus>('rollback_to_json_mode');
