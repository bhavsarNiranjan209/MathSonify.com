evaluator benchmark — 800 points × 1000 reps per cell, baseline ab8f1cd
equation        expression                        old ms    new ms   new/old  mathjs ms
---------------------------------------------------------------------------------------
pure sine       sin(x)                             216.7     227.5      1.05      295.5
harmonic mix    cos(2*x) + 0.5*sin(x/3)           1251.8    1128.9      0.90      796.0
polynomial      x^3 - 3*x + 1                      781.8     835.0      1.07      419.0
gaussian        exp(-x^2/2)                        662.9     576.8      0.87      375.8
fourier sum     sum(k=1, 10, sin(k*x)/k)          6636.2    6884.5      1.04     1617.7

worst new/old ratio: 1.07 (limit 2.0) → PASS
