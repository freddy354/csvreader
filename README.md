# csvreader

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/freddy354/csvreader/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/freddy354/csvreader/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A faster drop-in for csv-reader 1.0.0, for the make.fun bounty
csv-reader-speed-01-run-20261121 ("Read broken CSV files faster").

`solve.js` reimplements csv-reader's reading with byte-identical output,
optimised for CPU time; `main.ts` is the harness driver (the house
baseline's, unchanged). See `BUILD_REPORT.md` for the design, the practice
results and the timing comparison against the baseline.
