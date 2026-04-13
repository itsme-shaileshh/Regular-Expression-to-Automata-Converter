# Regular Expression to Automata Converter

## Project Overview

Build a polished single-page web application that converts a user-provided regular expression into a visual automaton using Thompson's construction. The application should generate both an ε-NFA and its equivalent DFA, display a transition table for each, and let users simulate input strings step-by-step on the DFA.

This project is implemented in plain HTML, CSS, and JavaScript with no external frameworks.

## Core Requirements

1. **Regex Parsing and AST Construction**
   - Tokenize regex input into symbols and operators.
   - Use a recursive descent parser for the grammar:
     - `Expr → Term (| Term)*`
     - `Term → Factor+`
     - `Factor → Atom (* | + | ?)*`
     - `Atom → char | ε | ( Expr )`
   - Supported operators:
     - `|` union
     - `*` Kleene star
     - `+` one-or-more
     - `?` optional
     - `()` grouping
     - `ε` epsilon (or `\e` as an alternative)
   - Produce an AST with node types: `Char`, `Eps`, `Union`, `Concat`, `Star`, `Plus`, `Opt`.

2. **Step-by-Step Construction Preview**
   - Show how the ε-NFA is built from the AST before rendering the final graph.
   - Capture incremental NFA fragments for each regex operator and construction rule.
   - Present a stepper with labeled build steps and an intermediate diagram for each stage.
   - Only show the final complete automaton after the user has reviewed the construction sequence.

3. **Thompson's Construction for ε-NFA**
   - Build an ε-NFA from the AST.
   - Implement NFA fragment constructors for:
     - literal characters
     - epsilon transitions
     - union
     - concatenation
     - Kleene star
     - plus
     - optional
   - Represent transitions as objects with `from`, `label`, and `to`.

3. **Subset Construction for DFA Conversion**
   - Convert the generated ε-NFA into an equivalent DFA.
   - Compute ε-closures and move transitions.
   - Build DFA states from sets of NFA states and produce transitions on the input alphabet.
   - Mark DFA accepting states as those containing the NFA accept state.

4. **Visualization with SVG**
   - Render the ε-NFA and DFA as SVG diagrams.
   - Display each state with a circle, label, start arrow, and accept-state ring.
   - Render transitions as straight lines, curved edges for bidirectional links, and self-loops.
   - Label transitions with their symbols or `ε`.
   - Provide pan and zoom support for the SVG canvas.

5. **Interactive UI**
   - Input field for regex entry and a `Build` button.
   - Quick example buttons for sample regexes.
   - Toggle controls for:
     - showing the DFA
     - showing ε-transitions
   - Tabbed canvas view for:
     - ε-NFA visualization
     - DFA visualization
     - transition table
   - Download the current SVG diagram.

6. **Transition Tables**
   - Show an ε-NFA transition table with all states and labels.
   - Show a DFA transition table with one row per DFA state.
   - Highlight start and accept states in the tables.

7. **Simulation Mode**
   - Allow users to enter a test string.
   - Simulate the string on the DFA.
   - Show step-by-step execution with a tape display and log.
   - Support next/previous step controls and autoplay.
   - Display clear accept/reject results.

8. **Construction Steps Display**
   - Present parser/construction steps in a timeline or card layout.
   - Explain each parsed operator and construction decision.

9. **Responsive Styling**
   - Use modern CSS styling with gradient backgrounds, cards, and clean typography.
   - Ensure the layout works at desktop widths and smaller screens.
   - Include a polished information panel with icons and stats.

## File Structure

- `index.html` — the application shell, layout, and controls.
- `style.css` — the UI styling, responsive layout, and SVG theme.
- `automata.js` — all parsing, construction, DFA conversion, rendering, and simulation logic.
- `README.md` — this project overview and replication prompt.

## Detailed Implementation Notes

### Tokenizer
- Convert the regex string into token objects.
- Support parentheses, union, star, plus, optional, epsilon, and literal symbols.
- Ignore whitespace.

### Parser
- Implement a recursive descent parser with methods for `parseExpr`, `parseTerm`, `parseFactor`, and `parseAtom`.
- Construct step metadata for each parse operation.
- Throw errors for invalid syntax, missing parentheses, or unexpected tokens.

### NFA Construction
- Assign new numeric state IDs from a global counter.
- Build NFA fragments with `makeNFA(start, accept, transitions)`.
- Combine fragments using ε-transitions for union, concatenation, star, plus, and optional.
- Record the intermediate NFA fragment after each construction step for a visual build trace.

### DFA Construction
- Compute the alphabet from NFA transitions excluding `ε`.
- Create DFA states from sorted ε-closure arrays.
- Map closure keys to DFA state IDs.
- Generate deterministic transitions for each symbol.

### Layout Engine
- Compute node positions with a simple hierarchical left-to-right layout.
- Use BFS levels for state ordering and spacing.
- Assign x/y coordinates to states for both NFA and DFA.

### SVG Rendering
- Draw states, accept rings, start arrows, edges, and labels.
- Use different CSS classes for epsilon edges, active states, and active transitions.
- Render curved edges when reverse transitions exist.
- Allow resetting and zooming the view.

### Simulation
- Walk the DFA sequentially for each character.
- Record steps including transitions, current state, and acceptance/rejection.
- Render a tape with the current position and consumed symbols.
- Display a simulation log and result badge.

## How to Run

1. Open `index.html` in a modern browser, or serve the folder with a local web server.
2. Enter a regular expression such as `(a|b)*abb`.
3. Click `Build` to generate the ε-NFA and DFA.
4. Use the simulation tab to test input strings.

## Example Regexes

- `(a|b)*abb`
- `a*b+`
- `(a|b)+`
- `ab*c`
- `a(bc)*d`
- `(a|ε)b`

## Prompt for Replication

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
