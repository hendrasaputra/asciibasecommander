# AGENTS.md
**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.
## 1. Think Before Coding
**Don't assume. Don't hide confusion. Surface tradeoffs.**
Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First
**Minimum code that solves the problem. Nothing speculative.**
- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.
Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes
**Touch only what you must. Clean up only your own mess.**
When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.
When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.
The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution
**Define success criteria. Loop until verified.**
Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"
For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```
Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

## 5. Diagnose Against a Baseline
**Before explaining a failure, prove the unchanged code doesn't have it.**
When something looks broken:
- Run the baseline FIRST. `git stash`, run it the same way. If it fails identically, the bug isn't yours — stop theorising and say so.
- Bisect only once the failure reproduces on demand. In a flaky environment bisection returns clean-looking results that are pure noise, and you will build a confident, wrong story on them.
- Re-run the observation your theory rests on. If it doesn't reproduce, you were reading randomness, not evidence.
A real warning, a plausible mechanism, and several consistent observations are still not a diagnosis. Only a reproducible baseline turns them into one.
**Then write down what you actually established.** Comments and commit messages outlive the session, and the next reader builds on them:
- "X because Y is proven" and "X because Y is unverified and X is safe" are different claims. Write the true one.
- Name the part you couldn't verify: "the warning is real, its consequence is unproven" beats both silence and false certainty.
- "Tests pass" is not "it works". "The data is right" is not "the UI renders". Say which one you checked.
The test: every causal claim traces to an observation you could re-run right now.

## 6. Fail Loudly
**A swallowed error is a bug you will ship.**
- A broad `except` around an optional step must still make the failure visible and distinguishable from "nothing to do". Turning a hard error into a `[WARN]` nobody reads is how a daily refresh silently produced no alerts.
- If a step is skipped, log what was skipped and why, where someone will see it.
- Prefer failing the run over completing it with a hole in the output — a loud failure gets fixed, a quiet one gets trusted.
The test: if this step broke in production, would anyone find out before a user did?

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, clarifying questions come before implementation rather than after mistakes, and claims in comments/commits match what was actually verified.

Read @README.md for the brief repository understanding. Read @HANDOFF.md and @TODO.md for getting started and what's next.
