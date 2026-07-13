import { watch, FSWatcher } from 'node:fs';
import { resetSettings, getSettings } from './settings.js';

let watcher: FSWatcher | null = null;
let debounceTimer: NodeJS.Timeout | null = null;

/**
 * Watch a config file for changes and reload settings.
 *
 * @param configPath - Path to the settings.yaml file to watch
 * @param onReload - Callback invoked after settings are reloaded
 * @returns Cleanup function to stop watching
 */
export function watchConfig(
  configPath: string,
  onReload: (settings: any) => void,
): () => void {
  // Close existing watcher if any
  if (watcher) {
    watcher.close();
    watcher = null;
  }

  console.log(`[ConfigWatcher] Starting watch on ${configPath}`);

  watcher = watch(configPath, (eventType, _filename) => {
    if (eventType !== 'change') {
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

  watcher.on('error', (error) => {
    console.error('[ConfigWatcher] Watch error:', error);
  });

  // Return cleanup function
  return () => {
    console.log('[ConfigWatcher] Stopping watch');
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (watcher) {
      watcher.close();
      watcher = null;
    }
  };
}
