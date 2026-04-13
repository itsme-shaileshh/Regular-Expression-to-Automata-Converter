# Regular Expression to Automata Converter

[Live Demo](https://69dd3ae49de0af5ed760ad21--reliable-medovik-620984.netlify.app/)

## Overview

This project is a lightweight web application that converts regular expressions into finite automata using Thompson's construction. It visualizes both the ε-NFA and the equivalent DFA, shows the NFA construction process step-by-step, and provides an interactive DFA string simulator.

Built with plain HTML, CSS, and JavaScript, the app avoids external frameworks and keeps the implementation easy to inspect and extend.

## Features

- Regular expression parsing with a recursive descent parser
- AST-based Thompson construction for ε-NFA generation
- Subset construction to produce an equivalent DFA
- Step-by-step NFA build preview before the final automaton is shown
- SVG-based automaton visualization with pan and zoom
- Transition tables for both ε-NFA and DFA
- Interactive input string simulation with execution tape and logs
- Example regex buttons and user-friendly controls
- Responsive dark theme with polished UI

## Deployment

The app is deployed at:

https://69dd3ae49de0af5ed760ad21--reliable-medovik-620984.netlify.app/

## Project Structure

- `index.html` — application layout, controls, and page structure
- `style.css` — responsive styling, theme, and canvas UI
- `automata.js` — parser, NFA/DFA construction, rendering, simulation, and stepper logic
- `README.md` — project overview, usage, and replication prompt

## Supported Regex Syntax

- `|` union
- `*` Kleene star
- `+` one-or-more
- `?` optional
- `()` grouping
- `ε` epsilon (also accepted as `\e`)

## How to Run Locally

### Option 1: Open directly

1. Open `index.html` in a browser.
2. Enter a regular expression.
3. Click `Build`.

### Option 2: Serve with a local web server

```bash
cd /workspaces/Regular-Expression-to-Automata-Converter
python3 -m http.server 8000
```

Then visit:

`http://localhost:8000`

## Usage

1. Enter a regular expression in the input field.
2. Click `Build` to parse and begin the construction trace.
3. Advance through the NFA build steps with `Prev` and `Next`.
4. Click `Finish Build` to view the completed automaton.
5. Switch to the DFA tab or transition table to inspect the deterministic model.
6. Use the Simulation tab to test input strings and observe acceptance.

## Implementation Notes

### Parsing

- Uses a recursive descent parser.
- Grammar:
  - `Expr → Term (| Term)*`
  - `Term → Factor+`
  - `Factor → Atom (* | + | ?)*`
  - `Atom → char | ε | ( Expr )`
- Produces an AST with nodes like `Char`, `Eps`, `Union`, `Concat`, `Star`, `Plus`, and `Opt`.

### NFA Construction

- Generates ε-NFA fragments with Thompson rules.
- Combines fragments for concatenation, union, star, plus, and optional operators.
- Records intermediate builds for each operator step.

### DFA Conversion

- Computes ε-closures and symbol transitions.
- Builds DFA states from NFA state sets.
- Marks DFA accept states based on the presence of the NFA accept state.

### Visualization

- Renders states, accept rings, and transitions as SVG elements.
- Uses curved edges for bidirectional links and loops for self-transitions.
- Supports interactive zoom and drag navigation.

## Example Regular Expressions

- `(a|b)*abb`
- `a*b+`
- `(a|b)+`
- `ab*c`
- `a(bc)*d`
- `(a|ε)b`

## Replication Prompt

Create a vanilla JavaScript web application that:

- Parses regular expressions into an AST.
- Shows the Thompson construction sequence step-by-step before rendering the final automaton.
- Builds an ε-NFA using Thompson's construction.
- Converts the NFA to a DFA using subset construction.
- Renders both automata as interactive SVG diagrams.
- Displays transition tables and step-by-step construction traces.
- Provides a DFA string simulator with logs, tape visualization, and live feedback.
- Includes a modern, responsive UI with controls for zoom, download, and toggles.

Use only HTML, CSS, and JavaScript. Keep the source small, readable, and well-structured.
