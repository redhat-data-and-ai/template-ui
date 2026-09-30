import { watchFile, unwatchFile, statSync } from 'node:fs';
import { resetSettings, getSettings } from './settings.js';

let debounceTimer: NodeJS.Timeout | null = null;
let watchedPath: string | null = null;

/**
 * Watch a config file for changes and reload settings.
 *
 * Uses stat-based polling
 * @param configPath - Path to the settings.yaml file to watch
 * @param onReload - Callback invoked after settings are reloaded
 * @returns Cleanup function to stop watching
 */
export function watchConfig(
  configPath: string,
  onReload: (settings: any) => void,
): () => void {
  // Stop watching previous path if any
  if (watchedPath) {
    unwatchFile(watchedPath);
    watchedPath = null;
  }

  console.log(`[ConfigWatcher] Starting poll-based watch on ${configPath}`);

  watchedPath = configPath;

  watchFile(configPath, { interval: 5000 }, (curr, prev) => {
    if (curr.mtimeMs === prev.mtimeMs) {
      return;
    }

    // Debounce rapid successive changes (e.g., editor write + flush)
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(() => {
      console.log(`[ConfigWatcher] Config file changed, reloading settings...`);

      try {
        // Clear cached settings
        resetSettings();

        // Load new settings
        const newSettings = getSettings();

        console.log(`[ConfigWatcher] Settings reloaded successfully`);

        // Notify caller
        onReload(newSettings);
      } catch (error) {
        console.error('[ConfigWatcher] Failed to reload settings:', error);
        console.error('[ConfigWatcher] Keeping previous settings');
      }
    }, 100); // 100ms debounce
  });

  // Return cleanup function
  return () => {
    console.log('[ConfigWatcher] Stopping watch');
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (watchedPath) {
      unwatchFile(watchedPath);
      watchedPath = null;
    }
  };
}
