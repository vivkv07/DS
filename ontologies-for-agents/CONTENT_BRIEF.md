# Content brief: "Why Agentic Systems Need Ontologies"

Source talk: Frank Coyle (UC Berkeley), AI Engineer World's Fair 2026, ~20 min.
Video: https://www.youtube.com/watch?v=Sir59K8ZDPU

This brief reconstructs the talk's argument as a sequence of "beats". Each beat maps
to one section of the infographic and (where marked) to one motion graphic.

---

## One-line thesis

> **Probabilistic reasoning inside. Logical guardrails outside.**

LLMs are excellent probabilistic reasoners. Agents built on them loop, call tools and
touch real transactions. To be safe and useful they need a formal, symbolic model of
the domain, an **ontology**, sitting *outside* the model as a guardrail.

---

## Beat 1. Two traditions converge  (motion: `03_two_traditions`)

Agentic systems are where two old ideas meet:

| Tradition | What it is | Lineage |
|---|---|---|
| **Agents** | Systems that *perceive, decide, act* in a loop | Cybernetics, classic AI agents, RL, today's LLM tool loops |
| **Ontologies** | Explicit descriptions of the entities, categories and relationships in a domain | Aristotle's *Categories* → Quine ("to be is to be the value of a variable") → Gruber (1993: "explicit specification of a conceptualization") → Semantic Web (RDF, RDFS, OWL, Schema.org, FOAF) |

Symbolic AI and 1980s expert systems used hand-built ontologies (top-down) and failed
to scale. Neural networks went the other way: no explicit world model at all.
**Neuro-symbolic AI** is the reunion: neural networks *tied into* symbolic systems
(rules, knowledge graphs).

## Beat 2. The agent loop is Turing-complete and probabilistic  (motion: `01_agent_loop`)

A modern agent is: an LLM + tools + a loop.

```
while True:
    response = llm(messages, tools)
    if response.stop_reason == "end_turn": break
    for call in response.tool_calls:
        result = execute(call)          # side effects happen here
        messages.append(result)
```

That loop is Turing-complete (it can do anything, including run forever) *and*
probabilistic (every step is sampled). No type checker fully covers that combination.
Today, between "model proposes a tool call" and "tool executes" there is usually
nothing but a JSON-schema check.

## Beat 3. Hallucination is a feature, not a bug  (motion: `02_hallucination`)

An LLM is a next-token sampler. Imagining plausible continuations is *what it is for*.
When an agent issues a duplicate refund it is not malfunctioning; it is generating
the most probable next sequence of tokens. So the fix is not "a better prompt" or a
"paragraph of instructions". The fix is a layer outside the model that can say **no**.

## Beat 4. An ontology is "data as graphs"  (motion: `04_triples_to_graph`)

Everything is a **triple**: `subject — predicate → object`.

```
:Order_123   :placedBy      :Alice
:Order_123   :hasStatus     :Shipped
:Refund_9    :refunds       :Order_123
```

Triples compose into a **knowledge graph**. The *schema* layer (classes, properties,
constraints) is the ontology; the *instance* layer is the data. Standards:

- **RDF** — the triple data model
- **RDFS** — classes, subclasses, `domain` / `range` of properties
- **OWL** — richer logic: transitive, functional, symmetric, disjoint, cardinality
- **SPARQL** — query language over the graph
- **Schema.org / FOAF** — ready-made public vocabularies

## Beat 5. RDFS: domain and range give you inference for free  (motion: `05_domain_range`)

Declare:

```
:teaches  rdfs:domain  :Teacher
:teaches  rdfs:range   :Student
```

Assert one fact: `:Bob :teaches :Scooter`.
A reasoner now *infers*: `:Bob a :Teacher` and `:Scooter a :Student`.
Nobody had to write those two facts. Nobody can contradict them without the reasoner noticing.

## Beat 6. OWL: the constraints that catch real business errors  (motion: `06_owl_properties`)

| OWL feature | Rule | What it catches in an agent |
|---|---|---|
| **Transitive** | if A→B and B→C then A→C | `ancestorOf`: Sue→Mary→Ann ⇒ Sue is Ann's ancestor. Org charts, part-of hierarchies, delegation chains. |
| **Functional** | a property has at most one value | `hasFather` with two different values ⇒ the two "fathers" are the same entity, or the data is wrong. Entity resolution / duplicate detection. |
| **Disjoint classes** | an individual cannot be in both | `Customer` ⟂ `SupportRep` ⇒ a payout routed to the rep instead of the buyer is a logical violation, not a style issue. |
| **Enumerated / constrained values** | value must be one of a fixed set | `hasStatus ∈ {Paid, Shipped, Refunded}` ⇒ "probably shipped" is rejected. |

## Beat 7. Pydantic at the door, ontology at the ledger  (motion: `07_door_and_ledger`)

Two different checks for two different problems:

1. **Pydantic at the door** — type-check the *parameters* of every tool call the model
   proposes. Structure, types, required fields.
2. **Ontology at the ledger** — before committing any side-effecting action, check the
   *semantics* of the result against the domain graph: is this a second refund on the
   same order? Is the payee actually the customer? Is that status value real?

Type checking answers "is this well-formed?". The ontology answers "is this *true* and
*allowed* in our world?".

## Beat 8. Three failures an ontology catches and a prompt cannot  (infographic panel)

1. **Duplicate refund** — `Refund_9 refunds Order_123` already exists; a second one violates a cardinality rule.
2. **Misdirected payout** — payee is typed `SupportRep`; `Customer` and `SupportRep` are disjoint.
3. **Invented status** — `hasStatus "probably shipped"` is not in the enumerated range.

## Beat 9. Building the ontology: top-down and bottom-up  (motion: `08_top_down_bottom_up`)

- **Top-down**: domain experts define the core classes, properties and rules up front.
  Precise, but this is exactly what 1980s expert systems did, and it did not scale.
- **Bottom-up**: extract entities and relationships from real data (documents, tickets,
  customer interactions) with NER / relation extraction, increasingly with LLMs doing the extraction.
- **In practice, both**: experts seed the core business concepts; observed interactions
  keep revealing new entities and relations that get folded in.

## Beat 10. The layered architecture  (motion: `09_layered_architecture`)

```
┌──────────────────────────────────────────┐
│  LLM  — interprets intent, proposes acts │  probabilistic
├──────────────────────────────────────────┤
│  Typed interface (Pydantic / JSON schema)│  constrains inputs
├──────────────────────────────────────────┤
│  Tools — perform execution               │  side effects
├──────────────────────────────────────────┤
│  Ontology + reasoner — checks domain     │  deterministic guardrail
│  consistency before outcomes are accepted│
└──────────────────────────────────────────┘
```

## Takeaways

1. Most agent failures (brittle tools, fragile handoffs, drift, infinite loops) are symptoms of one missing layer: an explicit domain model outside the model.
2. Ontologies are old (Aristotle) and standardized (W3C RDF/RDFS/OWL). You do not have to invent the tooling.
3. Start small: a handful of classes, a few domain/range declarations, one or two disjoint and functional properties already catch the expensive mistakes.
4. Build it top-down *and* bottom-up, and let the graph grow with the data.
5. Neuro-symbolic = probabilistic inside, logical outside.
