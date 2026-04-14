# Al-RMX Baseline Test Cases

Three reference cases for regression testing.
After every deployment, regenerate all three reports and verify key values match expected outputs below.

---

## Plant A: Scenario B, Small TAT Excess

**File:** `Plant_A_ScenarioB_SmallTAT.xlsx`
**Profile:** Al-Noor RMX type, Saudi Arabia, 24 trucks, 120 m3/hr plant, 11 hr/day, 286 days/year

### Input summary
| Field | Value |
|-------|-------|
| Selling price | $65/m3 |
| Material cost | $32/m3 |
| Contribution margin | $33/m3 |
| Plant capacity | 120 m3/hr |
| Operating hours | 11 hr/day |
| Operating days | 286 days/year (24 working days/month) |
| Production last month | 17,006 m3 |
| Trucks | 24 |
| Trips last month | 3,146 |
| TAT | 112 min |
| Rejection rate | 3% |
| Delivery radius | 12-20 km (midpoint 16 km) |
| Queue + idle | Yes |

### Calculations
```
TARGET_TA       = 60 + (16 x 1.5 x 2) = 108 min
TAT excess      = 112 - 108 = 4 min (3.7%)
Scenario        = B (excess < 5%)
deliveries_day  = 3146 / 24 = 131.1
trips_per_truck = 131.1 / 24 = 5.46
trips_target    = (11 x 60 / 108) x 0.85 = 5.2
actual_daily_m3 = 17006 / 24 = 709
target_daily_m3 = min(fleet@target 873, plant 1214) = 873
gap_daily_m3    = 873 - 709 = 164
gap_monthly_m3  = 164 x 24 = 3,936
monthly_gap     = 3936 x $33 = ~$130,000
recovery_lo     = $130,000 x 0.40 = $52,000
recovery_hi     = $130,000 x 0.65 = $85,000
```

### Expected report outputs
- Constraint label: "Likely: Dispatch timing" (no duplicate "Likely:")
- Trips: 5.46 actual / 5.2 target
- Monthly revenue gap: ~$130,000
- Recovery range: $52,000-$85,000
- Loss breakdown: three rows summing to ~$130,000
- Scenario: B (dispatch timing, not TAT-driven)
- Trucks statement: utilisation-based, not TAT reframe
- Morning access: references dispatch patterns, not TAT excess

---

## Plant B: Scenario B, TAT On Target

**File:** `Plant_B_ScenarioB_TAT_OnTarget.xlsx`
**Profile:** Test plant, Saudi Arabia, 20 trucks, 80 m3/hr plant, 11 hr/day, 288 days/year

### Input summary
| Field | Value |
|-------|-------|
| Selling price | $58/m3 |
| Material cost | $36/m3 |
| Contribution margin | $22/m3 |
| Plant capacity | 80 m3/hr |
| Operating hours | 11 hr/day |
| Operating days | 288 days/year (24 working days/month) |
| Production last month | 13,400 m3 |
| Trucks | 20 |
| Trips last month | 2,040 |
| TAT | 104 min |
| Rejection rate | 4.2% |
| Delivery radius | 10-20 km (midpoint 15 km) |
| Queue + idle | Yes |

### Calculations
```
TARGET_TA       = 60 + (15 x 1.5 x 2) = 105 min
TAT excess      = 104 - 105 = -1 min (-1.0%)
Scenario        = B (excess < 5%, TAT at target)
deliveries_day  = 2040 / 24 = 85
trips_per_truck = 85 / 20 = 4.25
trips_target    = (11 x 60 / 105) x 0.85 = 5.3
actual_daily_m3 = 13400 / 24 = 558
target_daily_m3 = min(fleet@target 748, plant 810) = 748
gap_daily_m3    = 748 - 558 = 190
gap_monthly_m3  = 190 x 24 = 4,560
monthly_gap     = 4560 x $22 = ~$100,000
recovery_lo     = $100,000 x 0.40 = $40,000
recovery_hi     = $100,000 x 0.65 = $65,000
```

### Expected report outputs
- Constraint label: "Likely: Dispatch timing" (no duplicate "Likely:")
- Trips: 4.25 actual / 5.3 target
- Monthly revenue gap: ~$100,000
- Recovery range: $40,000-$65,000
- Loss breakdown: three rows summing to ~$100,000
- Scenario: B (dispatch timing)
- Trucks statement: utilisation-based, not TAT reframe
- Morning access: references dispatch clustering, not TAT excess
- Rejection: 4.2% mentioned with concrete rejected loads count

---

## Plant C: Scenario A, Large TAT Excess

**File:** `Plant_C_ScenarioA_LargeTAT.xlsx`
**Profile:** Al-Wadi RMX, Abu Dhabi UAE, 28 trucks, 100 m3/hr plant, 10 hr/day, 290 days/year

### Input summary
| Field | Value |
|-------|-------|
| Selling price | $72/m3 |
| Material cost | $44/m3 |
| Contribution margin | $28/m3 |
| Plant capacity | 100 m3/hr |
| Operating hours | 10 hr/day |
| Operating days | 290 days/year (24 working days/month) |
| Production last month | 19,200 m3 |
| Trucks | 28 |
| Trips last month | 3,696 |
| TAT | 118 min |
| Rejection rate | 4.5% |
| Delivery radius | Under 10 km (midpoint 7 km) |
| Queue + idle | No |
| Dispatch pattern | Distributed evenly |

### Calculations
```
TARGET_TA       = 60 + (7 x 1.5 x 2) = 81 min
TAT excess      = 118 - 81 = 37 min (45.7%)
Scenario        = A (excess > 5%, TAT-driven)
deliveries_day  = 3696 / 24 = 154
trips_per_truck = 154 / 28 = 5.50
trips_target    = (10 x 60 / 81) x 0.85 = 6.3
actual_daily_m3 = 19200 / 24 = 800
target_daily_m3 = min(fleet@target 1234, plant 920) = 920
gap_daily_m3    = 920 - 800 = 120
gap_monthly_m3  = 120 x 24 = 2,880
monthly_gap     = 2880 x $28 = ~$81,000
recovery_lo     = $81,000 x 0.40 = $32,000
recovery_hi     = $81,000 x 0.65 = $53,000
```

### Expected report outputs
- Constraint label: "Likely: Fleet coordination" (NOT "Dispatch timing")
- Trips: 5.50 actual / 6.3 target
- Monthly revenue gap: ~$81,000
- Recovery range: $32,000-$53,000
- Loss breakdown: three rows summing to ~$81,000
- Scenario: A (TAT excess at 45.7%)
- Trucks statement: TAT-based ("X trucks would do what Y do today")
- No queue/idle signals: no bunching narrative in hypotheses
- Preliminary Analysis: references TAT excess and site wait, not dispatch timing

---

## How to run regression test

After any deployment that touches:
- `calcTargetTA` formula
- `deliveries_day` or `trips_per_truck` calculation
- Loss breakdown calculation or capping logic
- Constraint label logic (Scenario A/B classification)
- Trucks statement logic
- Prompt builders (buildExecutivePrompt, buildDiagnosisPrompt, buildActionsPrompt)

Do the following:
1. Upload each `.xlsx` to the platform via "Upload plant data"
2. Generate pre-assessment report for each plant
3. Export Word document
4. Check all expected values in the tables above
5. If any value differs by more than $2,000 or scenario classification changes, do not deploy. Investigate first.

### Key regression signals
- **Scenario flip:** Plant A or B classified as Scenario A = broken (TAT excess < 5%)
- **Scenario flip:** Plant C classified as Scenario B = broken (TAT excess 45.7%)
- **Constraint label wrong:** "Likely: Production" appearing for any of these plants = broken
- **Double "Likely:":** "Likely: Likely: Dispatch timing" = display bug in ExportWord
- **Trips mismatch:** trips_per_truck using theoretical max instead of deliveries/trucks = regression
- **Loss breakdown:** fewer than 3 rows or sum differs from monthly gap by > $2,000 = broken
