# Domain engines (§5.1)

Pure, testable domain services — data in, data out; no DOM, no fetch (§5.2).
Each lands with Vitest unit tests in the same turn it is written (§0.1 rule 4).

| Engine                  | Spec    | Phase |
| ----------------------- | ------- | ----- |
| `climate.ts`            | §9      | 1     |
| `plantingWindows.ts`    | §11     | 1     |
| `waterlogging.ts`       | §31.2   | 1     |
| `sunModel.ts`           | §12.8   | 2     |
| `growth.ts`             | §13     | 3     |
| `diagnostics.ts`        | §14     | 3     |
| `schedule.ts`           | §15     | 4     |
| `recommendation.ts`     | §16     | 4     |
| `watering.ts`           | §17     | 4     |
