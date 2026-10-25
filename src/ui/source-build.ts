/** Native history identifies the loaded code, never an asynchronously fetched or cached manifest. */
declare const __WARREN_SOURCE_COMMIT__: string;
export function sourceBuild(): string {
  if (typeof __WARREN_SOURCE_COMMIT__ !== 'string' || !/^[a-f0-9]{40}$/.test(__WARREN_SOURCE_COMMIT__))
    throw Error(
      'The loaded source build is unknown. Keep this notebook. Do not publish a guessed build identifier.',
    );
  return __WARREN_SOURCE_COMMIT__;
}
