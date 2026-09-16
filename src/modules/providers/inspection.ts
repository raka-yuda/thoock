import "server-only";
import { inspectImage } from "@/modules/assets/inspect";
import type { ImageInspectionProvider } from "./contracts";

export class SharpInspectionProvider implements ImageInspectionProvider {
  inspect(input: Buffer) {
    return inspectImage(input);
  }
}
