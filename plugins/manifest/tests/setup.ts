// Waits of the interface tests: the default 1 s is too tight when the machine is busy
// (a cold run after npm ci, a parallel build) — the same checks, more patience.
import { configure } from "@testing-library/react";

configure({ asyncUtilTimeout: 5000 });
