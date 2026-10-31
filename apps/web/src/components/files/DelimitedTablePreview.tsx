/** Delimited files share the large-text virtualization and loading boundary. */
import { lazy, Suspense } from "react";
import { FileSurfaceLoading } from "./fileSurfaceChrome";

const LargeTextViewer = lazy(() => import("./LargeTextViewer"));
/** Virtualizes delimited text using the same lazy viewer as large workspace files. */
export function DelimitedTablePreview(props: {
  readonly name: string;
  readonly text: string;
  readonly delimiter: "," | "\t";
}) {
  return (
    <Suspense fallback={<FileSurfaceLoading />}>
      <LargeTextViewer key={props.name} {...props} />
    </Suspense>
  );
}
