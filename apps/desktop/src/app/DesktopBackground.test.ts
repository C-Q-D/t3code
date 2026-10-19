/** Verifies the background lifecycle on isolated real files, not settings mocks. */
import { assert, describe, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as PlatformError from "effect/PlatformError";
import * as Background from "./DesktopBackground.ts";

describe("DesktopBackground", () => {
  it.effect.each(["hello", "abc"])(
    "preserves the previous image after a partial write fails for %s",
    (replacement) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const root = yield* fs.makeTempDirectoryScoped();
        yield* fs.writeFileString(`${root}/original.png`, "abc");
        yield* fs.writeFileString(`${root}/replacement.png`, replacement);
        yield* Background.saveBackgroundImage(root, `${root}/original.png`);
        const failure = PlatformError.systemError({
          _tag: "Unknown",
          module: "FileSystem",
          method: "writeFile",
          description: "injected disk failure after partial write",
        });
        const error = yield* Background.saveBackgroundImage(root, `${root}/replacement.png`).pipe(
          Effect.provideService(FileSystem.FileSystem, {
            ...fs,
            writeFile: (target, bytes) =>
              fs.writeFile(target, bytes.subarray(0, 1)).pipe(Effect.andThen(Effect.fail(failure))),
          }),
          Effect.flip,
        );
        assert.strictEqual(error, failure);
        assert.equal(yield* fs.readFileString(`${root}/background/ba7816bf8f01cfea.png`), "abc");
        assert.deepEqual(yield* fs.readDirectory(`${root}/background`), ["ba7816bf8f01cfea.png"]);
        assert.equal(
          yield* Background.getBackgroundImage(root),
          "/__t3/background/ba7816bf8f01cfea.png",
        );
      }).pipe(Effect.provide(NodeServices.layer), Effect.scoped),
  );
  it.effect.each(["PNG", "jpg", "JPEG", "webp"])(
    "copies %s with a content-addressed lowercase filename",
    (extension) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const root = yield* fs.makeTempDirectoryScoped();
        yield* fs.writeFileString(`${root}/source.${extension}`, "abc");
        const url = yield* Background.saveBackgroundImage(root, `${root}/source.${extension}`);
        assert.equal(url, `/__t3/background/ba7816bf8f01cfea.${extension.toLowerCase()}`);
        assert.equal(
          yield* fs.readFileString(
            `${root}/background/ba7816bf8f01cfea.${extension.toLowerCase()}`,
          ),
          "abc",
        );
        assert.equal(yield* Background.getBackgroundImage(root), url);
      }).pipe(Effect.provide(NodeServices.layer), Effect.scoped),
  );

  it.effect("replaces the previous file and clears the selection", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* fs.makeTempDirectoryScoped();
      assert.isNull(yield* Background.getBackgroundImage(root));
      yield* Background.clearBackgroundImage(root);
      yield* fs.writeFileString(`${root}/first.png`, "abc");
      yield* fs.writeFileString(`${root}/second.jpg`, "hello");
      yield* Background.saveBackgroundImage(root, `${root}/first.png`);
      yield* Background.saveBackgroundImage(root, `${root}/second.jpg`);
      assert.deepEqual(yield* fs.readDirectory(`${root}/background`), ["2cf24dba5fb0a30e.jpg"]);
      assert.equal(
        yield* Background.getBackgroundImage(root),
        "/__t3/background/2cf24dba5fb0a30e.jpg",
      );
      yield* Background.clearBackgroundImage(root);
      assert.deepEqual(yield* fs.readDirectory(`${root}/background`), []);
      assert.isNull(yield* Background.getBackgroundImage(root));
    }).pipe(Effect.provide(NodeServices.layer), Effect.scoped),
  );

  it.effect("rejects unsupported extensions without changing the selected file", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* fs.makeTempDirectoryScoped();
      yield* fs.writeFileString(`${root}/image.png`, "abc");
      yield* fs.writeFileString(`${root}/image.svg`, "<svg/>");
      yield* Background.saveBackgroundImage(root, `${root}/image.png`);
      const result = yield* Background.saveBackgroundImage(root, `${root}/image.svg`).pipe(
        Effect.flip,
      );
      assert.equal(result._tag, "InvalidBackgroundImage");
      assert.equal(
        yield* Background.getBackgroundImage(root),
        "/__t3/background/ba7816bf8f01cfea.png",
      );
    }).pipe(Effect.provide(NodeServices.layer), Effect.scoped),
  );
});
