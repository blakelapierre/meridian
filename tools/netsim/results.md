| mode | clients | up B/s per client | down B/s per client | up msg/s per client | total B/s (payload) | total B/s (+~60 B/msg wire est.) | B/s per pair, sender moving |
|---|---|---|---|---|---|---|---|
| v2 | 25 | 1607 | 1592 | 134.2 | 40182 | 241458 | 70.9 |
| v3 | 25 | 408 | 404 | 20.3 | 10203 | 40601 | 22.7 |

v2: moving 69% of the time; corrections/pair/s 0.000; send reasons {"v2":201276}
error all: mean 33.042 m, p99 84.374 m, max 121.997 m
  near-visible: 5.0% of samples, mean 0.001 m, p99 0.000 m, max 0.333 m
  mid-visible: 4.1% of samples, mean 2.436 m, p99 77.088 m, max 118.720 m
  unseen: 10.3% of samples, mean 0.712 m, p99 24.228 m, max 111.894 m
  beyond: 80.5% of samples, mean 40.839 m, p99 112.813 m, max 121.997 m

v3: moving 69% of the time; corrections/pair/s 0.819; send reasons {"first":600,"mode":10128,"tier":996,"error":12313,"loss":4076,"yaw":1179,"view":836,"keepalive":270}
error all: mean 0.929 m, p99 8.224 m, max 23.286 m
  near-visible: 5.0% of samples, mean 0.036 m, p99 0.198 m, max 2.245 m
  mid-visible: 4.1% of samples, mean 0.074 m, p99 0.454 m, max 10.140 m
  unseen: 10.3% of samples, mean 0.216 m, p99 1.866 m, max 6.907 m
  beyond: 80.5% of samples, mean 1.121 m, p99 8.925 m, max 23.286 m

Scaling (30 s each)
| mode | clients | up B/s per client | down B/s per client | up msg/s per client | total B/s (payload) | total B/s (+~60 B/msg wire est.) | B/s per pair, sender moving |
|---|---|---|---|---|---|---|---|
| v2 | 2 | 356 | 352 | 29.8 | 711 | 4285 | 360.5 |
| v3 | 2 | 52 | 51 | 2.5 | 103 | 409 | 66.8 |
| v2 | 5 | 136 | 134 | 11.4 | 679 | 4093 | 26.8 |
| v3 | 5 | 53 | 52 | 2.7 | 266 | 1072 | 17.1 |
| v2 | 10 | 480 | 476 | 40.4 | 4804 | 29068 | 57.1 |
| v3 | 10 | 121 | 120 | 6.2 | 1212 | 4918 | 20.5 |
| v2 | 25 | 1623 | 1607 | 136.1 | 40567 | 244671 | 71.4 |
| v3 | 25 | 425 | 421 | 21.1 | 10619 | 42315 | 23.1 |
| v2 | 50 | 4078 | 4038 | 340.7 | 203904 | 1225996 | 82.6 |
| v3 | 50 | 912 | 903 | 45.7 | 45580 | 182764 | 24.8 |
