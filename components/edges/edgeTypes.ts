import type { EdgeTypes } from "@xyflow/react";
import { DeletableEdge } from "./DeletableEdge";

// Override the built-in `default` type so EVERY edge (sample, loaded, or newly
// drawn — none carry an explicit type) renders with select + delete affordance.
export const edgeTypes: EdgeTypes = { default: DeletableEdge };
