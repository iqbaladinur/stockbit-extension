# Stockbit Watchlist Flow Entry Ruleset v2.0

Purpose:
Detect active accumulation by Foreign + Bandar using Stockbit Watchlist indicators only.

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

Optional (not required for entry):

- 1 Month Net Foreign Flow
- All Time High
- Net Insider Buy/Sell

---

## VALUE NORMALIZATION

If value is:

- Wrapped in parentheses → NEGATIVE
- "-" → treat as NULL
- Otherwise numeric → POSITIVE or NEGATIVE based on sign

---

## CORE ENTRY CONDITIONS

A stock is ENTRY_READY if ALL conditions below are satisfied.

---

### GROUP A — Foreign Participation (Short Term)

A1:
Net Foreign Buy / Sell > 0

A2:
Net Foreign Buy / Sell MA10 > 0

A3:
1 Week Net Foreign Flow > 0

---

### GROUP B — Bandar Accumulation

B1:
Bandar Accum/Dist > 0

B2:
Bandar Value > 0

---

### GROUP C — Mid-Term Confirmation

At least ONE must be true:

C1:
Net Foreign Buy / Sell MA20 > 0

OR

C2:
Bandar Value MA20 > 0

---

### GROUP D — Continuity Filter

D1:
Net Foreign Buy Streak >= 2

---

### GROUP E — HARD REJECT (Distribution)

Reject immediately if ANY:

E1:
Bandar Accum/Dist < 0

E2:
Net Foreign Buy / Sell < 0 AND Net Foreign Buy Streak = 0

---

## FINAL LOGIC

ENTRY_READY =

A1 AND A2 AND A3
AND B1 AND B2
AND (C1 OR C2)
AND D1
AND NOT (E1 OR E2)

---

## SCORING SYSTEM (RANKING ONLY)

Initialize score = 0

+2 → Bandar Value MA20 > 0  
+2 → Net Foreign Buy / Sell MA20 > 0  
+1 → Net Foreign Buy Streak >= 3  
+1 → Bandar Value MA10 > 0  

Sort by:

1. Score DESC
2. Bandar Value DESC
3. Net Foreign Buy / Sell DESC

---

## OUTPUT STRUCTURE

Return per stock:

- Symbol
- ENTRY_READY (boolean)
- Score
- Net Foreign Buy / Sell
- Bandar Value
- Bandar Accum/Dist
- Net Foreign Buy Streak

---

## PHILOSOPHY

Foreign confirms direction.
Bandar builds structure.

Flow leads price.

This system detects:
- Early accumulation
- Continuation phase
- Avoids distribution traps

No price technicals involved.

---

End Ruleset.
