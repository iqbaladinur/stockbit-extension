# Stockbit Watchlist Flow Entry Ruleset v2.1 (Strict)

Purpose:
Detect high-conviction accumulation by Foreign + Bandar using Stockbit Watchlist indicators only.

Version: 2.1
Type: Strict Mode
Last Updated: 2025-02-02

---

## AVAILABLE FIELDS

Required fields:

- Price
- Net Foreign Buy / Sell
- Net Foreign Buy / Sell MA10
- Net Foreign Buy / Sell MA20
- 1 Week Net Foreign Flow
- Net Foreign Buy Streak
- Bandar Accum/Dist
- Bandar Value
- Bandar Value MA10
- Bandar Value MA20

Optional (for scoring enhancement):

- 1 Month Net Foreign Flow
- All Time High
- Net Insider Buy/Sell

---

## VALUE NORMALIZATION

If value is:

- Wrapped in parentheses → NEGATIVE
- "-" → treat as NULL (exclude from evaluation)
- Otherwise numeric → POSITIVE or NEGATIVE based on sign

---

## CORE ENTRY CONDITIONS

A stock is ENTRY_READY if ALL conditions below are satisfied.

---

### GROUP A — Foreign Participation (Short Term)

All must be true:

A1:
Net Foreign Buy / Sell > 0

A2:
Net Foreign Buy / Sell MA10 > 0

A3:
1 Week Net Foreign Flow > 0

---

### GROUP B — Bandar Accumulation (With Confirmation)

All must be true:

B1:
Bandar Accum/Dist > 0

B2:
Bandar Value > 0

B3:
Bandar Value MA10 > 0

---

### GROUP C — Mid-Term Alignment (Strict)

Both conditions must be satisfied:

C1:
Net Foreign Buy / Sell MA20 >= 0

C2:
Bandar Value MA20 >= 0

AND at least one must be strictly positive:

(Net Foreign Buy / Sell MA20 > 0) OR (Bandar Value MA20 > 0)

---

### GROUP D — Continuity Filter

D1:
Net Foreign Buy Streak >= 3

---

### GROUP E — HARD REJECT (Distribution Signals)

Reject immediately if ANY condition is true:

E1:
Bandar Accum/Dist < 0

E2:
Net Foreign Buy / Sell < 0 AND Net Foreign Buy Streak = 0

---

### GROUP F — Acceleration Filter

F1:
Net Foreign Buy / Sell > Net Foreign Buy / Sell MA10

This confirms current inflow is above recent average (momentum increasing).

---

## FINAL LOGIC
```
ENTRY_READY =
    (A1 AND A2 AND A3)
    AND (B1 AND B2 AND B3)
    AND (C1 >= 0 AND C2 >= 0) AND (C1 > 0 OR C2 > 0)
    AND D1
    AND F1
    AND NOT (E1 OR E2)
```

---

## SCORING SYSTEM (For Ranking ENTRY_READY Stocks)

Initialize score = 0

Tier 1 — High Weight (+2 each):

- Bandar Value MA20 > 0
- Net Foreign Buy / Sell MA20 > 0
- Net Foreign Buy / Sell > Net Foreign Buy / Sell MA10 (accelerating)

Tier 2 — Medium Weight (+1 each):

- Net Foreign Buy Streak >= 5
- Bandar Value MA10 > 0
- 1 Week Net Foreign Flow > 1 Month Net Foreign Flow (if data available)

Bonus (+1):

- Net Insider Buy/Sell > 0 (if data available)

---

## SORTING PRIORITY

Sort ENTRY_READY stocks by:

1. Score DESC
2. Bandar Value DESC
3. Net Foreign Buy / Sell DESC
4. Net Foreign Buy Streak DESC

---

## OUTPUT STRUCTURE

Return per stock:

| Field | Type |
|-------|------|
| Symbol | String |
| ENTRY_READY | Boolean |
| Score | Integer |
| Net Foreign Buy / Sell | Number |
| Net Foreign Buy / Sell MA10 | Number |
| Net Foreign Buy / Sell MA20 | Number |
| Bandar Value | Number |
| Bandar Value MA10 | Number |
| Bandar Value MA20 | Number |
| Bandar Accum/Dist | Number |
| Net Foreign Buy Streak | Integer |
| Acceleration | Boolean (F1 status) |

---

## CONDITION SUMMARY TABLE

| Group | Condition | Requirement |
|-------|-----------|-------------|
| A1 | Net Foreign Buy / Sell | > 0 |
| A2 | Net Foreign Buy / Sell MA10 | > 0 |
| A3 | 1 Week Net Foreign Flow | > 0 |
| B1 | Bandar Accum/Dist | > 0 |
| B2 | Bandar Value | > 0 |
| B3 | Bandar Value MA10 | > 0 |
| C1 | Net Foreign Buy / Sell MA20 | >= 0 |
| C2 | Bandar Value MA20 | >= 0 |
| C+ | At least one MA20 | > 0 |
| D1 | Net Foreign Buy Streak | >= 3 |
| E1 | Bandar Accum/Dist | NOT < 0 |
| E2 | Foreign + Streak combo | NOT (< 0 AND = 0) |
| F1 | Acceleration | Current > MA10 |

---

## EDGE CASES

### NULL Values ("-")

- If any required field is NULL, stock is NOT ENTRY_READY
- Optional fields with NULL are skipped in scoring

### Zero Values

- Zero (0) is treated as neutral
- For Group A and B: must be strictly > 0
- For Group C: >= 0 is acceptable, but one must be > 0

### Negative in Parentheses

- "(500)" = -500
- Always convert before evaluation

---

## USE CASE SCENARIOS

### Scenario 1: Fresh Accumulation

- Foreign baru masuk 3-5 hari
- Bandar sudah building position
- MA20 mulai turn positive
- Result: ENTRY_READY ✓

### Scenario 2: Continuation Play

- Foreign streak sudah 5+ hari
- Semua MA positif
- Acceleration confirmed
- Result: ENTRY_READY ✓ dengan high score

### Scenario 3: Distribution Trap

- Foreign hari ini positif
- Tapi Bandar Accum/Dist negatif
- Result: HARD REJECT (E1)

### Scenario 4: False Breakout

- Foreign spike 1 hari
- Streak = 1
- MA10 masih negatif
- Result: NOT ENTRY_READY (fail A2, D1)

---

## PHILOSOPHY

> Foreign confirms direction.
> Bandar builds structure.
> Acceleration validates momentum.
> Flow leads price.

This system detects:

1. Early accumulation with confirmation
2. Continuation phase with momentum
3. Aligned foreign + bandar participation
4. Avoids distribution traps and false spikes

No price technicals involved — pure money flow analysis.

---

## VERSION HISTORY

| Version | Changes |
|---------|---------|
| 2.0 | Initial ruleset |
| 2.1 | Added B3 (Bandar MA10), Strict C group, Raised D1 to 3, Added F1 acceleration filter, Enhanced scoring |

---

End Ruleset v2.1