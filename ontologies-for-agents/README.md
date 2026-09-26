# Why Agentic Systems Need Ontologies — visual explainer

A recreation of the ideas in Frank Coyle's (UC Berkeley) AI Engineer World's Fair talk
[*Why Agentic Systems Need Ontologies*](https://www.youtube.com/watch?v=Sir59K8ZDPU)
as one static infographic plus nine short looping motion graphics.

> **Probabilistic reasoning inside. Logical guardrails outside.**

## What is in here

| Path | What it is |
|---|---|
| `CONTENT_BRIEF.md` | The talk's argument reconstructed as ten "beats", with the examples used in every graphic. Start here if you want the text. |
| `infographic.html` | The full-length infographic as a web page (1200px wide, dark theme). |
| `infographic.png` | The same infographic rendered at 2x (2400 × ~11150 px) for posting or printing. |
| `motion/*.html` | Nine self-contained motion graphics. Open any of them in a browser; each loops. |
| `gifs/*.gif` | The same nine graphics as 800px-wide looping GIFs (20 fps). |
| `gifs/*.mp4` | 1200px H.264 versions of each graphic, for slides or video editors. |
| `tools/` | The render pipeline (see below). |

## The motion graphics

| # | File | Beat of the talk | Loop |
|---|---|---|---|
| 01 | `01_agent_loop` | An agent is an LLM + tools + a loop; that loop is Turing-complete and probabilistic, and today the only gate before a side effect is a JSON-schema check. | 10 s |
| 02 | `02_hallucination` | Hallucination is a feature: a next-token sampler samples "probably shipped". The fix is a layer outside the model, not a longer prompt. | 9 s |
| 03 | `03_two_traditions` | Agents (cybernetics → expert systems → RL → LLM loops) and ontologies (Aristotle → Quine → Gruber → Semantic Web) converge into neuro-symbolic AI. | 12 s |
| 04 | `04_triples_to_graph` | An ontology is "data as graphs": triples assemble into a knowledge graph with a schema layer and an instance layer. | 12 s |
| 05 | `05_domain_range` | RDFS domain/range: assert "Bob teaches Scooter", infer Bob is a Teacher and Scooter a Student. | 10 s |
| 06 | `06_owl_properties` | OWL transitive, functional and disjoint properties, and the business errors each one catches. | 15 s |
| 07 | `07_door_and_ledger` | "Pydantic at the door, ontology at the ledger": a first refund commits, an identical second one is rejected as a duplicate. | 12 s |
| 08 | `08_top_down_bottom_up` | Experts seed the schema top-down; entity extraction grows it bottom-up; in practice you do both. | 12 s |
| 09 | `09_layered_architecture` | LLM → typed interface → tools → ontology + reasoner. Probabilistic inside, logical guardrails outside. | 10 s |

## How the motion graphics work

Each page is plain HTML + CSS. Every animated element runs on a single shared
timeline (`--T`, the loop length), so the page loops cleanly in a browser and can be
scrubbed deterministically for rendering. Choreography is declared inline:

```html
<div class="card" data-in="12" data-out="40" data-fx="rise">…</div>
```

`data-in` / `data-out` are percentages of the loop; `data-fx` is one of
`rise | fade | scale | pop | draw | dim | glow | hl`. `motion/_shared.js` turns those
attributes into CSS keyframes at load time. Anything more custom (a dot travelling
around a ring, a packet moving between stations) is a hand-written `@keyframes` rule.

## Re-rendering

Requires Node 18+ and Playwright's Chromium (plus the ffmpeg that ships with Playwright).

```bash
cd ontologies-for-agents
npm i playwright            # or symlink a global install into node_modules/
node tools/render.mjs       # all pages → gifs/*.gif and gifs/*.mp4
node tools/render.mjs 07    # just the pages whose name contains "07"
node tools/infographic.mjs  # infographic.html → infographic.png
node tools/stills.mjs out/  # three stills per page, for quick layout checks
```

Loop length per page comes from `<meta name="duration" content="12000">` in its HTML.
To change size or frame rate, edit `OUT_W` and `FPS` at the top of `tools/render.mjs`.

## Editing the content

Text lives directly in the HTML files. Colours and fonts are CSS variables in
`motion/_shared.css` (motion) and the `:root` block of `infographic.html`. The
examples (Order_123, Refund_9, Bob the support rep, "Bob teaches Scooter") are
shared across all graphics so they read as one story; if you change one, grep for it.
