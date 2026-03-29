# Article

Harness overfitting is subtle because the system can look correct while depending on one exact wrapper.

The practical answer is not a single magic prompt. It is a repeatable process:

- vary the harness
- keep hidden holdouts
- score the gap between visible and hidden behavior
- make wrapper dependence easy to see

HarnessAmp is built around that loop so teams can harden agents before the wrapper becomes part of the skill.

