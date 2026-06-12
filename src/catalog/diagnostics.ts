/**
 * §14 / §28.3 — diagnostic decision trees. Six trees covering the symptoms
 * the spec names, with §31.2 waterlogging branches (the counterintuitive
 * tell: wilting in wet soil = dying roots, not thirst) and the §31.1
 * seed-viability auto-check.
 */

import type { DiagnosticTree } from "../types/models";

export const diagnostics: DiagnosticTree[] = [
  {
    id: "diag_germination_delay",
    symptom: "germination_delay",
    appliesToStage: "germination",
    root: {
      id: "n1",
      question: "Has soil temperature stayed below this plant's minimum to germinate?",
      autoCheck: "soil_temp_below_min",
      yes: {
        kind: "diagnosis",
        cause: "Soil too cold; seeds dormant or rotting.",
        remedy:
          "Wait for soil to reach the plant's minimum, use a cold frame or row cover, or pre-warm the bed with plastic. Re-sow if seeds have sat wet and cold for long.",
        createsTask: { kind: "remedy", title: "Re-sow when soil warms" },
      },
      no: {
        kind: "node",
        node: {
          id: "n2",
          question: "Has the bed been saturated or waterlogged recently?",
          autoCheck: "soil_saturated_recent",
          yes: {
            kind: "diagnosis",
            cause: "Seeds sitting in saturated soil are rotting before they can sprout.",
            remedy:
              "Hold off watering, improve drainage or mound the row, and re-sow once the bed drains. In wet climates start in modules instead.",
            createsTask: { kind: "remedy", title: "Re-sow after bed drains" },
          },
          no: {
            kind: "node",
            node: {
              id: "n3",
              question: "Has the bed been kept consistently moist (not bone dry between waterings)?",
              autoCheck: "no_recent_water",
              yes: {
                kind: "node",
                node: {
                  id: "n4",
                  question: "Were seeds sown deeper than recommended?",
                  autoCheck: null,
                  yes: {
                    kind: "diagnosis",
                    cause: "Sown too deep; seedlings exhausted reserves before reaching light.",
                    remedy: "Re-sow at the recommended depth (see the plant's planting depth).",
                  },
                  no: {
                    kind: "node",
                    node: {
                      id: "n5",
                      question: "Is the seed older than its typical viability span?",
                      autoCheck: "seed_past_viability",
                      yes: {
                        kind: "diagnosis",
                        cause: "Old or low-viability seed.",
                        remedy:
                          "Run a paper-towel germination test; re-sow with fresh seed if under half sprout.",
                        createsTask: { kind: "remedy", title: "Viability-test and re-sow" },
                      },
                      no: {
                        kind: "diagnosis",
                        cause: "Likely slow germination for current conditions, or patchy seed.",
                        remedy:
                          "Give it a few more days at steady moisture; re-sow a partial row as insurance.",
                      },
                    },
                  },
                },
              },
              no: {
                kind: "diagnosis",
                cause: "Inconsistent moisture; seedbed dried out or crusted.",
                remedy:
                  "Keep evenly moist until emergence; consider a humidity cover, burlap, or surface mulch.",
                createsTask: { kind: "water", title: "Keep seedbed moist daily until emergence" },
              },
            },
          },
        },
      },
    },
  },
  {
    id: "diag_stunted_growth",
    symptom: "stunted_growth",
    root: {
      id: "n1",
      question: "Has the soil been saturated or waterlogged for days?",
      autoCheck: "soil_saturated_recent",
      yes: {
        kind: "diagnosis",
        cause: "Roots suffocating in waterlogged soil; growth stalls and roots begin to die.",
        remedy:
          "Do NOT water. Divert runoff, improve drainage or mound up, and let the bed dry. Waterlogging-sensitive crops may need a drier spot.",
        createsTask: { kind: "remedy", title: "Improve drainage / hold watering" },
      },
      no: {
        kind: "node",
        node: {
          id: "n2",
          question: "Have temperatures been below the plant's comfort range?",
          autoCheck: "soil_temp_below_min",
          yes: {
            kind: "diagnosis",
            cause: "Cold stall — warm-season crops sulk below their minimum temperatures.",
            remedy:
              "Protect with row cover or a cold frame and wait for warmth; growth resumes with heat. Avoid feeding a cold-stalled plant.",
          },
          no: {
            kind: "node",
            node: {
              id: "n3",
              question: "Has it been watered in the last several days?",
              autoCheck: "no_recent_water",
              yes: {
                kind: "node",
                node: {
                  id: "n4",
                  question: "Is it getting at least its minimum hours of direct sun?",
                  autoCheck: "low_light",
                  // note: low_light answers YES when light IS low
                  yes: {
                    kind: "diagnosis",
                    cause: "Insufficient light for this crop.",
                    remedy:
                      "Relocate to a sunnier tile, prune overshadowing growth, or swap in a shade-tolerant crop here.",
                  },
                  no: {
                    kind: "diagnosis",
                    cause: "Likely nutrient shortfall (nitrogen first suspect) or root competition.",
                    remedy:
                      "Side-dress with balanced fertilizer or compost; check spacing against neighbors.",
                    createsTask: { kind: "fertilize", title: "Side-dress stunted plant" },
                  },
                },
              },
              no: {
                kind: "diagnosis",
                cause: "Drought stress — too little water for steady growth.",
                remedy: "Water deeply and mulch to even out soil moisture.",
                createsTask: { kind: "water", title: "Deep-water and mulch" },
              },
            },
          },
        },
      },
    },
  },
  {
    id: "diag_yellowing_leaves",
    symptom: "yellowing_leaves",
    root: {
      id: "n1",
      question: "Has the soil been saturated or waterlogged recently?",
      autoCheck: "soil_saturated_recent",
      yes: {
        kind: "diagnosis",
        cause: "Anaerobic (waterlogged) soil — roots can't breathe, leaves yellow from the bottom up.",
        remedy:
          "Hold watering and improve drainage. If stems blacken at the soil line, root rot has set in; remove affected plants.",
        createsTask: { kind: "remedy", title: "Drain bed / hold watering" },
      },
      no: {
        kind: "node",
        node: {
          id: "n2",
          question: "Is the yellowing mostly on the OLDER (lower) leaves, fairly uniform?",
          autoCheck: null,
          yes: {
            kind: "diagnosis",
            cause: "Classic nitrogen deficiency — the plant cannibalizes old leaves to feed new growth.",
            remedy: "Side-dress with a nitrogen source (blood meal, fish emulsion, composted manure).",
            createsTask: { kind: "fertilize", title: "Nitrogen side-dress" },
          },
          no: {
            kind: "node",
            node: {
              id: "n3",
              question: "Is it the YOUNG leaves yellowing between green veins (interveinal)?",
              autoCheck: null,
              yes: {
                kind: "diagnosis",
                cause: "Iron/micronutrient lockout, usually from soil pH outside the plant's range.",
                remedy:
                  "Check soil pH against the plant's preferred band; amend gradually (sulfur to lower, lime to raise) or feed chelated micronutrients.",
              },
              no: {
                kind: "diagnosis",
                cause: "Possible sap-sucking pests (aphids, mites, whiteflies) or early disease.",
                remedy:
                  "Inspect leaf undersides; blast pests with water or use insecticidal soap. Remove badly spotted leaves.",
              },
            },
          },
        },
      },
    },
  },
  {
    id: "diag_no_fruit",
    symptom: "no_fruit",
    appliesToStage: "flowering",
    root: {
      id: "n1",
      question: "Is the plant flowering at all?",
      autoCheck: null,
      yes: {
        kind: "node",
        node: {
          id: "n2",
          question: "Have temperatures been extreme (heat waves or cold nights) since flowering?",
          autoCheck: null,
          yes: {
            kind: "diagnosis",
            cause: "Blossom drop — pollen fails in extreme heat and cold; flowers abort.",
            remedy:
              "Wait for moderate weather; shade cloth in heat waves, covers on cold nights. Fruit set resumes.",
          },
          no: {
            kind: "diagnosis",
            cause: "Poor pollination.",
            remedy:
              "Hand-pollinate (shake tomato trusses; brush squash blossoms) and plant pollinator flowers nearby.",
            createsTask: { kind: "custom", title: "Hand-pollinate flowers" },
          },
        },
      },
      no: {
        kind: "node",
        node: {
          id: "n3",
          question: "Is it getting its minimum hours of direct sun?",
          autoCheck: "low_light",
          yes: {
            kind: "diagnosis",
            cause: "Not enough light to trigger flowering.",
            remedy: "Relocate or thin overshadowing neighbors; fruiting crops need their full sun quota.",
          },
          no: {
            kind: "diagnosis",
            cause: "Likely excess nitrogen — lush leafy growth at the expense of flowers.",
            remedy:
              "Stop nitrogen feeds; switch to a low-N, higher-P/K feed and let the plant stress slightly toward bloom.",
          },
        },
      },
    },
  },
  {
    id: "diag_bolting",
    symptom: "bolting",
    root: {
      id: "n1",
      question: "Has there been a stretch of unusual heat or are days lengthening fast (late spring)?",
      autoCheck: null,
      yes: {
        kind: "diagnosis",
        cause: "Heat/day-length-triggered bolting — the crop has switched to seed production; leaves turn bitter.",
        remedy:
          "Harvest everything usable now. Re-sow in part shade or wait for the cool season; choose bolt-resistant varieties next time.",
        createsTask: { kind: "harvest", title: "Harvest bolting crop now" },
      },
      no: {
        kind: "diagnosis",
        cause: "Stress bolting — drought, root disturbance, or transplant shock pushed it to seed.",
        remedy:
          "Keep moisture even and minimize root disturbance for the next sowing; direct-sow crops that resent transplanting.",
      },
    },
  },
  {
    id: "diag_wilting",
    symptom: "wilting",
    root: {
      id: "n1",
      question: "Is the soil wet or saturated even though the plant droops?",
      autoCheck: "soil_saturated_recent",
      yes: {
        kind: "diagnosis",
        cause:
          "Wilting in WET soil = dying roots (root rot / waterlogging), not thirst. Watering now makes it worse.",
        remedy:
          "Do not water. Drain or mound the bed and let it dry; remove plants whose crowns have gone soft.",
        createsTask: { kind: "remedy", title: "Hold water; fix drainage" },
      },
      no: {
        kind: "node",
        node: {
          id: "n2",
          question: "Has it gone several days without water in warm weather?",
          autoCheck: "no_recent_water",
          yes: {
            kind: "diagnosis",
            cause: "Drought wilt.",
            remedy: "Water deeply at the base, then mulch. Plants usually recover overnight.",
            createsTask: { kind: "water", title: "Deep-water wilted plant" },
          },
          no: {
            kind: "diagnosis",
            cause:
              "Possible vascular wilt disease (fusarium/verticillium) or fresh transplant shock.",
            remedy:
              "If newly transplanted, shade it a few days. If established and one stem wilts while others stand, suspect disease: remove the plant and rotate this family away from the bed.",
          },
        },
      },
    },
  },
];
