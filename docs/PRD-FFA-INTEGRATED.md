# Product Requirements Document

## FFA Integrated Practice Engine

**Version:** 1.1  
**Status:** Build-ready specification  
**Owner:** Nadeem Ramli  
**Primary audience:** Coding agent, product designer, accounting content author  
**Target exam:** ACCA Financial Accounting (FA/FFA), current syllabus version selected in product settings  
**Document date:** 26 July 2026

---

## 1. Executive summary

Build a web-based practice system that develops procedural fluency for ACCA Financial Accounting (FA/FFA).

The learner-facing product has two practice lanes:

1. **Specific Practice** — short, targeted questions and quizzes used for full-syllabus coverage, isolated skill acquisition, error repair, and spaced review.
2. **Financial Statement Practice** — staged, integrated cases organised into six practice families, used to build end-to-end accounting execution.

These are not separate applications or scoring systems. They are two compositions of one kind-agnostic practice engine. Every task is rendered and scored by a registered question kind, while attempts, feedback snapshots, history, error logging, and review scheduling use shared infrastructure.

The product must not behave like a conventional chapter-by-chapter quiz bank. Its main learning unit is an integrated accounting case that starts with source information or an unadjusted trial balance and ends with a correct accounting output. When the learner fails part of the case, the system diagnoses the exact failure, generates a focused repair drill, and then retests the same skill in an altered case.

The core learning loop is:

> Integrated case → diagnose failure → micro-drill weak step → altered case → timed retest

The core accounting execution chain is:

> Trigger → rule → calculation → double entry → statement effect

The Financial Statement Practice lane must support six connected practice families:

1. Sole-trader accounts preparation
2. Limited-company accounts preparation
3. Statement-of-cash-flows reconstruction
4. Consolidated financial statements
5. Reliability and reconstruction
6. Interpretation

Specific Practice must support mixed objective-test sets so that integrated financial-statement practice remains the spine of learning while the whole syllabus remains covered. Full mocks assemble content from both lanes.

The first new production milestone is a complete Financial Statement Practice vertical slice for a sole-trader case: trial balance, reporting-date adjustments, statement of profit or loss, statement of financial position, deterministic marking, diagnosis, repair drill, and altered retest. Existing Specific Practice kinds and learner history must remain functional throughout the build.

---

## 2. Product thesis

### 2.1 Learning problem

The target learner can understand the broad accounting architecture but still fails exam questions because understanding is not yet executable under time pressure.

The main gaps are:

- recognising what a question is asking;
- retrieving the correct accounting rule;
- calculating an adjustment;
- identifying both sides of the double entry;
- placing the result in the correct financial-statement line;
- completing proformas accurately and quickly;
- transferring a known method to altered numbers or wording;
- maintaining accuracy without relying on an “own figure” rule.

The product must therefore train execution, not merely recognition.

### 2.2 Learning architecture

The learner’s wider study model has three layers:

| Layer | Question answered | Product role |
|---|---|---|
| Big models | Why does the system exist? | Brief context and architecture, not the main practice surface |
| Small models | What rules, terms, and procedures must be known? | Just-in-time playbooks and repair drills |
| Practice | How is the knowledge executed? | Integrated cases, timed tests, diagnosis, and retesting |

This product primarily owns the third layer and uses the second layer only when a failure reveals that it is needed.

### 2.3 Accounting-system architecture

Every content item must map to one or more of these six systems:

1. **Govern:** why accounting exists, users, regulation, concepts, recognition, and measurement.
2. **Record:** source documents, books of prime entry, ledgers, and double entry.
3. **Measure:** reporting-date adjustments and valuation.
4. **Verify:** reconciliations, error correction, suspense accounts, and incomplete records.
5. **Report:** individual and consolidated financial statements and cash flows.
6. **Interpret:** ratios, trends, causes, limitations, and decisions.

The interface must display this mapping in review and analytics views. It should not force the learner to navigate the product by textbook chapter.

### 2.4 Existing platform baseline

The implementation extends an existing practice product. The agent must preserve the following as-built behavior unless a migration is explicitly specified:

- one client-side question-kind registry and one server-side scoring dispatch;
- `matrix_select` for shared-option effect, classification, normal-balance, document, error-type, and similar drills;
- `journal_entry` for scenario-based debit, credit, and amount entry;
- `learning_items` for versioned item configuration and metadata;
- editor-only `learning_item_answers`, never readable by learners;
- `quizzes` and ordered `quiz_items`, with quiz authoring and running UX still to be completed;
- `practice_sessions`, immutable `attempts`, self-contained version-pinned feedback snapshots, `error_log`, and `review_states`;
- role-gated builders, local draft recovery, attempt history, source-note links, and ownership RLS.

The architectural rule is:

> One practice engine → two practice lanes → many registered question kinds

“Financial Statement Practice” is not implemented merely by labelling a `journal_entry` item as a capstone. It requires sequence, shared-case context, staged completion, statement construction, and cross-stage diagnostic behavior.

---

## 3. Goals and success criteria

### 3.1 Product goals

- Convert conceptual understanding into fast, repeatable accounting execution.
- Make financial-statement preparation the central practice environment.
- Make Specific Practice the explicit mechanism for syllabus coverage and targeted repair.
- Give learners a clear choice between practising a bounded skill and completing an integrated accounting output.
- Diagnose errors at the step where they originate, not merely mark the final answer wrong.
- Preserve exam realism while offering a more informative learning mode.
- Build transfer by retesting the same rule with changed entities, wording, and numbers.
- Provide full-syllabus coverage through integrated cases plus mixed objective questions.
- Make every generated case reproducible, solvable, and accounting-valid.

### 3.2 Learner outcomes

The learner should be able to:

- turn an unadjusted trial balance and notes into adjusted financial statements;
- prepare accounts for sole traders and limited companies;
- reconstruct a statement of cash flows;
- prepare simple consolidated statements or extracts;
- reconcile control accounts, correct errors, and reconstruct missing records;
- calculate and interpret ratios;
- identify the requirement and method without being told the topic;
- complete exam-style inputs accurately within time.

### 3.3 North-star metric

**First-pass transfer mastery:** percentage of skills answered correctly, without hints, in a new context at least once after an initial failure.

This is superior to raw question accuracy because repeating a memorised question is not evidence of transferable proficiency.

### 3.4 Supporting product metrics

- Capstone completion rate
- First-attempt accuracy
- Altered-retest accuracy
- Median time per mark
- Hint dependence
- Repeat-error rate by diagnostic dimension
- Statement-balancing rate
- Mixed objective-test coverage by syllabus outcome
- Seven-day retained mastery
- Full-mock score and completion rate

### 3.5 MVP success bar

The MVP is successful when:

- a learner can complete one full sole-trader case from setup to retest;
- every answer is marked deterministically;
- every incorrect answer produces a useful diagnostic classification;
- the app can generate an altered but equivalent case from a seed;
- the resulting statement of financial position balances exactly;
- the learner can resume an unfinished attempt without losing inputs;
- automated tests verify every accounting invariant.

---

## 4. Non-goals

The initial product will not:

- create separate applications, attempt stores, or scoring engines for the two practice lanes;
- replace the official ACCA Practice Platform;
- reproduce or republish ACCA specimen questions;
- teach the entire accounting syllabus as a textbook;
- use an LLM as the final authority for numerical marking;
- provide advanced group accounting beyond FA/FFA scope;
- prepare consolidated statements of cash flows;
- provide audit, tax, or management-accounting practice;
- support collaborative classrooms, tutor billing, or institutional reporting in the MVP;
- optimise full financial-statement proformas for small mobile screens.

---

## 5. Users and jobs to be done

### 5.1 Primary user

An independent FA/FFA learner who understands accounting concepts but needs procedural fluency before an exam.

### 5.2 Primary jobs

- “Give me one hard case that combines the rules I need to execute.”
- “Show me exactly why I got this wrong.”
- “Let me repair only the weak part, then test whether I can transfer it.”
- “Let me practise the real input style and time pressure of the exam.”
- “Tell me whether my problem is knowledge, calculation, double entry, presentation, or reading the requirement.”

### 5.3 Secondary user

The content author or administrator who creates templates, validates cases, versions syllabus mappings, and reviews item performance.

---

## 6. Exam and content guardrails

### 6.1 Current exam model

The app must support the current FA/FFA exam structure:

- Section A: 35 objective-test questions, two marks each.
- Section B: two multi-task questions, 15 marks each.
- Section B covers accounts preparation and consolidation.
- The live exam is two hours and all questions are compulsory.

The syllabus and exam metadata must be configuration, not hard-coded UI text, so future versions can be added without rewriting the product.

### 6.2 CBE scoring behavior

In exam simulation:

- each answer cell is marked independently;
- no own-figure rule is applied;
- numeric formatting follows the unit stated in the requirement;
- inputs use absolute values unless the question explicitly requires a sign;
- proformas are supplied where appropriate;
- feedback is hidden until the attempt is submitted.

In learning mode, the app may award internal diagnostic credit for correct process steps, but that credit must never be presented as the official exam mark.

### 6.3 IFRS 18 terminology

Content applicable from September 2025 onward must use the relevant IFRS 18 presentation and terminology, including:

- operating profit as the starting point for indirect operating cash flow;
- interest received classified as investing;
- interest paid classified as financing;
- relevant statement-of-profit-or-loss categories and subtotals;
- terminology aliases only where the syllabus permits them.

Every test template must carry a `syllabusVersion` and `standardsVersion`.

### 6.4 Copyright and originality

- Do not copy, scrape, paraphrase closely, or reconstruct ACCA specimen questions.
- Use original fictional entities, narratives, numbers, distractors, and proformas.
- Official materials may inform scope and format only.
- Store a source/provenance note for each authored template.

---

## 7. Core learning loop

### 7.1 Relationship between the lanes

The default learning journey is:

> Financial Statement Practice case → root diagnosis → Specific Practice repair → altered Financial Statement Practice retest

Specific Practice also operates independently for syllabus areas that do not naturally appear often enough in statement preparation:

> Coverage blueprint → short mixed quiz → error log → due review

The first loop develops integration and transfer. The second prevents the capstone strategy from leaving syllabus gaps.

### 7.2 Whole–part–whole loop

1. **Integrated case:** learner attempts a realistic accounting output.
2. **Diagnosis:** system identifies the earliest failed step and affected downstream outputs.
3. **Micro-drill:** learner completes one to five focused items on the failed step.
4. **Altered case:** learner receives a changed case testing the same underlying rule.
5. **Timed retest:** learner repeats without scaffolding and under a target time.
6. **Mastery update:** skill is updated only after successful transfer.

### 7.3 Scaffolding levels

| Level | Name | Learner support |
|---|---|---|
| 0 | Exam | Requirement and proforma only |
| 1 | Guided | Adjustment checklist and optional scratchpad |
| 2 | Execution chain | Trigger, rule, calculation, double entry, and effect prompts |
| 3 | Worked repair | One worked example followed by near transfer |

The system should start a new learner at Level 1. It may move upward when failures persist and downward when the learner demonstrates transfer.

### 7.4 Diagnostic precedence

When several answers are wrong, diagnose the earliest causal failure:

1. Requirement reading
2. Account identification
3. Account classification
4. Rule retrieval
5. Calculation
6. Double entry
7. Statement placement
8. Presentation or input formatting
9. Time management

Example: if closing inventory is calculated incorrectly and therefore cost of sales and inventory are both wrong, the root diagnosis is calculation or rule retrieval—not three separate statement-placement errors.

---

## 8. Practice product architecture

### 8.1 Lane 1: Specific Practice

Purpose: deliberately practise a bounded skill or assemble short objective-test coverage.

Entry points:

- choose a system, syllabus area, topic, skill, tag, or difficulty;
- take an authored quiz;
- start a mixed objective set;
- practise due review items;
- launch a repair set from an error;
- retry a specific item with an altered variant where supported.

Typical session length is 2–30 minutes. Items may be standalone or grouped in an ordered quiz, but they do not share learner-produced figures across stages.

Specific Practice owns:

- regulatory framework and qualitative characteristics;
- business documents and accounting systems;
- account classification, normal balances, double entry, and journals;
- isolated reporting-date adjustments;
- reconciliations, suspense accounts, errors, and incomplete-record techniques;
- ratio calculations and interpretation prompts;
- any micro-drill generated from a capstone diagnosis;
- interleaved Section A coverage.

The existing `matrix_select` and `journal_entry` kinds belong here immediately. New objective kinds register into the same engine.

### 8.2 Lane 2: Financial Statement Practice

Purpose: integrate skills into a realistic accounting workflow whose endpoint is a statement, statement extract, corrected balance feeding a statement, or interpretation of statements.

Financial Statement Practice owns the six families in Section 9. A case may contain:

- shared scenario and source data;
- ordered stages;
- multiple registered question kinds;
- stage dependencies;
- workings;
- statement construction;
- case-level marks and diagnostics;
- altered-case retest.

The minimum new platform primitives are:

- `practice_spines` or equivalent case-sequence definition;
- ordered `spine_stages`;
- immutable shared case snapshot;
- a `statement_prep` question kind;
- stage-level and case-level progress;
- explicit dependency and carry-forward policy;
- case-level feedback assembled from version-pinned item feedback.

### 8.3 Delivery modes

Delivery mode is independent of practice lane.

| Mode | Purpose | Feedback and support |
|---|---|---|
| Learn | Build the method | Untimed by default; hints; execution-chain prompts; immediate or stage feedback |
| Practice | Build independent fluency | Optional timer; limited support; feedback after item, quiz, or case section |
| Exam | Simulate CBE behavior | Strict timer; no hints; no pre-submit correctness; independent-cell official scoring |

Both lanes must support Learn, Practice, and Exam where the selected content is eligible.

### 8.4 Session presets

Presets configure a lane, delivery mode, content selection, length, and timing. They are not new engines.

| Preset | Default composition |
|---|---|
| Quick specific drill | Specific Practice; one skill; 5–10 items |
| Mixed coverage set | Specific Practice; interleaved syllabus blueprint; 15–30 items |
| Repair session | Specific Practice; one diagnosed root skill; worked item, near transfer, no-hint check |
| Financial statement capstone | Financial Statement Practice; one family and case spine |
| Full mock | 35 two-mark OTs plus accounts-preparation and consolidation MTQs; 120 minutes |

Full mock is an assessment composition across the two lanes:

- Section A is assembled from Specific Practice items;
- Section B is assembled from Financial Statement Practice spines;
- scoring, navigation, and submission remain shared.

### 8.5 Coverage responsibility

| Accounting system | Specific Practice | Financial Statement Practice |
|---|---|---|
| Govern | Primary coverage mechanism | Context only when naturally relevant |
| Record | Isolated documents, books, double entry, and journals | Transactions and corrections embedded in a case |
| Measure | Targeted adjustment and valuation drills | Adjustments feeding statement outputs |
| Verify | Primary technique and repair drills | Corrected balances feeding statements or extracts |
| Report | Terminology and isolated presentation checks | Primary integration mechanism |
| Interpret | Ratio and explanation drills | Interpretation family using completed statements |

Neither lane is optional. Financial Statement Practice carries the learning spine; Specific Practice closes coverage and proficiency gaps.

---

## 9. Financial Statement Practice families

### 9.1 Family 1: Sole-trader accounts preparation

**Input**

- Entity narrative
- Unadjusted trial balance
- Reporting-date adjustments
- Required proformas or extracts

**Core adjustment pool**

- closing inventory;
- inventory write-down to lower of cost and net realisable value;
- depreciation, including method and time apportionment;
- accruals and prepayments;
- irrecoverable receivables;
- allowance for receivables;
- loan interest;
- provisions and contingencies where within syllabus scope;
- capital and drawings;
- correction of one relevant error.

**Required outputs**

- adjustment workings;
- statement of profit or loss;
- statement of financial position;
- closing-capital reconciliation;
- selected double entries in guided mode.

**Difficulty progression**

- Foundation: four explicit adjustments, clean trial balance.
- Standard: six to eight adjustments, mixed wording.
- Advanced: combined adjustments, one irrelevant note, one error, tighter time.

### 9.2 Family 2: Limited-company accounts preparation

Use the same accounting engine as Family A, then add:

- ordinary share capital;
- share premium;
- retained earnings;
- loan finance and interest;
- income tax;
- dividends;
- revaluation surplus where in scope;
- company-specific presentation.

The key conceptual transition is:

> Sole-trader capital and drawings → share capital, reserves, and distributions

**Required outputs**

- statement of profit or loss and other comprehensive income or extracts;
- statement of financial position or extracts;
- relevant equity or reserve calculations;
- selected adjustment workings.

### 9.3 Family 3: Statement-of-cash-flows reconstruction

**Input**

- comparative statements of financial position;
- statement of profit or loss;
- PPE reconciliation or note;
- tax, dividend, borrowing, share, and disposal information.

**Required outputs**

- operating activities;
- investing activities;
- financing activities;
- reconciliation of opening and closing cash.

**Variants**

- direct method;
- indirect method;
- full statement;
- classification extracts;
- missing cash-flow balancing figures.

The generator must enforce that total cash movement equals closing cash minus opening cash.

### 9.4 Family 4: Consolidation

**Input**

- parent and subsidiary statements or trial balances;
- acquisition date and ownership;
- share capital and reserves;
- consideration transferred;
- intra-group transactions and balances;
- optional non-controlling interest, unrealised profit, or part-year data.

**Skills**

- control and group structure;
- subsidiary net assets at acquisition;
- goodwill;
- non-controlling interest;
- group retained earnings;
- intra-group balance elimination;
- unrealised profit elimination;
- part-year acquisition;
- consolidated statement of financial position;
- consolidated statement of profit or loss;
- associates at principle or extract level where required.

**Rule**

> Combine like items − eliminate intra-group effects + apply group adjustments

Do not include consolidated cash-flow statements.

### 9.5 Family 5: Reliability and reconstruction

These tasks should usually feed a corrected balance into a statement extract.

**Modules**

- bank reconciliation;
- receivables-ledger control account;
- payables-ledger control account;
- correction of errors;
- suspense account;
- incomplete records;
- missing sales, purchases, cash, capital, or profit.

**Required flow**

> Diagnose record problem → reconstruct or correct amount → record correction → feed corrected balance into reporting output

### 9.6 Family 6: Interpretation

**Input**

- completed statements;
- comparative period or benchmark;
- selected operational context.

**Required outputs**

1. Calculate ratios.
2. Identify the movement.
3. Explain a plausible operational cause.
4. State a limitation or alternative explanation.

**Ratio groups**

- profitability;
- liquidity;
- efficiency;
- gearing;
- investor ratios where in scope.

Free-text explanations may use rubric-assisted or LLM-assisted evaluation, but numerical ratio marking must remain deterministic. If LLM evaluation is unavailable, use structured response options and author-defined key-point rubrics.

### 9.7 Relationship to Specific Practice

Mixed sets in Specific Practice are the coverage mechanism for topics not sufficiently exercised in capstones, including:

- purpose and users;
- qualitative characteristics;
- regulatory framework;
- concepts, elements, recognition, and measurement;
- source documents and accounting systems;
- double entry and ledgers;
- reconciliations and suspense;
- standards and presentation;
- ratios and interpretation.

The default mixed set should use interleaving: no more than two consecutive questions from the same lowest-level skill.

Capstone errors must be able to launch a Specific Practice repair session without copying the capstone into a second content model. The repair session references the diagnosed skill and selects compatible registered items.

---

## 10. Content blueprint

### 10.1 Skill taxonomy

Every assessable skill requires:

- `skillId`
- display name
- accounting system (Govern, Record, Measure, Verify, Report, Interpret)
- syllabus domain and learning outcome
- prerequisite skill IDs
- difficulty band
- common misconceptions
- supported question types
- repair template IDs
- version-validity dates

### 10.2 Registered question kinds

Question behavior must be implemented through the existing registry contract. A kind supplies:

- learner runner;
- builder editor;
- configuration validator;
- pure deterministic scorer;
- feedback-snapshot renderer data;
- mode eligibility and accessibility metadata.

**Existing kinds to preserve**

| Kind | Primary use |
|---|---|
| `matrix_select` | Classification, effects, documents, normal balances, error types, and other shared-option matrices |
| `journal_entry` | Debit account, credit account, and amount entry for one or more journal rows |

**Required next kinds**

| Kind | Primary use |
|---|---|
| `single_select` | One correct option with misconception-mapped distractors |
| `multi_select` | Multiple correct options with explicit partial-mark policy |
| `numeric_entry` | Calculation, ratio, missing figure, or adjustment amount |
| `statement_prep` | Multi-line statement or extract construction with independent scorable cells |
| `structured_response` | Structured interpretation using key points or constrained response components |

Matching, ordering, and table-completion behavior should be added only when an existing kind cannot express the learning requirement cleanly. A case-level MTQ is a composition of registered kinds, not itself a special scorer.

### 10.3 Question metadata

Each question must include:

- unique ID and version;
- practice-lane eligibility;
- family and skill tags;
- syllabus and standards versions;
- mode eligibility;
- prompt and scenario references;
- answer type;
- correct answer specification;
- accepted aliases;
- numeric tolerance and rounding rule;
- unit and scale, such as `$`, `$000`, or percentage;
- mark allocation;
- independent-cell grouping;
- explanation;
- execution-chain explanation;
- misconception-to-distractor mapping;
- estimated time;
- difficulty parameters;
- content-author and reviewer status.

### 10.4 Case-template structure

Each integrated case must contain:

- fictional entity and reporting period;
- case family;
- base facts;
- account list;
- balanced unadjusted trial balance or source records;
- adjustment templates;
- derived truth model;
- tasks and proformas;
- mark scheme;
- diagnostic graph;
- generation constraints;
- expected financial statements;
- invariant checks;
- variant seed;
- provenance and version metadata.

Every stage references a versioned `learning_item` and may add case-bound context. A stage must not duplicate its answer key into client-readable case configuration.

### 10.5 Initial content pack

**Vertical-slice MVP**

- 3 sole-trader base templates;
- at least 10 deterministic variants per template;
- 8 adjustment micro-drill templates;
- one authored Specific Practice quiz for each of Systems 1–6;
- 30 mixed objective questions across at least four registered kinds;
- 1 diagnostic review report.

**Broader MVP**

- 3 limited-company templates;
- 2 cash-flow templates;
- 3 consolidation templates;
- 6 reliability templates;
- 3 interpretation templates;
- 150 original objective questions.

Content quantity must not outrun validation quality. One fully validated template with safe variants is preferable to ten hand-authored cases with inconsistent answers.

---

## 11. Deterministic accounting engine

### 11.1 Source-of-truth rule

All numerical answers must be produced by a deterministic accounting engine. An LLM may:

- generate a draft narrative;
- suggest wording variants;
- explain a known correct result;
- classify free-text reasoning with safeguards.

An LLM must not:

- determine the official numerical answer;
- decide whether financial statements balance;
- invent a journal entry without validation;
- mutate a case after the truth model is calculated;
- assign official exam marks.

### 11.2 Account model

Each account requires:

- account code;
- display name and accepted aliases;
- account type: asset, liability, equity, income, expense;
- normal balance;
- current/non-current classification where relevant;
- financial-statement destination;
- cash-flow category where relevant;
- consolidation treatment where relevant.

### 11.3 Double-entry model

Every posted adjustment must:

- contain at least two lines;
- have total debits equal total credits;
- reference a rule and source note;
- update ledger balances;
- update affected statement lines;
- preserve an audit trail.

### 11.4 Core invariants

The test suite must fail generation if any invariant fails:

- trial-balance debits equal credits;
- every journal balances;
- adjusted trial balance balances;
- assets equal liabilities plus equity;
- closing capital reconciles for sole traders;
- cash-flow movement reconciles opening and closing cash;
- consolidated statements eliminate the parent’s investment against subsidiary equity correctly;
- intra-group balances eliminate symmetrically;
- unrealised profit adjustments affect both profit/equity and the relevant asset;
- ratio answers recompute from the displayed source figures;
- marks add to the declared question and test totals;
- every displayed answer can be derived from information available to the learner;
- rounding occurs only at the defined stage.

### 11.5 Seeded case generation

- Use a deterministic pseudo-random seed.
- Store the seed on every attempt.
- Generate within author-defined ranges and constraints.
- Re-run invariant checks after generation.
- Reject and regenerate invalid variants.
- Permit exact reproduction for support and review.

### 11.6 Difficulty controls

Difficulty must be changed by reasoning complexity, not simply larger numbers.

Parameters include:

- number of adjustments;
- number of linked effects;
- explicit versus implicit wording;
- irrelevant information;
- mixed account aliases;
- time pressure;
- acquisition timing;
- intra-group complexity;
- number of proforma cells;
- required transfer from records to statements.

---

## 12. Marking and diagnostic engine

### 12.1 Official mark

The official mark is calculated from submitted answer cells according to the selected test mode.

- Exact match for categorical inputs.
- Normalised alias match for account names.
- Decimal-aware comparison for numeric inputs.
- Explicit tolerance only where the authored rule permits rounding.
- Independent marks for independent cells.
- No own-figure rule in exam mode.

### 12.2 Diagnostic score

Maintain a separate, non-exam diagnostic score across:

- requirement comprehension;
- account identification;
- classification;
- rule selection;
- calculation;
- double entry;
- statement placement;
- presentation/input;
- interpretation;
- speed.

### 12.3 Confidence capture

Allow the learner to mark each task:

- confident;
- unsure;
- guessed.

Use confidence only for diagnosis and prioritisation. Do not change official marks.

High-confidence wrong answers should receive higher repair priority than low-confidence wrong answers because they indicate a stable misconception.

### 12.4 Error graph

Each integrated case needs a dependency graph from source skill to downstream outputs.

Example:

> Closing-inventory rule → inventory calculation → cost of sales → profit → closing capital → statement of financial position

The results page must distinguish:

- **root error:** earliest incorrect node;
- **downstream consequence:** answer affected by the root error;
- **independent error:** separate mistake not caused by the root.

### 12.5 Mastery model

Track mastery per skill using evidence, not a single percentage.

Suggested state:

- `unseen`
- `introduced`
- `guided_success`
- `independent_success`
- `transfer_success`
- `timed_mastery`
- `needs_repair`

Promotion rules:

- Independent success requires no hints.
- Transfer success requires changed numbers or context.
- Timed mastery requires correct transfer within target time.
- A single repeated question must never produce transfer mastery.
- Mastery decays into a review-due state after a configurable interval; it does not reset to zero.

### 12.6 Repair selection

Repair priority score should consider:

- root-error severity;
- exam weight;
- prerequisite centrality;
- confidence mismatch;
- recurrence;
- time until target exam;
- recency of last successful transfer.

---

## 13. User experience and screens

### 13.1 Design principles

- Desktop-first for full statements and proformas.
- Clear, calm, high-information layout.
- Resemble a professional accounting workspace, not a gamified children’s quiz.
- Use colour for state and diagnosis, not decoration.
- Keep the case facts visible while the learner works.
- Never reveal correctness accidentally before submission in exam mode.
- Make numeric input fast with keyboard navigation.
- Preserve working state automatically.

### 13.2 Dashboard

Display:

- next recommended action;
- two clearly separated entry cards: Specific Practice and Financial Statement Practice;
- current exam date and time remaining;
- latest mock score;
- mastery by six-system architecture;
- recurring root errors;
- capstone progress;
- repair queue;
- primary entry buttons for Specific Practice and Financial Statement Practice.

The primary call to action should be one recommendation, such as:

> Continue: Sole-trader Case 2 — repair accruals and statement placement

The recommendation may point into either lane. The two lane cards remain visible so the learner can override the recommendation intentionally.

### 13.3 Practice setup

Controls:

- practice lane;
- content selector appropriate to the lane:
  - Specific Practice: system, syllabus area, topic, skill, authored quiz, due review, or mixed set;
  - Financial Statement Practice: family, entity/context, case, and stage scope;
- delivery mode;
- difficulty;
- syllabus version;
- number of questions or case length;
- timer;
- scaffolding level;
- include/exclude mastered skills;
- random or targeted seed.

Provide sensible presets:

- 5–10-minute specific drill;
- 10-minute repair;
- 20–45-minute financial statement capstone;
- 30-minute mixed set;
- 120-minute full mock.

The user must never need to understand internal question-kind names to start practice.

### 13.4 Integrated case workspace

Desktop layout:

- **Top bar:** case name, mode, timer, marks, progress, flag, submit.
- **Left pane:** scenario, trial balance, notes, source records, and reference tabs.
- **Main pane:** current task, statement proforma, journal builder, or calculation inputs.
- **Optional right drawer:** scratchpad, adjustment checklist, calculator, and formula reference, subject to mode.

Interaction requirements:

- resizable or collapsible side panes;
- sticky table headers;
- keyboard movement between proforma cells;
- automatic numeric normalisation;
- no thousands separators required;
- visible unit and scale beside every numeric area;
- autosave after each meaningful input;
- flag and revisit tasks;
- validation for blank or invalid input without indicating correctness.

### 13.5 Specific Practice workspace

The Specific Practice runner must support:

- one-item and ordered-quiz sessions;
- a consistent shell around all registered question kinds;
- progress, flagging, keyboard submission, and draft recovery;
- optional immediate feedback in Learn mode;
- deferred feedback in Practice and Exam modes;
- a result summary that groups errors by system, topic, skill, and diagnostic code;
- launch into due review or a targeted repair set;
- source-note links preserved from the existing learner experience.

### 13.6 Execution-chain interface

In guided mode, an adjustment may show five collapsible stages:

1. What fact triggered an adjustment?
2. What accounting rule applies?
3. What amount should be recognised?
4. Which accounts are debited and credited?
5. Where does each effect appear?

Stages should progressively unlock or may be skipped. The learner must be able to switch to a compact view after proficiency develops.

### 13.7 Results and diagnosis

Lead with:

- official score;
- completion time;
- target pace comparison;
- number of root errors;
- strongest and weakest diagnostic dimensions.

Then show:

- financial-statement output comparison;
- root errors versus downstream consequences;
- execution-chain explanation;
- repair recommendations;
- button to start repair;
- button to attempt altered case;
- answer review with the learner’s response retained.

Do not reduce the report to a red/green answer list.

### 13.8 Repair session

Show:

- one-sentence diagnosis;
- the missing rule or method;
- one focused worked example if required;
- one near-transfer item;
- one no-hint check;
- success condition and next step.

### 13.9 Analytics

Views:

- six-system map;
- skill heatmap;
- error-type trend;
- accuracy versus confidence;
- accuracy versus time;
- recurring misconceptions;
- test-family readiness;
- syllabus coverage;
- attempt history.

### 13.10 Responsive behavior

- Full cases: desktop and tablet landscape.
- Mobile: objective questions, repair drills, review, and analytics.
- If a learner opens a full proforma on a narrow screen, show a clear recommendation to continue on a larger device while retaining read-only access.

---

## 14. Functional requirements

### 14.1 Authentication and profile

- User can create an account or use the existing project authentication.
- User can set exam name, target date, syllabus version, and preferred currency display.
- User progress persists across devices.

### 14.2 Test assembly

- Assemble by practice lane, family or skill, difficulty, delivery mode, and duration.
- Prevent duplicate questions within an attempt.
- Respect syllabus validity.
- Support seeded deterministic generation.
- Store an immutable snapshot of rendered case data with the attempt.
- Build Specific Practice quizzes from ordered `quiz_items`.
- Build Financial Statement Practice cases from ordered spine stages sharing one immutable case snapshot.
- Build full mocks by composing a Specific Practice Section A with Financial Statement Practice Section B spines.

### 14.3 Attempt lifecycle

States:

- `created`
- `in_progress`
- `paused`
- `submitted`
- `auto_submitted`
- `marked`
- `reviewed`
- `abandoned`

Rules:

- exam attempts cannot be edited after submission;
- learning attempts may be retried but each retry is a new attempt;
- the source case snapshot remains unchanged;
- autosave must be idempotent;
- elapsed active time excludes a valid pause only outside strict exam mode.

### 14.4 Answer input

- Save raw input and normalised value.
- Store confidence, hints used, elapsed time, and change count.
- Allow blank submission with confirmation.
- Never send the correct answer to the client before submission in exam mode.

### 14.5 Marking

- Mark server-side.
- Return official mark and diagnostic result separately.
- Preserve answer-spec version.
- Log marking exceptions.
- Re-mark only when an authorised answer-spec version changes.

### 14.6 Review

- Display prompt, learner answer, correct answer, explanation, execution chain, and skill tags.
- Allow filtering to incorrect, flagged, guessed, or slow items.
- Link every root error to a repair session.

### 14.7 Recommendations

- Recommend one next action, not a long undifferentiated list.
- Prioritise unfinished repair loops before new content.
- Avoid recommending a full mock when core capstone skills are still unseen unless the learner explicitly requests it.

### 14.8 Content authoring

Minimum author tools:

- create and version skill records;
- create question and case templates;
- preview generated variants;
- run invariant validation;
- view truth model and workings;
- approve/reject content;
- retire content by syllabus version;
- duplicate a template without copying attempt data.
- create, order, preview, publish, and archive Specific Practice quizzes;
- create, order, validate, and publish Financial Statement Practice spines;
- reuse an eligible learning item in more than one quiz or spine without cloning its answer specification.

---

## 15. Data model

The implementation may adapt naming to the existing codebase, but it must preserve these concepts.

### 15.1 Core entities

| Concept / existing table | Purpose |
|---|---|
| `UserProfile` | Exam settings and preferences |
| `SyllabusVersion` | Validity dates, exam pattern, standards version |
| `Skill` | Atomic assessable competency |
| `SkillPrerequisite` | Directed skill dependency |
| `learning_items` | Existing versioned registered-kind item configuration and metadata |
| `learning_item_answers` | Existing editor-only versioned answer specification |
| `quizzes` | Existing Specific Practice collection definition |
| `quiz_items` | Existing ordered membership of learning items in a quiz |
| `practice_spines` | New Financial Statement Practice case/sequence definition |
| `spine_stages` | New ordered stage membership, dependencies, marks, and stage policy |
| `case_templates` | New authored shared-case facts, generation rules, and truth-model reference |
| `GeneratedCase` | Immutable seed-derived case snapshot |
| `TestDefinition` | Rules for assembling an attempt |
| `practice_sessions` | Existing learner session, optionally linked to a quiz or spine |
| `attempts` | Existing immutable submitted attempt and feedback snapshot |
| `AttemptItem` | Question/task instance in an attempt |
| `Response` | Raw and normalised learner input |
| `AnswerSpec` | Logical concept implemented by `learning_item_answers` |
| `DiagnosticEvent` | Root, downstream, and independent errors |
| `SkillEvidence` | Attempt-level mastery evidence |
| `MasteryState` | Current learner state per skill |
| `RepairSession` | Focused corrective loop |
| `error_log` | Existing wrong-cell record used to seed repair |
| `review_states` | Existing per-user review schedule |
| `ContentValidationRun` | Invariant and QA results |

Do not replace existing tables merely to match the conceptual names in this PRD. Prefer additive migrations and compatibility adapters.

### 15.2 Suggested `Attempt` fields

```text
id
userId
testDefinitionId
mode
practiceLane
syllabusVersionId
generatedCaseId
quizId
spineId
spineStageId
seed
state
officialMarksEarned
officialMarksAvailable
startedAt
submittedAt
activeSeconds
timerSeconds
scaffoldingLevel
createdAt
updatedAt
```

### 15.3 Suggested `Response` fields

```text
id
attemptItemId
answerCellId
rawValue
normalisedValue
confidence
hintsUsed
firstAnsweredAt
lastAnsweredAt
elapsedSeconds
changeCount
isCorrect
marksEarned
diagnosticCode
```

### 15.4 Suggested diagnostic codes

```text
READ_REQUIREMENT
IDENTIFY_ACCOUNT
CLASSIFY_ACCOUNT
SELECT_RULE
CALCULATE_AMOUNT
APPLY_DOUBLE_ENTRY
PLACE_IN_STATEMENT
PRESENT_INPUT
CONSOLIDATION_LOGIC
CASH_FLOW_CLASSIFICATION
INTERPRET_RESULT
TIME_MANAGEMENT
```

### 15.5 Spine and carry-forward policy

Each `spine_stage` requires:

```text
id
spineId
position
learningItemId
learningItemVersion
stageType
marksAvailable
dependsOnStageIds
inputBindingSpec
outputBindingSpec
officialScoringPolicy
diagnosticCarryForwardPolicy
isRequired
```

For MVP official scoring, use the static answer key and independent-cell marking required by the CBE. Do not apply an own-figure rule to official marks.

Learning diagnostics may label a later wrong figure as a downstream consequence when it exactly carries a learner’s earlier error. That label must not convert the cell into an officially correct answer. Store both outcomes separately:

- `officialIsCorrect`: compared with the versioned model answer;
- `diagnosticRelationship`: `root`, `downstream_carried`, or `independent`.

---

## 16. Service and API boundaries

Use the existing project architecture where available. At minimum, separate:

1. **Content service:** templates, skills, syllabus versions.
2. **Generation service:** seed-based case construction and invariant validation.
3. **Attempt service:** state, autosave, timing, and submission.
4. **Marking service:** deterministic evaluation and official score.
5. **Diagnostic service:** causal error graph and repair selection.
6. **Mastery service:** evidence aggregation and recommendations.

Suggested endpoints or server actions:

```text
POST   /tests/assemble
POST   /attempts
GET    /attempts/:id
PATCH  /attempts/:id/state
PUT    /attempts/:id/responses/:cellId
POST   /attempts/:id/submit
GET    /attempts/:id/results
POST   /attempts/:id/repair
POST   /attempts/:id/retest
GET    /mastery
GET    /recommendations/next
POST   /admin/templates/:id/validate
POST   /admin/templates/:id/generate-preview
```

Security requirement: correct answers and truth-model payloads must not be included in pre-submission client responses in exam mode.

---

## 17. Recommendation logic

### 17.1 Default two-day intensive sequence

For an imminent exam, offer this preset:

1. Sole-trader accounts-preparation case.
2. Repair failed adjustments.
3. Altered sole-trader retest.
4. Limited-company accounts-preparation case.
5. Consolidation case.
6. Cash-flow case.
7. Mixed Section A set.
8. Full timed mock.
9. Repair recurring root errors only.
10. Final timed retest.

### 17.2 Next-best-action rules

Priority order:

1. Resume an interrupted strict-timer attempt only if policy permits.
2. Complete an open repair loop.
3. Retest a repaired skill in altered context.
4. Address a repeated high-confidence misconception.
5. Practise a guaranteed Section B family not yet independently successful.
6. Fill high-weight syllabus coverage gaps.
7. Run a mixed set or mock.

---

## 18. Non-functional requirements

### 18.1 Performance

- Initial dashboard load under 2.5 seconds on a normal broadband connection.
- Answer autosave acknowledgement under 500 ms at p95 where practical.
- Case generation under 2 seconds for normal templates.
- Marking under 3 seconds for a full mock, excluding optional free-text evaluation.

### 18.2 Reliability

- No lost responses after an acknowledged autosave.
- Submission is idempotent.
- Generated cases are reproducible by template version and seed.
- Marking results are reproducible by answer-spec version.
- Invariant failure blocks publication and learner delivery.

### 18.3 Accessibility

- WCAG 2.2 AA target.
- Full keyboard operation for proformas.
- Visible focus states.
- Labels for all cells and controls.
- Colour is never the only correctness signal.
- Screen-reader-friendly table headers and captions.
- Timer warnings are announced without stealing focus.

### 18.4 Privacy and security

- Collect only data needed for learning and product operations.
- Encrypt data in transit and at rest using platform capabilities.
- Apply row-level or equivalent user data isolation.
- Do not expose answers, admin validation payloads, or other users’ attempts.
- Rate-limit generation and submission endpoints.

### 18.5 Observability

Log:

- generation failures by invariant;
- marking exceptions;
- autosave failures;
- attempt state transitions;
- content-version mismatches;
- client errors in proforma inputs;
- aggregate item difficulty and discrimination indicators.

---

## 19. Analytics events

Minimum events:

```text
practice_setup_viewed
attempt_started
attempt_resumed
answer_entered
confidence_selected
hint_opened
task_flagged
attempt_submitted
attempt_auto_submitted
result_viewed
root_error_identified
repair_started
repair_completed
altered_retest_started
transfer_success_recorded
mock_completed
recommendation_accepted
```

Do not include correct-answer payloads or sensitive free text in analytics.

---

## 20. Build plan

### Phase 0: Repository and domain alignment

Before writing application code, the agent must:

1. Inspect the existing repository and its project PRD.
2. Reuse existing authentication, design system, routing, database, and deployment conventions.
3. Identify conflicts between this PRD and established project constraints.
4. Record assumptions in a short implementation note.
5. Create the skill taxonomy and accounting-domain types first.
6. Produce a migration map from the as-built tables and question kinds to this PRD; do not create parallel attempt, answer-key, or feedback systems.

### Phase 1: Two-lane information architecture and Specific Practice completion

Build or complete:

- dashboard entry cards for Specific Practice and Financial Statement Practice;
- `practiceLane` in routes, session configuration, and analytics;
- authored quiz creation, ordering, preview, publishing, and learner running UX;
- Learn, Practice, and Exam delivery policies shared across registered kinds;
- mixed-set assembly and syllabus-coverage reporting;
- repair-session assembly from `error_log` and `review_states`;
- compatibility tests for `matrix_select`, `journal_entry`, old attempts, and feedback snapshots.

This phase must not duplicate the runner or scorer.

### Phase 2: Sole-trader Financial Statement Practice vertical slice

Build:

- Financial Statement Practice setup;
- spine and stage persistence;
- shared immutable case snapshot;
- one validated sole-trader case template;
- seeded variant generation;
- trial-balance and notes panel;
- `statement_prep` kind and numeric proforma;
- autosave;
- submission and deterministic marking;
- results with root-error diagnosis;
- bridge into a Specific Practice repair flow;
- altered retest;
- mastery evidence.

This phase must be usable end to end before adding other families.

### Phase 3: Exam mechanics and content expansion

Add:

- question flagging and navigation;
- timer and auto-submit;
- independent-cell scoring;
- remaining required objective question kinds;
- limited-company cases;
- additional sole-trader templates;
- content-author preview and validation.

### Phase 4: Advanced capstones and full mock

Add:

- consolidation;
- cash flows;
- reliability and reconstruction;
- interpretation;
- mixed test assembly;
- full mock mode.

### Phase 5: Adaptive learning

Add:

- mastery analytics;
- causal dependency graphs;
- repair queue;
- next-best-action engine;
- spaced review;
- optional guarded LLM explanations or free-text evaluation.

---

## 21. Acceptance criteria

### 21.1 Two-lane architecture acceptance

- dashboard exposes exactly two primary practice lanes;
- selecting Specific Practice never requires choosing a financial-statement family;
- selecting Financial Statement Practice requires a family or recommended case;
- Learn, Practice, and Exam policies can be applied without branching the scorer by lane;
- `matrix_select` and `journal_entry` continue to run, score, and render historical feedback;
- an editor can assemble and publish an ordered Specific Practice quiz;
- a learner can complete that quiz and receive version-pinned feedback;
- an error can launch a targeted repair session using the same item registry;
- no answer key is exposed before submission;
- existing attempts and error-log entries remain readable after migration.

### 21.2 Financial-statement vertical-slice acceptance

Given a published sole-trader template:

- the same seed always produces the same case;
- the unadjusted trial balance balances;
- all generated adjustments are solvable from displayed facts;
- every generated journal balances;
- the adjusted statement of financial position balances;
- the expected profit and closing capital reconcile;
- the learner can complete all required cells with keyboard only;
- refreshing the page preserves acknowledged inputs;
- submitting twice does not create duplicate results;
- exam mode never exposes correct answers before submission;
- official marks follow independent-cell scoring;
- results identify at least one root diagnostic code for an incorrect case;
- repair targets the root skill;
- altered retest changes surface details while retaining the target rule;
- mastery is not promoted to transfer success until the altered retest is correct without hints.

### 21.3 Content-publication acceptance

A case cannot be published unless:

- all invariants pass across at least 100 generated seeds;
- no unresolved validation error exists;
- every task has an answer specification and explanation;
- all marks reconcile;
- all skill and syllabus tags are present;
- a second reviewer approves accounting correctness;
- originality and provenance fields are complete.

### 21.4 Full-mock acceptance

- test contains 35 two-mark OTs and two 15-mark MTQs;
- total marks equal 100;
- timer defaults to 120 minutes;
- every question is compulsory;
- learner can flag and navigate;
- expiry auto-submits once;
- result reports official score separately from diagnostic insights;
- Section B contains accounts preparation and consolidation.
- Section A is assembled through Specific Practice and Section B through Financial Statement Practice without creating separate attempt histories.

---

## 22. Testing strategy

### 22.1 Unit tests

- debit/credit posting;
- account normal balances;
- trial-balance construction;
- every adjustment calculator;
- statement aggregation;
- closing-capital reconciliation;
- cash-flow classification and reconciliation;
- goodwill, NCI, group retained earnings, and eliminations;
- ratio calculation;
- numeric normalisation;
- rounding and tolerance;
- mastery-state transitions;
- recommendation priority.

### 22.2 Property-based tests

Across random valid seeds:

- debits always equal credits;
- accounting equation always holds;
- cash movement always reconciles;
- changing a seed changes at least one permitted surface value;
- generated values remain inside authored constraints;
- invalid combinations are rejected;
- official marks never exceed available marks.

### 22.3 Integration tests

- assemble → attempt → autosave → submit → mark → diagnose;
- repair → altered retest → mastery update;
- pause/resume policy by mode;
- content version retirement;
- re-marking after authorised answer-spec correction;
- concurrent autosave conflict handling.

### 22.4 End-to-end tests

- complete a sole-trader case correctly;
- complete with a closing-inventory misconception;
- lose connection, reconnect, and resume;
- expire an exam timer;
- complete a full mock;
- use the proforma with keyboard only;
- verify no answer payload is exposed before submission.

### 22.5 Accounting golden cases

Maintain a small set of manually reviewed, fixed “golden cases” for each family. Automated engine changes must match their known workings exactly before deployment.

---

## 23. Risks and mitigations

| Risk | Why it matters | Mitigation |
|---|---|---|
| Numerically invalid generated cases | Destroys trust and teaches errors | Deterministic engine, invariant gate, seed replay, human-reviewed golden cases |
| Overbuilding adaptive AI too early | Delays a usable practice loop | Complete sole-trader vertical slice before LLM features |
| Treating downstream errors as separate weaknesses | Creates noisy repair | Causal diagnostic graph and earliest-failure precedence |
| Too much scaffolding | Learner cannot transfer to exam | Progressive removal and no-hint altered retest |
| Too little syllabus coverage | Capstones miss Section A topics | Mixed OT blueprint and coverage analytics |
| Copying official questions | Copyright and product risk | Original content policy and provenance review |
| Beautiful UI but slow data entry | Reduces exam fluency | Keyboard-first proformas and timed usability testing |
| Hard-coded current syllabus | Product becomes stale | Versioned syllabus and standards configuration |
| LLM grading inconsistency | Unreliable marks | Deterministic official marking; LLM limited to guarded support |

---

## 24. Product decisions that must not be changed silently

The coding agent must preserve these decisions unless the owner explicitly approves a change:

1. Integrated cases are the spine; isolated quizzes are supplementary.
2. The product has two learner-facing practice lanes, powered by one shared engine.
3. Specific Practice is the coverage and repair mechanism; Financial Statement Practice is the integration mechanism.
4. Practice lane and delivery mode are separate dimensions.
5. The learning loop ends with altered transfer, not answer review.
6. Official score and diagnostic score are separate.
7. Numerical marking is deterministic.
8. Exam mode uses independent-cell marking and no own-figure rule.
9. The first new Financial Statement Practice vertical slice is sole-trader accounts preparation.
10. Consolidation is a separate capstone and excludes consolidated cash flows.
11. Difficulty comes from reasoning structure, not merely larger numbers.
12. Content is versioned by syllabus and accounting-standard applicability.
13. Official ACCA questions are not copied or republished.
14. Existing feedback snapshots and historical attempts remain interpretable after product evolution.

---

## 25. Open product choices

These choices may be resolved during implementation without changing the product thesis:

- exact frontend and backend framework, if the existing project does not prescribe them;
- whether the scratchpad is plain text, ledger-shaped, or both;
- whether confidence is captured per task or only per answer group;
- which mastery estimation formula is used initially;
- whether free-text interpretation is structured-only in MVP;
- whether content authoring is an internal page or repository-based files in Phase 1;
- how many altered variants are precomputed versus generated on demand.

When uncertain, prefer the smallest choice that preserves deterministic correctness and the whole–part–whole loop.

---

## 26. Coding-agent handoff

### Required implementation order

1. Inspect the existing project and reconcile this PRD with its architecture.
2. Preserve and regression-test the current registry, server dispatch, RLS, feedback snapshots, and history.
3. Add the two-lane information architecture and finish Specific Practice quiz authoring/running.
4. Define accounting, skill, spine, stage, and case-binding types.
5. Implement the deterministic statement engine and `statement_prep` kind.
6. Build one manually reviewed sole-trader golden case.
7. Add seeded generation and invariant validation.
8. Build the staged case workspace and autosave.
9. Add server-side case marking and causal diagnosis.
10. Bridge capstone errors into Specific Practice repair and altered retest.
11. Add mastery evidence and next-action recommendation.
12. Only then expand content families and full-mock behavior.

### Engineering standard

Do not mark a feature complete because the screen renders. A feature is complete only when:

- accounting output is validated;
- automated tests cover the critical path;
- attempt state survives refresh;
- keyboard interaction works;
- exam-mode answer security is checked;
- errors and empty states are handled;
- the relevant acceptance criteria pass.

### Next build tickets

**Ticket 1 — Establish the two practice lanes without forking the engine**

> Add Specific Practice and Financial Statement Practice as first-class learner entry points and session metadata. Complete quiz authoring and learner-running UX using the existing `quizzes`, `quiz_items`, registry, server-side scoring, feedback snapshot, attempt, error-log, and review-state infrastructure. Preserve all existing `matrix_select` and `journal_entry` behavior and historical attempts.

**Ticket 2 — Implement the first Financial Statement Practice spine**

> Implement a complete sole-trader Financial Statement Practice vertical slice using one fixed golden case. Add spine/stage sequencing and a `statement_prep` kind. The learner must move from an unadjusted trial balance and six reporting-date adjustments to a statement of profit or loss and statement of financial position. Mark all cells deterministically, diagnose the earliest causal error, launch a targeted Specific Practice repair drill, and provide an altered no-hint retest. Do not add AI generation, full mocks, or other entity types until this flow is reliable.

---

## 27. Reference sources

- [ACCA — Exam structure of FA/FFA](https://www.accaglobal.com/gb/en/student/exam-support-resources/fundamentals-exams-study-resources/f3/technical-articles/fa-ffa-structure.html)
- [ACCA — Financial Accounting (FA/FFA) essentials on one page](https://www.accaglobal.com/gb/en/student/exam-support-resources/fundamentals-exams-study-resources/f3/session-cbe-introduction/financial-accounting-fa-essentials-on-one-page.html)
- [ACCA — FFA syllabus and study guide](https://www.accaglobal.com/gb/en/student/exam-support-resources/foundation-level-study-resources/ffa/ffa-syllabus-study-guide.html)
- [ACCA — IFRS 18 Presentation and Disclosure in Financial Statements](https://www.accaglobal.com/gb/en/student/exam-support-resources/foundation-level-study-resources/fa1/technical-articles/fa1_fa2_fa_ffa_ifrs18_faqs.html)
- [ACCA — Adjustments to financial statements](https://www.accaglobal.com/gb/en/student/exam-support-resources/fundamentals-exams-study-resources/f3/technical-articles/adjustments-financial-statements.html)
- [ACCA — Statement of cash flows](https://www.accaglobal.com/gb/en/student/exam-support-resources/fundamentals-exams-study-resources/f3/technical-articles/cashflow-statements2.html)
- [ACCA — Preparing simple consolidated financial statements](https://www.accaglobal.com/gb/en/student/exam-support-resources/fundamentals-exams-study-resources/f3/technical-articles/preparing-simple-consolidated-financial-statements.html)
