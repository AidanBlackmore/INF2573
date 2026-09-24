# Task instructions

Each `## section` below is sent to the Game Master for one kind of request.
The section name must match the task or round type used in the code
(setup, choice, vote_player, predict, recap). Edit the wording freely;
the facts of the game (players, roles, history) are added automatically.

## setup

Cast the group into this world.

- `intro`: 1–2 sentences setting the scene for everyone.
- `roles`: exactly one role per player (use their id in `playerId`). A `title` (a few words, funny, specific to this world) and a one-sentence `blurb`. Roles should give people something to tease each other about, not lore.
- `relationships`: one relationship per player, each connecting two *different* players (ids in `from` and `to`, names in `text`). Make them things the group can argue about during the game: debts, grudges, suspicions, secret alliances, petty rivalries. One sentence each. Try to involve every player at least once.

## choice

Write an **individual choice** round: every player picks what *they* would do.

- `scene`: up to 3 short sentences. A dilemma in this world that puts the group under pressure.
- `prompt`: one short question, e.g. "What do you do?"
- `options`: 3–4 short options. Great options make people reveal something about themselves and then defend it out loud. It's fine for an option to name another player ("Send Sam to check first").
- `callback`: if the scene references an earlier moment, say which one in a few words; otherwise "".

## vote_player

Write a **group vote about a player**: everyone votes for which player in the group best fits the prompt. The app automatically makes every player an option, so leave `options` as an empty list.

- `scene`: up to 3 short sentences setting up the question.
- `prompt`: a "Who would…" / "Who is most likely to…" question about the players themselves, e.g. "Who would betray the others for the last can of food?". Teasing but friendly. It should make people look at each other and laugh.
- Use the history. If the group already voted someone "most likely to betray", a later vote can escalate or flip it.
- `callback`: as above.

## predict

Write a **prediction round** about the TARGET player named below. The target answers honestly for themselves; everyone else tries to guess what the target will pick.

- `scene`: up to 3 short sentences putting the target in a situation. Use their name.
- `prompt`: one short question, e.g. "What does Sam do?"
- `options`: 3–4 short options that are all believable for this person, so guessing is genuinely hard and the answer says something about them. Use their role, relationships and earlier answers.
- `callback`: as above.

## recap

The game is over. Write the finale using only what really happened (listed in the facts). Don't invent events.

- `titles`: one per player (id in `playerId`). A short, funny superlative `title` that the group will remember (like a yearbook award), and a one-sentence `reason` that points to something specific they did or how the group voted about them.
- `memories`: exactly 3 short lines, each capturing a real moment from the game that could become an inside joke. Quote the actual prompts, choices and votes. Choose surprising votes, lonely choices, failed predictions and heavily reacted answers.
- `epilogue`: 1–2 sentences closing the story in this world, mentioning the group.
