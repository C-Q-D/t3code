/** Stores the single user-selected background independently of application settings. */
import { createHash } from "node:crypto";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";

export const BACKGROUND_URL_PREFIX = "/__t3/background/";
export const BACKGROUND_EXTENSIONS = ["png", "jpg", "jpeg", "webp"];
export const BACKGROUND_FILENAME = /^[a-f0-9]{16}\.(?:png|jpg|jpeg|webp)$/;

/** Rejects unsupported selections before any stored background is changed. */
export class InvalidBackgroundImage extends Schema.TaggedError<InvalidBackgroundImage>()(
  "InvalidBackgroundImage",
  { message: Schema.String },
) {}

// Pick, clear and get share a permit so concurrent IPC calls cannot leave two images.
const access = Semaphore.makeUnsafe(1);

/** Copies a selected file into stateDir/background and removes previous images.
 * @param stateDir Desktop-owned state root, never the renderer's selected directory.
 * @param sourcePath Selected PNG/JPEG/WebP file; extension matching is case insensitive.
 * @returns Content-addressed relative URL. Invalid extensions and filesystem errors propagate.
 */
export const saveBackgroundImage = (stateDir: string, sourcePath: string) =>
  access.withPermits(1)(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const extension = path.extname(sourcePath).slice(1).toLowerCase();
      if (!BACKGROUND_EXTENSIONS.includes(extension)) {
        return yield* new InvalidBackgroundImage({
          message: "Unsupported background image extension.",
        });
      }
      const contents = yield* fs.readFile(sourcePath);
      const filename = `${createHash("sha256").update(contents).digest("hex").slice(0, 16)}.${extension}`;
      const directory = path.join(stateDir, "background");
      yield* fs.makeDirectory(directory, { recursive: true });
      // Publish the new content before removing the old image, so read failures preserve the selection.
      yield* fs.writeFile(path.join(directory, filename), contents);
      for (const entry of yield* fs.readDirectory(directory)) {
        if (entry !== filename) yield* fs.remove(path.join(directory, entry));
      }
      return `${BACKGROUND_URL_PREFIX}${filename}`;
    }),
  );

/** Removes stored background files; an absent directory is already cleared.
 * @param stateDir Desktop-owned state root.
 * @returns Completion; filesystem failures propagate and are not reported as success.
 */
export const clearBackgroundImage = (stateDir: string) =>
  access.withPermits(1)(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const directory = path.join(stateDir, "background");
      if (!(yield* fs.exists(directory))) return;
      for (const entry of yield* fs.readDirectory(directory))
        yield* fs.remove(path.join(directory, entry));
    }),
  );

/** Reads file presence rather than maintaining a second settings-based source of truth.
 * @param stateDir Desktop-owned state root.
 * @returns Current relative URL or null when absent; filesystem errors propagate.
 */
export const getBackgroundImage = (stateDir: string) =>
  access.withPermits(1)(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const directory = path.join(stateDir, "background");
      if (!(yield* fs.exists(directory))) return null;
      const filename = (yield* fs.readDirectory(directory)).find((entry) =>
        BACKGROUND_FILENAME.test(entry),
      );
      return filename === undefined ? null : `${BACKGROUND_URL_PREFIX}${filename}`;
    }),
  );
